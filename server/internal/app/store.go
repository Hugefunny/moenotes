// Package app is the deploy server: it serves the live build from the data volume and installs a new build
// whenever the asset service publishes a release or a new image brings changed code. Rendering runs on GitHub
// Actions; a failed build never replaces the live one.
package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/artifact"
	"github.com/StarMoe-org/moenotes/server/internal/config"
	"github.com/StarMoe-org/moenotes/server/internal/finalize"
	"github.com/StarMoe-org/moenotes/server/internal/github"
	"github.com/StarMoe-org/moenotes/server/internal/logx"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/web"
)

// Data volume layout:
//
//	state.json               the live build
//	github-build.json        the dispatched Actions run, so a restart attaches to it instead of dispatching again
//	builds/<id>/site/        the web root; precompressed variants are added once it is live
//	builds/<id>/files.json   size + SHA-256 per file, for the next build's link step
//	builds/.staging-<id>/    a build being installed; removed on failure and at startup
//	logs/<id>.log            installation and compression output of each attempt
//	logs/latest.log          link to the newest attempt's log
//
// Ids start with a UTC timestamp, so they sort by age.

// Record describes an installed build (state.json's `current`).
type Record struct {
	ID         string `json:"id"`
	Key        string `json:"key"`
	Revision   string `json:"revision"`
	Data       string `json:"data"`
	BuiltAt    string `json:"builtAt"`
	DurationMs int64  `json:"durationMs"`
	Pages      int64  `json:"pages,omitempty"`
	// Stage, LocalesRendered and PendingRest come from the earlier split-locale rollout. CI builds are always full;
	// a record still marked pendingRest is replaced by the next build.
	Stage           string   `json:"stage,omitempty"`
	LocalesRendered []string `json:"localesRendered,omitempty"`
	PendingRest     bool     `json:"pendingRest,omitempty"`
}

type state struct {
	Current *Record `json:"current"`
}

const (
	stagingPrefix    = ".staging-"
	latestLog        = "latest.log"
	stepCompressWait = "waiting for the live build's compression"
	stepFinalize     = "finalize"
	progressInterval = 30 * time.Second
)

// Progress is a running build as the status endpoint and the periodic console line report it.
type Progress struct {
	ID      string `json:"id"`
	Step    string `json:"step"`
	Pages   int64  `json:"pages"`
	started time.Time
}

// Compressing reports the background compression.
type Compressing struct {
	ID        string `json:"id"`
	StartedAt string `json:"startedAt"`
}

// Store owns the builds on the data volume.
type Store struct {
	cfg *config.Config
	// HTTP downloads Release parts; never carries credentials.
	HTTP  *http.Client
	site  *siteconfig.Site
	Roots *web.RootSource

	mu          sync.Mutex
	current     *Record
	progress    *Progress
	compressing *Compressing
	// compression is closed once the latest scheduled compression has finished.
	compression chan struct{}
	// life is cancelled on shutdown; it stops installation and compression.
	life context.Context
}

// NewStore creates a store; life bounds its background work.
func NewStore(life context.Context, cfg *config.Config, site *siteconfig.Site) *Store {
	done := make(chan struct{})
	close(done)
	return &Store{cfg: cfg, site: site, HTTP: &http.Client{}, Roots: &web.RootSource{}, compression: done, life: life}
}

func (s *Store) buildDir(id string) string { return filepath.Join(s.cfg.BuildsDir, id) }
func (s *Store) siteDir(id string) string  { return filepath.Join(s.buildDir(id), "site") }

// Current is the live build, or nil.
func (s *Store) Current() *Record {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return nil
	}
	copy := *s.current
	return &copy
}

// Snapshot returns the progress and compression for the status endpoint.
func (s *Store) Snapshot() (*Progress, *Compressing) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var progress *Progress
	if s.progress != nil {
		copy := *s.progress
		progress = &copy
	}
	var compressing *Compressing
	if s.compressing != nil {
		copy := *s.compressing
		compressing = &copy
	}
	return progress, compressing
}

// Load reads the state and lists builds; quick enough to run before the HTTP server starts.
func (s *Store) Load() error {
	for _, dir := range []string{s.cfg.BuildsDir, s.cfg.LogsDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	saved := readState(s.cfg.StatePath)
	if saved.Current != nil && saved.Current.ID != "" && !strings.ContainsAny(saved.Current.ID, `/\`) {
		if info, err := os.Stat(filepath.Join(s.siteDir(saved.Current.ID), "index.html")); err == nil && info.Mode().IsRegular() {
			s.current = saved.Current
		} else {
			logx.Printf("build %s from state.json is missing on disk; starting without one", saved.Current.ID)
		}
	}
	return s.refreshRoots()
}

// An unreadable state file means no live build (the next check rebuilds), not a crash loop.
func readState(path string) state {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return state{}
	}
	var saved state
	if err == nil {
		err = json.Unmarshal(raw, &saved)
	}
	if err != nil {
		logx.Printf("ignoring unreadable %s: %v", path, err)
		return state{}
	}
	return saved
}

// CleanUp removes leftovers of interrupted builds, prunes old builds and resumes an interrupted compression.
func (s *Store) CleanUp() error {
	entries, err := os.ReadDir(s.cfg.BuildsDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), stagingPrefix) {
			if err := os.RemoveAll(filepath.Join(s.cfg.BuildsDir, entry.Name())); err != nil {
				return err
			}
		}
	}
	err = s.Prune()
	s.startCompression()
	return err
}

func (s *Store) setStep(step string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.progress != nil {
		s.progress.Step = step
	}
}

func (s *Store) describeProgress() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.progress == nil {
		return ""
	}
	return fmt.Sprintf("%s, %s elapsed", s.progress.Step, logx.Duration(time.Since(s.progress.started)))
}

// Homepages are the locale home pages every installed build must contain.
func (s *Store) Homepages() []string {
	var pages []string
	for _, locale := range s.site.Locales() {
		if locale.Prefix == "" {
			pages = append(pages, "index.html")
		} else {
			pages = append(pages, locale.Prefix+"/index.html")
		}
	}
	return pages
}

// Build waits for the CI build of key (dispatching it when needed), installs it into a staging directory and links
// it against the live build. The result still has to be activated.
func (s *Store) Build(ctx context.Context, client *github.Client, expected artifact.Expected) (record Record, err error) {
	started := time.Now()
	id := fmt.Sprintf("%s-%s-github", started.UTC().Format("20060102T150405Z"), expected.Key[:8])
	staging := filepath.Join(s.cfg.BuildsDir, stagingPrefix+id)
	logPath := filepath.Join(s.cfg.LogsDir, id+".log")
	logFile, err := os.Create(logPath)
	if err != nil {
		return Record{}, err
	}
	logLine := func(format string, args ...any) {
		_, _ = fmt.Fprintf(logFile, "%s %s\n", time.Now().UTC().Format(time.RFC3339), fmt.Sprintf(format, args...))
	}
	defer logFile.Close()
	if err := s.linkLatestLog(logPath); err != nil {
		logx.Printf("could not update %s: %v", latestLog, err)
	}

	s.mu.Lock()
	s.progress = &Progress{ID: id, started: started}
	s.mu.Unlock()
	ctx, cancel := context.WithTimeout(ctx, s.cfg.BuildTimeout)
	defer cancel()
	ticker := time.NewTicker(progressInterval)
	tickerDone := make(chan struct{})
	go func() {
		for {
			select {
			case <-tickerDone:
				return
			case <-ticker.C:
				logx.Printf("build %s: %s", id, s.describeProgress())
			}
		}
	}()
	defer func() {
		ticker.Stop()
		close(tickerDone)
		s.mu.Lock()
		s.progress = nil
		s.mu.Unlock()
		if err != nil {
			_ = os.RemoveAll(staging)
			logLine("failed: %v", err)
			err = fmt.Errorf("%w (log: %s)", err, logPath)
		}
	}()

	logLine("build %s (%s, revision %s, commit %s)", id, expected.Data.Label, expected.Revision, expected.Commit)
	source, err := client.Wait(ctx, expected, s.site.LocaleCodes(), func(step string) {
		s.mu.Lock()
		changed := s.progress != nil && s.progress.Step != step
		if s.progress != nil {
			s.progress.Step = step
		}
		s.mu.Unlock()
		if changed {
			logLine("%s", step)
			logx.Printf("build %s: %s", id, step)
		}
	})
	if err != nil {
		return Record{}, err
	}
	manifest := source.Manifest
	s.setStep("downloading and verifying Release")
	logLine("installing %d part(s), %d bytes compressed, %d files", len(manifest.Parts), manifest.Size, manifest.Files)
	if err := os.MkdirAll(staging, 0o755); err != nil {
		return Record{}, err
	}
	if err := artifact.Install(ctx, s.HTTP, *source, staging, s.Homepages()); err != nil {
		return Record{}, err
	}
	s.mu.Lock()
	s.progress.Pages = manifest.Pages
	s.mu.Unlock()

	// Unchanged files are linked together with the live build's variants, so those must be complete.
	s.setStep(stepCompressWait)
	if err := s.waitCompression(ctx); err != nil {
		return Record{}, err
	}
	s.setStep(stepFinalize)
	var previous *finalize.Previous
	if current := s.Current(); current != nil {
		previousManifest, err := finalize.ReadManifest(filepath.Join(s.buildDir(current.ID), "files.json"))
		if err != nil {
			logLine("ignoring the live build's files.json: %v", err)
		} else if previousManifest != nil {
			previous = &finalize.Previous{Site: s.siteDir(current.ID), Manifest: previousManifest}
		}
	}
	linkStarted := time.Now()
	linked, err := finalize.Link(ctx, filepath.Join(staging, "site"), previous)
	if err != nil {
		return Record{}, err
	}
	if err := finalize.WriteManifest(filepath.Join(staging, "files.json"), linked.Manifest); err != nil {
		return Record{}, err
	}
	logLine("[finalize] %d files: %d unchanged (linked to the live build), %.1fs", linked.Files, linked.Linked, time.Since(linkStarted).Seconds())
	if err := ctx.Err(); err != nil {
		return Record{}, err
	}
	if err := os.Rename(staging, s.buildDir(id)); err != nil {
		return Record{}, err
	}
	return Record{
		ID: id, Key: expected.Key, Revision: expected.Revision, Data: expected.Data.Label, BuiltAt: manifest.BuiltAt,
		DurationMs: time.Since(started).Milliseconds(), Pages: manifest.Pages, Stage: "full",
		LocalesRendered: append([]string(nil), manifest.Locales...),
	}, nil
}

// Activate makes an installed build live: state.json first, then the roots new requests read. Its files go out as
// they are until the background compression has added their variants.
func (s *Store) Activate(record Record) error {
	raw, err := json.MarshalIndent(state{Current: &record}, "", "  ")
	if err != nil {
		return err
	}
	temp := s.cfg.StatePath + ".tmp"
	if err := os.WriteFile(temp, append(raw, '\n'), 0o644); err != nil {
		return err
	}
	if err := os.Rename(temp, s.cfg.StatePath); err != nil {
		return err
	}
	s.mu.Lock()
	s.current = &record
	s.mu.Unlock()
	if err := s.refreshRoots(); err != nil {
		return err
	}
	s.startCompression()
	return nil
}

// Prune keeps KeepBuilds builds: the live one, the one before it in full (responses may still be streaming from it,
// and it is a ready rollback), and older ones reduced to `_astro/`. Hard links keep shared files alive.
func (s *Store) Prune() error {
	ids, err := s.buildIDs()
	if err != nil {
		return err
	}
	current := s.Current()
	var others []string
	for _, id := range ids {
		if current == nil || id != current.ID {
			others = append(others, id)
		}
	}
	var errs []error
	for index, id := range others {
		switch {
		case index == 0:
		case index < s.cfg.KeepBuilds-1:
			errs = append(errs, s.reduceToAstro(id))
		default:
			errs = append(errs, os.RemoveAll(s.buildDir(id)))
		}
	}
	if entries, err := os.ReadDir(s.cfg.LogsDir); err == nil {
		var logs []string
		for _, entry := range entries {
			if strings.HasSuffix(entry.Name(), ".log") && entry.Name() != latestLog {
				logs = append(logs, entry.Name())
			}
		}
		sort.Sort(sort.Reverse(sort.StringSlice(logs)))
		for _, name := range logs[min(len(logs), s.cfg.KeepLogs):] {
			errs = append(errs, os.Remove(filepath.Join(s.cfg.LogsDir, name)))
		}
	}
	errs = append(errs, s.refreshRoots())
	return errors.Join(errs...)
}

func (s *Store) reduceToAstro(id string) error {
	_ = os.Remove(filepath.Join(s.buildDir(id), "files.json"))
	entries, err := os.ReadDir(s.siteDir(id))
	if err != nil {
		return nil
	}
	var errs []error
	for _, entry := range entries {
		if entry.Name() != "_astro" {
			errs = append(errs, os.RemoveAll(filepath.Join(s.siteDir(id), entry.Name())))
		}
	}
	return errors.Join(errs...)
}

// buildIDs lists finished builds, newest first.
func (s *Store) buildIDs() ([]string, error) {
	entries, err := os.ReadDir(s.cfg.BuildsDir)
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, entry := range entries {
		if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
			ids = append(ids, entry.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(ids)))
	return ids, nil
}

func (s *Store) refreshRoots() error {
	ids, err := s.buildIDs()
	if err != nil {
		return err
	}
	current := s.Current()
	roots := web.Roots{}
	if current != nil {
		roots.Current = s.siteDir(current.ID)
	}
	for _, id := range ids {
		if current == nil || id != current.ID {
			roots.Previous = append(roots.Previous, s.siteDir(id))
		}
	}
	s.Roots.Store(roots)
	return nil
}

// linkLatestLog points logs/latest.log at a new attempt's log (a hard link where symlinks are not allowed).
func (s *Store) linkLatestLog(logPath string) error {
	latest := filepath.Join(s.cfg.LogsDir, latestLog)
	temp := latest + ".tmp"
	_ = os.Remove(temp)
	if err := os.Symlink(filepath.Base(logPath), temp); err != nil {
		if err := os.Link(logPath, temp); err != nil {
			return err
		}
	}
	return os.Rename(temp, latest)
}

// startCompression queues the live build's missing variants behind any compression already running.
func (s *Store) startCompression() {
	current := s.Current()
	if current == nil {
		return
	}
	s.mu.Lock()
	previous := s.compression
	done := make(chan struct{})
	s.compression = done
	s.mu.Unlock()
	go func() {
		defer close(done)
		select {
		case <-previous:
		case <-s.life.Done():
			return
		}
		s.compress(current.ID)
	}()
}

// waitCompression returns once every queued compression has finished.
func (s *Store) waitCompression(ctx context.Context) error {
	s.mu.Lock()
	done := s.compression
	s.mu.Unlock()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return context.Cause(ctx)
	}
}

func (s *Store) compress(id string) {
	logPath := filepath.Join(s.cfg.LogsDir, id+".log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		logFile = nil
	}
	write := func(format string, args ...any) {
		if logFile != nil {
			_, _ = fmt.Fprintf(logFile, "%s %s\n", time.Now().UTC().Format(time.RFC3339), fmt.Sprintf(format, args...))
		}
	}
	s.mu.Lock()
	s.compressing = &Compressing{ID: id, StartedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	s.mu.Unlock()
	started := time.Now()
	result, err := finalize.Compress(s.life, s.siteDir(id), s.cfg.CompressWorkers)
	s.mu.Lock()
	s.compressing = nil
	s.mu.Unlock()
	if err != nil {
		if s.life.Err() == nil {
			logx.Printf("compressing build %s failed; it resumes at the next start or build: %v (log: %s)", id, err, logPath)
		}
		write("[finalize] compression stopped: %v", err)
	} else {
		write("[finalize] %d files: %d compressed, %.1fs", result.Files, result.Compressed, time.Since(started).Seconds())
		if result.Compressed > 0 {
			logx.Printf("build %s: compressed %d files in %s", id, result.Compressed, logx.Duration(time.Since(started)))
		}
	}
	if logFile != nil {
		_ = logFile.Close()
	}
}
