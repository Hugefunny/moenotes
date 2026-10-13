// Package github dispatches the site build workflow and waits for its published Release.
//
// The token (Actions read/write, Contents read) is sent only to api.github.com. Release assets are downloaded
// without credentials, from URLs that must name this repository's Release.
package github

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/artifact"
	"github.com/StarMoe-org/moenotes/server/internal/upstream"
)

const (
	apiBase        = "https://api.github.com"
	discoveryGrace = 5 * time.Minute
	maxInputBytes  = 65_535
	maxPublicBytes = 48_000
)

// Options configures a Client.
type Options struct {
	Repo     string
	Ref      string
	Commit   string
	Token    string
	Workflow string
	// PendingPath persists the dispatched run across restarts.
	PendingPath string
	Poll        time.Duration
	// Environ is the process environment the PUBLIC_* build settings are read from.
	Environ []string
	// API overrides the GitHub API origin (tests).
	API string
	// HTTP sends API and asset requests.
	HTTP *http.Client
}

// Client talks to one repository.
type Client struct{ options Options }

// New creates a Client.
func New(options Options) *Client {
	if options.API == "" {
		options.API = apiBase
	}
	if options.HTTP == nil {
		options.HTTP = &http.Client{}
	}
	if options.Workflow == "" {
		options.Workflow = "build-site.yml"
	}
	return &Client{options: options}
}

type run struct {
	ID           int64   `json:"id"`
	DisplayTitle string  `json:"display_title"`
	Status       string  `json:"status"`
	Conclusion   *string `json:"conclusion"`
	CreatedAt    string  `json:"created_at"`
}

type release struct {
	Draft   bool   `json:"draft"`
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

type pending struct {
	Key          string `json:"key"`
	DispatchedAt int64  `json:"dispatchedAt"`
	RunID        int64  `json:"runId,omitempty"`
}

var (
	repoPattern   = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
	commitPattern = regexp.MustCompile(`^[a-f0-9]{40}$`)
	keyPattern    = regexp.MustCompile(`^[a-f0-9]{16}$`)
	publicName    = regexp.MustCompile(`^PUBLIC_[A-Z0-9_]+$`)
)

// PublicEnvironment encodes the PUBLIC_* build settings for the workflow input. Nothing else of the server
// environment is ever forwarded.
func PublicEnvironment(environ []string) (string, error) {
	values := map[string]string{}
	for _, entry := range upstream.PublicEnvironment(environ) {
		if !publicName.MatchString(entry[0]) || len(entry[1]) > 8192 || strings.ContainsRune(entry[1], 0) {
			return "", errors.New("invalid PUBLIC_* build settings")
		}
		values[entry[0]] = entry[1]
	}
	if len(values) > 100 {
		return "", errors.New("more than 100 PUBLIC_* build settings")
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	if len(raw) > maxPublicBytes {
		return "", errors.New("PUBLIC_* settings exceed the Actions input budget")
	}
	return string(raw), nil
}

// AssetURL checks that a Release asset URL names this repository's tag and asset.
func AssetURL(repo, tag, asset, raw string) (string, error) {
	expected := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", repo, tag, asset)
	if raw != expected {
		return "", fmt.Errorf("unexpected Release asset URL for %s", asset)
	}
	return raw, nil
}

// errNotFound marks a 404 the caller allows.
var errNotFound = errors.New("not found")

func (c *Client) api(ctx context.Context, method, path string, body any, into any, allowMissing bool) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		payload = bytes.NewReader(raw)
	}
	request, err := http.NewRequestWithContext(ctx, method, c.options.API+"/repos/"+c.options.Repo+path, payload)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+c.options.Token)
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	request.Header.Set("User-Agent", "moenotes-site-builder")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	client := *c.options.HTTP
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("redirect refused") }
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if allowMissing && response.StatusCode == http.StatusNotFound {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<16))
		return errNotFound
	}
	// Never echo response bodies or request inputs: they may contain deployment settings.
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<16))
		return fmt.Errorf("GitHub %s %s failed (HTTP %d)", method, strings.SplitN(path, "?", 2)[0], response.StatusCode)
	}
	if into == nil || response.StatusCode == http.StatusNoContent {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<16))
		return nil
	}
	return json.NewDecoder(io.LimitReader(response.Body, 16<<20)).Decode(into)
}

func (c *Client) save(state pending) error {
	if err := os.MkdirAll(filepath.Dir(c.options.PendingPath), 0o755); err != nil {
		return err
	}
	raw, err := json.Marshal(state)
	if err != nil {
		return err
	}
	temp := c.options.PendingPath + ".tmp"
	if err := os.WriteFile(temp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(temp, c.options.PendingPath)
}

func (c *Client) clear() { _ = os.Remove(c.options.PendingPath) }

func (c *Client) load(key string) (*pending, error) {
	raw, err := os.ReadFile(c.options.PendingPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var state pending
	if err := json.Unmarshal(raw, &state); err != nil || state.Key == "" || state.DispatchedAt <= 0 || state.RunID < 0 {
		return nil, errors.New("invalid persisted GitHub build state; inspect github-build.json")
	}
	if state.Key != key {
		return nil, nil
	}
	return &state, nil
}

func (c *Client) runs(ctx context.Context, key string) ([]run, error) {
	var matches []run
	for page := 1; page <= 3; page++ {
		var response struct {
			WorkflowRuns []run `json:"workflow_runs"`
		}
		path := fmt.Sprintf("/actions/workflows/%s/runs?event=workflow_dispatch&per_page=100&page=%d", c.options.Workflow, page)
		if err := c.api(ctx, http.MethodGet, path, nil, &response, false); err != nil {
			return nil, err
		}
		for _, item := range response.WorkflowRuns {
			if item.DisplayTitle == "site-"+key {
				matches = append(matches, item)
			}
		}
		if len(response.WorkflowRuns) < 100 {
			break
		}
	}
	sort.Slice(matches, func(i, j int) bool { return matches[i].ID > matches[j].ID })
	return matches, nil
}

func (c *Client) runByID(ctx context.Context, id int64, key string) (*run, error) {
	var item run
	err := c.api(ctx, http.MethodGet, fmt.Sprintf("/actions/runs/%d", id), nil, &item, true)
	if errors.Is(err, errNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if item.DisplayTitle != "site-"+key {
		return nil, errors.New("persisted Actions run identity does not match the requested build")
	}
	return &item, nil
}

// Release returns the published build of expected, or nil when there is none yet.
func (c *Client) Release(ctx context.Context, expected artifact.Expected, locales []string) (*artifact.Source, error) {
	tag := "site-" + expected.Key
	var published release
	err := c.api(ctx, http.MethodGet, "/releases/tags/"+tag, nil, &published, true)
	if errors.Is(err, errNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if published.Draft {
		return nil, nil
	}
	if published.TagName != tag {
		return nil, errors.New("unexpected Release tag")
	}
	asset := func(name string) (string, error) {
		var found []string
		for _, item := range published.Assets {
			if item.Name == name {
				found = append(found, item.URL)
			}
		}
		if len(found) != 1 {
			return "", fmt.Errorf("published Release must contain exactly one %s", name)
		}
		return AssetURL(c.options.Repo, tag, name, found[0])
	}
	manifestURL, err := asset(artifact.ManifestName)
	if err != nil {
		// A Release in the format of the previous server (site.tar.gz) is not installable; build it again.
		for _, item := range published.Assets {
			if item.Name == "site.tar.gz" {
				return nil, errors.New("the Release holds a schema 1 archive (site.tar.gz); delete Release " + tag + " and its tag to rebuild it")
			}
		}
		return nil, err
	}
	raw, err := c.download(ctx, manifestURL, artifact.MaxManifestBytes)
	if err != nil {
		return nil, fmt.Errorf("release manifest: %w", err)
	}
	manifest, err := artifact.ParseManifest(raw, expected, locales)
	if err != nil {
		return nil, err
	}
	source := &artifact.Source{Manifest: manifest}
	for _, part := range manifest.Parts {
		partURL, err := asset(part.Name)
		if err != nil {
			return nil, err
		}
		source.PartURLs = append(source.PartURLs, partURL)
	}
	return source, nil
}

// download fetches a small public asset without credentials.
func (c *Client) download(ctx context.Context, url string, limit int64) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("User-Agent", "moenotes-site-builder")
	response, err := c.options.HTTP.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", response.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > limit {
		return nil, errors.New("too large")
	}
	return raw, nil
}

// Wait returns the published build of expected: an existing Release, or one produced by a workflow run it finds or
// dispatches. report receives each step for the status endpoint.
func (c *Client) Wait(ctx context.Context, expected artifact.Expected, locales []string, report func(string)) (*artifact.Source, error) {
	o := c.options
	if o.Token == "" {
		return nil, errors.New("MOENOTES_GITHUB_TOKEN is required: the site is built by GitHub Actions")
	}
	if !repoPattern.MatchString(o.Repo) || !commitPattern.MatchString(o.Commit) {
		return nil, errors.New("set a valid MOENOTES_GITHUB_REPO and the image's full MOENOTES_REVISION commit SHA")
	}
	if expected.Commit != o.Commit || !keyPattern.MatchString(expected.Key) || !keyPattern.MatchString(expected.Revision) {
		return nil, errors.New("invalid GitHub build identity")
	}
	publicEnv, err := PublicEnvironment(o.Environ)
	if err != nil {
		return nil, err
	}
	report("checking GitHub Release")
	if ready, err := c.Release(ctx, expected, locales); err != nil || ready != nil {
		return ready, err
	}
	state, err := c.load(expected.Key)
	if err != nil {
		return nil, err
	}
	var current *run
	if state != nil && state.RunID > 0 {
		if current, err = c.runByID(ctx, state.RunID, expected.Key); err != nil {
			return nil, err
		}
	}
	if current == nil {
		runs, err := c.runs(ctx, expected.Key)
		if err != nil {
			return nil, err
		}
		for i := range runs {
			if runs[i].Status != "completed" {
				current = &runs[i]
				break
			}
		}
	}
	now := time.Now()
	switch {
	case current != nil:
		dispatched := now.UnixMilli()
		if state != nil {
			dispatched = state.DispatchedAt
		}
		state = &pending{Key: expected.Key, DispatchedAt: dispatched, RunID: current.ID}
		if err := c.save(*state); err != nil {
			return nil, err
		}
	case state == nil || now.Sub(time.UnixMilli(state.DispatchedAt)) > discoveryGrace:
		// Persist before dispatch: a restart or an ambiguous network error must not immediately dispatch twice.
		state = &pending{Key: expected.Key, DispatchedAt: now.UnixMilli()}
		if err := c.save(*state); err != nil {
			return nil, err
		}
		report("dispatching GitHub Actions")
		payload := map[string]any{"ref": o.Ref, "inputs": map[string]string{
			"key": expected.Key, "revision": expected.Revision, "commit": o.Commit,
			"fingerprint": expected.Data.Fingerprint, "public_env": publicEnv,
		}}
		if raw, _ := json.Marshal(payload); len(raw) > maxInputBytes {
			return nil, errors.New("GitHub dispatch inputs exceed 65535 bytes")
		}
		var dispatched struct {
			WorkflowRunID int64 `json:"workflow_run_id"`
		}
		if err := c.api(ctx, http.MethodPost, "/actions/workflows/"+o.Workflow+"/dispatches", payload, &dispatched, false); err != nil {
			return nil, err
		}
		if dispatched.WorkflowRunID > 0 {
			state.RunID = dispatched.WorkflowRunID
			if err := c.save(*state); err != nil {
				return nil, err
			}
		}
	}

	for {
		if err := ctx.Err(); err != nil {
			return nil, context.Cause(ctx)
		}
		ready, err := c.Release(ctx, expected, locales)
		if err != nil {
			return nil, err
		}
		if ready != nil {
			c.clear()
			return ready, nil
		}
		current = nil
		if state.RunID > 0 {
			if current, err = c.runByID(ctx, state.RunID, expected.Key); err != nil {
				return nil, err
			}
		} else {
			runs, err := c.runs(ctx, expected.Key)
			if err != nil {
				return nil, err
			}
			for i := range runs {
				created, _ := time.Parse(time.RFC3339, runs[i].CreatedAt)
				if runs[i].Status != "completed" || (!created.IsZero() && created.UnixMilli() >= state.DispatchedAt-5000) {
					current = &runs[i]
					break
				}
			}
			if current != nil {
				state.RunID = current.ID
				if err := c.save(*state); err != nil {
					return nil, err
				}
			}
		}
		if current != nil && current.Status == "completed" {
			// Publication is the workflow's last step, so success without a Release is an error too.
			ready, err := c.Release(ctx, expected, locales)
			c.clear()
			if err != nil || ready != nil {
				return ready, err
			}
			conclusion := "unknown"
			if current.Conclusion != nil {
				conclusion = *current.Conclusion
			}
			return nil, fmt.Errorf("GitHub Actions run %d finished (%s) without a usable Release", current.ID, conclusion)
		}
		if current == nil && time.Since(time.UnixMilli(state.DispatchedAt)) > discoveryGrace {
			return nil, errors.New("dispatched Actions run not found after 5 minutes; the retry reconciles before dispatching")
		}
		if current != nil {
			report(fmt.Sprintf("GitHub Actions %d: %s", current.ID, current.Status))
		} else {
			report("waiting for GitHub Actions to start")
		}
		select {
		case <-ctx.Done():
			return nil, context.Cause(ctx)
		case <-time.After(o.Poll):
		}
	}
}
