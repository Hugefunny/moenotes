package github

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/artifact"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/upstream"
)

const repo = "StarMoe-org/moenotes"

var (
	commit   = strings.Repeat("a", 40)
	expected = artifact.Expected{Key: "0123456789abcdef", Revision: "abcdef0123456789", Commit: commit,
		Data: upstream.DataVersion{Fingerprint: "tw:1:1:en=x", Label: "tw@1"}}
	tag     = "site-" + expected.Key
	locales = siteconfig.Current().LocaleCodes()
)

func manifestJSON() []byte {
	raw, _ := json.Marshal(artifact.Manifest{
		Schema: artifact.Schema, Key: expected.Key, Revision: expected.Revision, Commit: commit, Data: expected.Data,
		BuiltAt: "2026-10-05T12:00:00.000Z", Locales: locales, Format: artifact.Format, Size: 10,
		SHA256: strings.Repeat("b", 64), Parts: []artifact.Part{{Name: artifact.PartName(0), Size: 10, SHA256: strings.Repeat("c", 64)}},
		Files: 3, ExpandedBytes: 100, Pages: 2,
	})
	return raw
}

func assetURL(name string) string {
	return "https://github.com/" + repo + "/releases/download/" + tag + "/" + name
}

func releaseJSON(names ...string) map[string]any {
	var assets []map[string]string
	for _, name := range names {
		assets = append(assets, map[string]string{"name": name, "browser_download_url": assetURL(name)})
	}
	return map[string]any{"tag_name": tag, "draft": false, "assets": assets}
}

// fake routes API calls (to the test server) and asset downloads (github.com URLs) through one handler.
type fake struct {
	handler func(w http.ResponseWriter, r *http.Request)
}

func (f *fake) RoundTrip(r *http.Request) (*http.Response, error) {
	recorder := httptest.NewRecorder()
	f.handler(recorder, r)
	return recorder.Result(), nil
}

func client(t *testing.T, handler func(w http.ResponseWriter, r *http.Request)) (*Client, Options) {
	t.Helper()
	options := Options{Repo: repo, Ref: "main", Commit: commit, Token: "test-secret", Workflow: "build-site.yml",
		PendingPath: filepath.Join(t.TempDir(), "pending.json"), Poll: time.Millisecond,
		Environ: []string{"PUBLIC_TITLE=demo", "MOENOTES_GITHUB_TOKEN=test-secret"},
		API:     "https://api.test", HTTP: &http.Client{Transport: &fake{handler: handler}}}
	return New(options), options
}

func writeJSON(w http.ResponseWriter, value any) { _ = json.NewEncoder(w).Encode(value) }

func TestPublicEnvironmentOnlyForwardsPublicSettings(t *testing.T) {
	raw, err := PublicEnvironment([]string{"PUBLIC_TITLE=demo", "MOENOTES_GITHUB_TOKEN=secret", "PRIVATE=x"})
	if err != nil || raw != `{"PUBLIC_TITLE":"demo"}` {
		t.Fatalf("got %s, %v", raw, err)
	}
	for _, bad := range [][]string{{"PUBLIC_bad-key=x"}, {"PUBLIC_X=" + strings.Repeat("x", 8193)}} {
		if _, err := PublicEnvironment(bad); err == nil {
			t.Fatalf("%v should be refused", bad)
		}
	}
}

func TestAssetURLMustNameThisRelease(t *testing.T) {
	if _, err := AssetURL(repo, tag, "site-manifest.json", assetURL("site-manifest.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := AssetURL(repo, tag, "site-manifest.json", "https://evil.invalid/file"); err == nil {
		t.Fatal("foreign URL accepted")
	}
}

func TestReusesPublishedReleaseWithoutDispatchOrCredentialsOnAssets(t *testing.T) {
	var dispatches atomic.Int32
	c, _ := client(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Host == "github.com" {
			if r.Header.Get("Authorization") != "" {
				t.Error("credentials sent to the asset host")
			}
			_, _ = w.Write(manifestJSON())
			return
		}
		if r.Header.Get("Authorization") != "Bearer test-secret" {
			t.Error("API call without the token")
		}
		if strings.Contains(r.URL.Path, "dispatches") {
			dispatches.Add(1)
		}
		writeJSON(w, releaseJSON("site-manifest.json", artifact.PartName(0)))
	})
	source, err := c.Wait(context.Background(), expected, locales, func(string) {})
	if err != nil {
		t.Fatal(err)
	}
	if len(source.PartURLs) != 1 || source.PartURLs[0] != assetURL(artifact.PartName(0)) || dispatches.Load() != 0 {
		t.Fatalf("got %+v, %d dispatches", source, dispatches.Load())
	}
}

func TestSchemaOneReleaseIsReported(t *testing.T) {
	c, _ := client(t, func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, releaseJSON("site.tar.gz"))
	})
	if _, err := c.Release(context.Background(), expected, locales); err == nil || !strings.Contains(err.Error(), "schema 1") {
		t.Fatalf("got %v", err)
	}
}

func TestMissingTokenFailsClosedWithoutNetwork(t *testing.T) {
	var calls atomic.Int32
	c, options := client(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); http.NotFound(w, r) })
	options.Token = ""
	c = New(options)
	if _, err := c.Wait(context.Background(), expected, locales, func(string) {}); err == nil || !strings.Contains(err.Error(), "MOENOTES_GITHUB_TOKEN") {
		t.Fatalf("got %v", err)
	}
	if calls.Load() != 0 {
		t.Fatal("no request may be sent without a token")
	}
}

func TestDispatchPersistsFirstAndFailedRunClearsJournal(t *testing.T) {
	var dispatches atomic.Int32
	var options Options
	c, options := client(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/releases/tags/"):
			http.NotFound(w, r)
		case strings.HasSuffix(r.URL.Path, "/dispatches"):
			if _, err := os.Stat(options.PendingPath); err != nil {
				t.Error("the journal must be written before dispatching")
			}
			var body struct {
				Ref    string            `json:"ref"`
				Inputs map[string]string `json:"inputs"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body.Inputs["commit"] != commit || body.Inputs["key"] != expected.Key || strings.Contains(body.Inputs["public_env"], "test-secret") {
				t.Errorf("unexpected inputs %+v", body.Inputs)
			}
			dispatches.Add(1)
			w.WriteHeader(http.StatusNoContent)
		default:
			runs := []map[string]any{}
			if dispatches.Load() > 0 {
				runs = append(runs, map[string]any{"id": 12, "display_title": tag, "status": "completed", "conclusion": "failure", "created_at": time.Now().UTC().Format(time.RFC3339)})
			}
			writeJSON(w, map[string]any{"workflow_runs": runs})
		}
	})
	_, err := c.Wait(context.Background(), expected, locales, func(string) {})
	if err == nil || !strings.Contains(err.Error(), "finished (failure)") {
		t.Fatalf("got %v", err)
	}
	if dispatches.Load() != 1 {
		t.Fatalf("dispatched %d times", dispatches.Load())
	}
	if _, err := os.Stat(options.PendingPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("a finished run must clear the journal")
	}
}

func TestRestartAttachesToPersistedRun(t *testing.T) {
	var polls, posts atomic.Int32
	c, options := client(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			posts.Add(1)
		}
		switch {
		case r.URL.Host == "github.com":
			_, _ = w.Write(manifestJSON())
		case strings.Contains(r.URL.Path, "/releases/tags/"):
			if polls.Add(1) >= 3 {
				writeJSON(w, releaseJSON("site-manifest.json", artifact.PartName(0)))
				return
			}
			http.NotFound(w, r)
		default:
			writeJSON(w, map[string]any{"id": 77, "display_title": tag, "status": "in_progress"})
		}
	})
	raw, _ := json.Marshal(pending{Key: expected.Key, DispatchedAt: time.Now().UnixMilli(), RunID: 77})
	if err := os.WriteFile(options.PendingPath, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Wait(context.Background(), expected, locales, func(string) {}); err != nil {
		t.Fatal(err)
	}
	if posts.Load() != 0 {
		t.Fatal("a persisted run must not be dispatched again")
	}
	if _, err := os.Stat(options.PendingPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("success must clear the journal")
	}
}

func TestAPIFailureDoesNotDispatch(t *testing.T) {
	var posts atomic.Int32
	c, _ := client(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			posts.Add(1)
		}
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("secret"))
	})
	_, err := c.Wait(context.Background(), expected, locales, func(string) {})
	if err == nil || !strings.Contains(err.Error(), "HTTP 403") || strings.Contains(err.Error(), "secret") {
		t.Fatalf("got %v", err)
	}
	if posts.Load() != 0 {
		t.Fatal("an API failure must not dispatch")
	}
}

func TestCancellationStopsWaiting(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	c, _ := client(t, func(w http.ResponseWriter, r *http.Request) {
		if err := r.Context().Err(); err != nil {
			w.WriteHeader(499)
			return
		}
		http.NotFound(w, r)
	})
	if _, err := c.Wait(ctx, expected, locales, func(string) {}); err == nil {
		t.Fatal("a cancelled wait must fail")
	}
}

func TestIdentityChecks(t *testing.T) {
	c, _ := client(t, func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) })
	bad := expected
	bad.Commit = strings.Repeat("c", 40)
	if _, err := c.Wait(context.Background(), bad, locales, func(string) {}); err == nil {
		t.Fatal("a build for another commit must be refused")
	}
	bad = expected
	bad.Key = "nothex"
	if _, err := c.Wait(context.Background(), bad, locales, func(string) {}); err == nil {
		t.Fatal("a malformed key must be refused")
	}
}
