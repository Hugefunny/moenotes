package app

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/artifact"
	"github.com/StarMoe-org/moenotes/server/internal/config"
	"github.com/StarMoe-org/moenotes/server/internal/github"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/upstream"
)

func testConfig(t *testing.T) *config.Config {
	t.Helper()
	dir := t.TempDir()
	return &config.Config{
		DataDir: dir, BuildsDir: filepath.Join(dir, "builds"), LogsDir: filepath.Join(dir, "logs"),
		StatePath: filepath.Join(dir, "state.json"), PendingPath: filepath.Join(dir, "github-build.json"),
		GithubRepo: "StarMoe-org/moenotes", GithubCommit: strings.Repeat("a", 40), GithubPoll: time.Millisecond,
		BuildTimeout: time.Minute, KeepBuilds: 3, KeepLogs: 10, CompressWorkers: 2,
	}
}

var expected = artifact.Expected{Key: "0123456789abcdef", Revision: "abcdef0123456789", Commit: strings.Repeat("a", 40),
	Data: upstream.DataVersion{Fingerprint: "tw:1:1:en=x", Label: "tw@1"}}

func TestMissingTokenKeepsLiveSite(t *testing.T) {
	cfg := testConfig(t)
	store := NewStore(context.Background(), cfg, siteconfig.Current())
	if err := store.Load(); err != nil {
		t.Fatal(err)
	}
	live := Record{ID: "previous", Key: "old"}
	store.current = &live
	client := github.New(github.Options{Repo: cfg.GithubRepo, Commit: cfg.GithubCommit, PendingPath: cfg.PendingPath})
	_, err := store.Build(context.Background(), client, expected)
	if err == nil || !strings.Contains(err.Error(), "MOENOTES_GITHUB_TOKEN") {
		t.Fatalf("got %v", err)
	}
	if store.Current().ID != "previous" {
		t.Fatal("the live build must stay")
	}
	if progress, _ := store.Snapshot(); progress != nil {
		t.Fatal("progress must be cleared")
	}
	entries, _ := os.ReadDir(cfg.BuildsDir)
	if len(entries) != 0 {
		t.Fatalf("no staging may remain: %v", entries)
	}
	if _, err := os.Lstat(filepath.Join(cfg.LogsDir, "latest.log")); err != nil {
		t.Fatal("latest.log should name the attempt")
	}
}

func writeSite(t *testing.T, root string, marker string) {
	t.Helper()
	files := map[string]string{"_astro/app.js": strings.Repeat("console.log(1);", 200)}
	for _, home := range NewStore(context.Background(), &config.Config{}, siteconfig.Current()).Homepages() {
		files[home] = "<!doctype html>" + strings.Repeat("<p>page</p>", 200) + marker
	}
	files["shared/index.html"] = "<!doctype html>" + strings.Repeat("<p>shared</p>", 200)
	for name, content := range files {
		file := filepath.Join(root, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// fakeGitHub packs site and serves the API (Release lookup), the manifest and the parts from a local TLS server
// that answers for api.github.com and github.com alike. The returned client carries the routing transport.
func fakeGitHub(t *testing.T, site string, key artifact.Expected) (*github.Client, *http.Client) {
	t.Helper()
	release := filepath.Join(t.TempDir(), "release")
	var prefixes []string
	for _, locale := range siteconfig.Current().Locales() {
		prefixes = append(prefixes, locale.Prefix)
	}
	packed, err := artifact.Pack(context.Background(), site, release, artifact.PackOptions{LocalePrefixes: prefixes, PartBytes: 1024})
	if err != nil {
		t.Fatal(err)
	}
	manifest, _ := json.Marshal(artifact.Manifest{Schema: artifact.Schema, Key: key.Key, Revision: key.Revision, Commit: key.Commit,
		Data: key.Data, BuiltAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), Locales: siteconfig.Current().LocaleCodes(),
		Format: artifact.Format, Size: packed.Size, SHA256: packed.SHA256, Parts: packed.Parts, Files: packed.Files,
		ExpandedBytes: packed.ExpandedBytes, Pages: packed.Pages})
	tag := "site-" + key.Key
	base := "https://github.com/StarMoe-org/moenotes/releases/download/" + tag + "/"
	assets := []map[string]string{{"name": artifact.ManifestName, "browser_download_url": base + artifact.ManifestName}}
	for _, part := range packed.Parts {
		assets = append(assets, map[string]string{"name": part.Name, "browser_download_url": base + part.Name})
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/releases/tags/"+tag):
			_ = json.NewEncoder(w).Encode(map[string]any{"tag_name": tag, "draft": false, "assets": assets})
		case strings.HasSuffix(r.URL.Path, "/"+artifact.ManifestName):
			_, _ = w.Write(manifest)
		default:
			http.ServeFile(w, r, filepath.Join(release, filepath.Base(r.URL.Path)))
		}
	}))
	t.Cleanup(server.Close)
	transport := server.Client().Transport.(*http.Transport).Clone()
	transport.TLSClientConfig.InsecureSkipVerify = true
	address := server.Listener.Addr().String()
	transport.DialContext = func(ctx context.Context, network, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, address)
	}
	httpClient := &http.Client{Transport: transport}
	client := github.New(github.Options{Repo: "StarMoe-org/moenotes", Commit: key.Commit, Token: "t",
		PendingPath: filepath.Join(t.TempDir(), "p.json"), Poll: time.Millisecond, HTTP: httpClient})
	return client, httpClient
}

func TestInstallActivateLinkAndPrune(t *testing.T) {
	cfg := testConfig(t)
	ctx := context.Background()
	store := NewStore(ctx, cfg, siteconfig.Current())
	if err := store.Load(); err != nil {
		t.Fatal(err)
	}
	var ids []string
	for index, marker := range []string{"one", "two", "three", "four"} {
		key := expected
		key.Key = strings.Repeat(string(rune('a'+index)), 16)
		site := filepath.Join(t.TempDir(), "site")
		writeSite(t, site, marker)
		client, httpClient := fakeGitHub(t, site, key)
		store.HTTP = httpClient
		record, err := store.Build(ctx, client, key)
		if err != nil {
			t.Fatalf("build %s: %v", marker, err)
		}
		if err := store.Activate(record); err != nil {
			t.Fatal(err)
		}
		if err := store.waitCompression(ctx); err != nil {
			t.Fatal(err)
		}
		if err := store.Prune(); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, record.ID)
		time.Sleep(1100 * time.Millisecond) // ids carry a one-second timestamp
	}
	current := store.Current()
	if current.ID != ids[3] || current.Stage != "full" || len(current.LocalesRendered) != len(siteconfig.Current().LocaleCodes()) {
		t.Fatalf("unexpected record %+v", current)
	}
	// The shared page is unchanged across builds: hard-linked, so it keeps its mtime (and ETag).
	first, _ := os.Stat(filepath.Join(store.siteDir(ids[2]), "shared", "index.html"))
	second, _ := os.Stat(filepath.Join(store.siteDir(ids[3]), "shared", "index.html"))
	if !os.SameFile(first, second) {
		t.Fatal("an unchanged file should be linked to the previous build")
	}
	if _, err := os.Stat(filepath.Join(store.siteDir(ids[3]), "index.html.br")); err != nil {
		t.Fatal("the live build should be compressed")
	}
	// KeepBuilds=3: live, previous in full, one more reduced to _astro/, the oldest removed.
	if _, err := os.Stat(store.buildDir(ids[0])); !os.IsNotExist(err) {
		t.Fatal("the oldest build should be removed")
	}
	if _, err := os.Stat(filepath.Join(store.siteDir(ids[1]), "index.html")); !os.IsNotExist(err) {
		t.Fatal("an older build should be reduced to _astro/")
	}
	if _, err := os.Stat(filepath.Join(store.siteDir(ids[1]), "_astro", "app.js")); err != nil {
		t.Fatal("an older build keeps _astro/")
	}
	if _, err := os.Stat(filepath.Join(store.siteDir(ids[2]), "index.html")); err != nil {
		t.Fatal("the previous build stays complete")
	}
	roots := store.Roots.Load()
	if roots.Current != store.siteDir(ids[3]) || len(roots.Previous) != 2 {
		t.Fatalf("roots %+v", roots)
	}
	// A restart reads the state back.
	again := NewStore(ctx, cfg, siteconfig.Current())
	if err := again.Load(); err != nil || again.Current().ID != ids[3] {
		t.Fatalf("reload: %v", err)
	}
}
