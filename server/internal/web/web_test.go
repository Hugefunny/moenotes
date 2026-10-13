package web

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
)

func write(t *testing.T, root, name, content string) {
	t.Helper()
	file := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

const shell = `<!doctype html><html><head><title>Player | Moenotes</title>
<meta name="description" content="Public player page.">
<meta property="og:title" content="Player | Moenotes">
<meta property="og:description" content="Public player page.">
<meta property="og:url" content="https://bdon.moe/u/">
<meta name="twitter:title" content="Player | Moenotes">
<meta property="og:site_name" content="Moenotes">
</head><body><p>a &amp; b</p></body></html>`

func setup(t *testing.T) (*RootSource, string) {
	t.Helper()
	root := t.TempDir()
	write(t, root, "index.html", "<!doctype html>home")
	write(t, root, "index.html.br", "brotli")
	write(t, root, "about/index.html", "about")
	write(t, root, "legacy.html", "legacy")
	write(t, root, "404.html", "not found")
	write(t, root, "u/index.html", shell)
	write(t, root, "_astro/app.js", "export {};")
	write(t, root, "media.png", strings.Repeat("x", 4096))
	roots := &RootSource{}
	roots.Store(Roots{Current: root})
	return roots, root
}

func serve(handler http.Handler, method, path string, headers map[string]string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, "http://site"+path, nil)
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func TestStaticLookupOrderAndHeaders(t *testing.T) {
	roots, _ := setup(t)
	static := &Static{Roots: roots, Site: siteconfig.Current()}
	cases := map[string]string{"/about": "about", "/about/": "about", "/legacy": "legacy", "/_astro/app.js": "export {};"}
	for path, body := range cases {
		response := serve(static, http.MethodGet, path, nil)
		if response.Code != 200 || response.Body.String() != body {
			t.Errorf("%s: %d %q", path, response.Code, response.Body.String())
		}
	}
	missing := serve(static, http.MethodGet, "/nope", nil)
	if missing.Code != 404 || missing.Body.String() != "not found" {
		t.Fatalf("404 page: %d %q", missing.Code, missing.Body.String())
	}
	home := serve(static, http.MethodGet, "/", map[string]string{"Accept-Encoding": "gzip;q=0, br"})
	if home.Header().Get("Content-Encoding") != "br" || home.Body.String() != "brotli" || home.Header().Get("Vary") != "Accept-Encoding" {
		t.Fatalf("brotli variant: %v", home.Header())
	}
	if !strings.HasPrefix(home.Header().Get("Content-Type"), "text/html") || !strings.HasPrefix(home.Header().Get("Server-Timing"), `page;desc="`) {
		t.Fatalf("html headers: %v", home.Header())
	}
	identity := serve(static, http.MethodGet, "/", map[string]string{"Accept-Encoding": "br;q=0"})
	if identity.Header().Get("Content-Encoding") != "" || identity.Body.String() != "<!doctype html>home" {
		t.Fatal("q=0 must disable an encoding")
	}
	if identity.Header().Get("Server-Timing") != home.Header().Get("Server-Timing") {
		t.Fatal("the page version must not depend on the encoding")
	}
	if code := serve(static, http.MethodGet, "/", map[string]string{"Accept-Encoding": "br", "If-None-Match": home.Header().Get("ETag")}).Code; code != 304 {
		t.Fatalf("matching ETag: %d", code)
	}
	script := serve(static, http.MethodGet, "/_astro/app.js", nil)
	if !strings.Contains(script.Header().Get("Cache-Control"), "immutable") || script.Header().Get("Server-Timing") != "" {
		t.Fatalf("immutable assets: %v", script.Header())
	}
	head := serve(static, http.MethodHead, "/about", nil)
	if head.Code != 200 || head.Body.Len() != 0 {
		t.Fatal("HEAD")
	}
	ranged := serve(static, http.MethodGet, "/media.png", map[string]string{"Range": "bytes=0-9"})
	if ranged.Code != http.StatusPartialContent || ranged.Body.Len() != 10 {
		t.Fatalf("byte ranges: %d %d", ranged.Code, ranged.Body.Len())
	}
	if code := serve(static, http.MethodPost, "/", nil).Code; code != 405 {
		t.Fatalf("POST: %d", code)
	}
	for _, path := range []string{"/%2e%2e/%2e%2e/etc/hostname", "/../../etc/hostname", "/a%00b"} {
		if code := serve(static, http.MethodGet, path, nil).Code; code != 404 && code != 400 {
			t.Fatalf("%s: %d", path, code)
		}
	}
}

func TestStaticFallsBackToEarlierBuildsForAssetsOnly(t *testing.T) {
	roots, current := setup(t)
	previous := t.TempDir()
	write(t, previous, "_astro/old.js", "old")
	write(t, previous, "old-page/index.html", "old page")
	roots.Store(Roots{Current: current, Previous: []string{previous}})
	static := &Static{Roots: roots, Site: siteconfig.Current()}
	if response := serve(static, http.MethodGet, "/_astro/old.js", nil); response.Code != 200 || response.Body.String() != "old" {
		t.Fatal("/_astro/ should fall back to earlier builds")
	}
	if code := serve(static, http.MethodGet, "/old-page/", nil).Code; code != 404 {
		t.Fatal("pages must come from the live build only")
	}
}

func TestNoBuildAnswers503(t *testing.T) {
	static := &Static{Roots: &RootSource{}, Site: siteconfig.Current()}
	response := serve(static, http.MethodGet, "/", nil)
	if response.Code != 503 || response.Header().Get("Retry-After") != "60" {
		t.Fatalf("got %d", response.Code)
	}
}

func TestPlayerPagePreview(t *testing.T) {
	roots, _ := setup(t)
	var lookups int
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		lookups++
		if r.URL.Path != "/api/players/tw/21139118822" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"profile":{"name":"Moe <&>"},"brief":{"level":42}}`))
	}))
	defer api.Close()
	site := siteconfig.Current()
	pages := &PlayerPages{Roots: roots, Site: site, APIOrigin: api.URL, Client: api.Client(), Fallback: &Static{Roots: roots, Site: site}}
	response := serve(pages, http.MethodGet, "/u/tw/21139118822", nil)
	body := response.Body.String()
	for _, want := range []string{
		"<title>Moe &lt;&amp;&gt; | Player | Moenotes</title>",
		`content="Moe &lt;&amp;&gt; · Lv.42 · ID 21139118822 — Public player page."`,
		`content="https://bdon.moe/u/tw/21139118822"`,
		`content="Moe &lt;&amp;&gt; | Player | Moenotes"`,
		`<meta property="og:site_name" content="Moenotes">`,
		"<p>a &amp; b</p>",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("missing %s in\n%s", want, body)
		}
	}
	serve(pages, http.MethodGet, "/u/tw/21139118822", nil)
	if lookups != 1 {
		t.Fatalf("lookups should be cached, got %d", lookups)
	}
	unknown := serve(pages, http.MethodGet, "/u/tw/21139118823", nil)
	if unknown.Code != 200 || !strings.Contains(unknown.Body.String(), "<title>Player | Moenotes</title>") {
		t.Fatal("an unknown player gets the plain shell")
	}
	head := serve(pages, http.MethodHead, "/u/tw/21139118822", nil)
	if head.Code != 200 {
		t.Fatal("HEAD gets the plain shell")
	}
}

func TestPlayerPageWithoutAPIUsesShell(t *testing.T) {
	roots, _ := setup(t)
	site := siteconfig.Current()
	pages := &PlayerPages{Roots: roots, Site: site, Fallback: &Static{Roots: roots, Site: site}}
	if response := serve(pages, http.MethodGet, "/u/tw/21139118822", nil); response.Code != 200 || !strings.Contains(response.Body.String(), "<title>Player") {
		t.Fatal("plain shell")
	}
}

func TestAPIProxy(t *testing.T) {
	if code := serve(&APIProxy{}, http.MethodGet, "/api/me", nil).Code; code != 404 {
		t.Fatalf("no origin: %d", code)
	}
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("X-Path", r.URL.RequestURI())
		w.WriteHeader(201)
	}))
	defer slow.Close()
	response := serve(&APIProxy{Origin: slow.URL, Client: slow.Client()}, http.MethodGet, "/api/a%2Fb?x=1&y=2", nil)
	if response.Code != 201 || response.Header().Get("X-Path") != "/api/a%2Fb?x=1&y=2" || response.Header().Get("Content-Encoding") != "" {
		t.Fatalf("got %d %v", response.Code, response.Header())
	}
	closed := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	closed.Close()
	if code := serve(&APIProxy{Origin: closed.URL, Client: &http.Client{Timeout: time.Second}}, http.MethodGet, "/api/me", nil).Code; code != 502 {
		t.Fatalf("unreachable API: %d", code)
	}
}

func TestContentTypes(t *testing.T) {
	for name, want := range map[string]string{
		"a.html": "text/html;charset=utf-8", "a.js": "text/javascript;charset=utf-8", "a.wasm": "application/wasm",
		"a.webmanifest": "application/manifest+json", "a.unknownext": "application/octet-stream",
	} {
		if got := ContentType(name); got != want {
			t.Errorf("%s: %s", name, got)
		}
	}
}
