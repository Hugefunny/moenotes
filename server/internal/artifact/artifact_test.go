package artifact

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/klauspost/compress/zstd"

	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/upstream"
)

var expected = Expected{
	Key: "0123456789abcdef", Revision: "fedcba9876543210", Commit: strings.Repeat("a", 40),
	Data: upstream.DataVersion{Fingerprint: "tw:1:1:en=x", Label: "tw@1"},
}

func locales() []string { return siteconfig.Current().LocaleCodes() }

func homepages() []string {
	var pages []string
	for _, locale := range siteconfig.Current().Locales() {
		if locale.Prefix == "" {
			pages = append(pages, "index.html")
		} else {
			pages = append(pages, locale.Prefix+"/index.html")
		}
	}
	return pages
}

func prefixes() []string {
	var list []string
	for _, locale := range siteconfig.Current().Locales() {
		list = append(list, locale.Prefix)
	}
	return list
}

func writeFile(t *testing.T, root, name, content string) {
	t.Helper()
	file := filepath.Join(root, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func validSite(t *testing.T) string {
	t.Helper()
	site := filepath.Join(t.TempDir(), "site")
	page := "<!doctype html>" + strings.Repeat("<p>moenotes page</p>", 400)
	for _, home := range homepages() {
		writeFile(t, site, home, page+home)
		writeFile(t, site, strings.TrimSuffix(home, "index.html")+"cards/1/index.html", page)
	}
	writeFile(t, site, "_astro/app.js", "export {};")
	writeFile(t, site, "empty.txt", "")
	return site
}

func manifestFor(result PackResult) *Manifest {
	return &Manifest{
		Schema: Schema, Key: expected.Key, Revision: expected.Revision, Commit: expected.Commit, Data: expected.Data,
		BuiltAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), Locales: locales(), Format: Format,
		Size: result.Size, SHA256: result.SHA256, Parts: result.Parts, Files: result.Files,
		ExpandedBytes: result.ExpandedBytes, Pages: result.Pages,
	}
}

type published struct {
	server   *httptest.Server
	manifest *Manifest
	urls     []string
}

func publish(t *testing.T, site string, partBytes int64) published {
	t.Helper()
	release := filepath.Join(t.TempDir(), "release")
	result, err := Pack(context.Background(), site, release, PackOptions{LocalePrefixes: prefixes(), PartBytes: partBytes})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewTLSServer(http.FileServer(http.Dir(release)))
	t.Cleanup(server.Close)
	var urls []string
	for _, part := range result.Parts {
		urls = append(urls, server.URL+"/"+part.Name)
	}
	return published{server: server, manifest: manifestFor(result), urls: urls}
}

func staging(t *testing.T) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "staging")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

func TestPackInstallRoundTripAcrossParts(t *testing.T) {
	site := validSite(t)
	release := publish(t, site, 512)
	if len(release.manifest.Parts) < 2 {
		t.Fatalf("expected several parts, got %d", len(release.manifest.Parts))
	}
	raw, _ := json.Marshal(release.manifest)
	if _, err := ParseManifest(raw, expected, locales()); err != nil {
		t.Fatal(err)
	}
	root := staging(t)
	if err := Install(context.Background(), release.server.Client(), Source{Manifest: release.manifest, PartURLs: release.urls}, root, homepages()); err != nil {
		t.Fatal(err)
	}
	for _, name := range append(homepages(), "_astro/app.js", "empty.txt", "ja/cards/1/index.html") {
		want, _ := os.ReadFile(filepath.Join(site, filepath.FromSlash(name)))
		got, err := os.ReadFile(filepath.Join(root, "site", filepath.FromSlash(name)))
		if err != nil || !bytes.Equal(want, got) {
			t.Fatalf("%s differs after the round trip: %v", name, err)
		}
	}
	if exists(filepath.Join(root, "parts")) {
		t.Fatal("downloaded parts should be removed")
	}
}

func TestPackOrdersLocaleCopiesTogether(t *testing.T) {
	site := validSite(t)
	entries, err := orderFiles(site, prefixes())
	if err != nil {
		t.Fatal(err)
	}
	var files []string
	for _, item := range entries {
		if !item.dir {
			files = append(files, item.rel)
		}
	}
	first := -1
	for index, file := range files {
		if strings.HasSuffix(file, "cards/1/index.html") {
			if first < 0 {
				first = index
			} else if index != first+(index-first) || files[index-1] != files[first+index-first-1] {
				t.Fatalf("locale copies of a page should be adjacent: %v", files)
			}
		}
	}
	count := 0
	for _, file := range files[first:] {
		if !strings.HasSuffix(file, "cards/1/index.html") {
			break
		}
		count++
	}
	if count != len(homepages()) {
		t.Fatalf("expected %d adjacent copies of cards/1, got %d: %v", len(homepages()), count, files)
	}
	if files[first] != "cards/1/index.html" {
		t.Fatalf("the default locale's copy should come first, got %s", files[first])
	}
}

func TestInstallRejectsTamperingAndCleansUp(t *testing.T) {
	release := publish(t, validSite(t), 0)
	cases := map[string]func(m *Manifest){
		"archive hash":   func(m *Manifest) { m.SHA256 = strings.Repeat("0", 64) },
		"part hash":      func(m *Manifest) { m.Parts[0].SHA256 = strings.Repeat("0", 64) },
		"part too short": func(m *Manifest) { m.Parts[0].Size++; m.Size++ },
		"part too long":  func(m *Manifest) { m.Parts[0].Size--; m.Size-- },
		"file count":     func(m *Manifest) { m.Files-- },
		"expanded size":  func(m *Manifest) { m.ExpandedBytes-- },
	}
	for name, tamper := range cases {
		t.Run(name, func(t *testing.T) {
			manifest := *release.manifest
			manifest.Parts = append([]Part(nil), release.manifest.Parts...)
			tamper(&manifest)
			root := staging(t)
			writeFile(t, root, "keep", "existing")
			if err := Install(context.Background(), release.server.Client(), Source{Manifest: &manifest, PartURLs: release.urls}, root, homepages()); err == nil {
				t.Fatal("expected a refusal")
			}
			if exists(filepath.Join(root, "site")) || exists(filepath.Join(root, "parts")) || !exists(filepath.Join(root, "keep")) {
				t.Fatal("a refused install must remove only what it created")
			}
		})
	}
}

func TestInstallRejectsMissingHomepagesAndUnsafeURLs(t *testing.T) {
	site := validSite(t)
	if err := os.Remove(filepath.Join(site, "ja", "index.html")); err != nil {
		t.Fatal(err)
	}
	release := publish(t, site, 0)
	if err := Install(context.Background(), release.server.Client(), Source{Manifest: release.manifest, PartURLs: release.urls}, staging(t), homepages()); err == nil || !strings.Contains(err.Error(), "homepage") {
		t.Fatalf("expected a missing homepage, got %v", err)
	}
	for _, url := range []string{"http://example.com/site.tar.zst.000", "https://token@example.com/site.tar.zst.000"} {
		if err := Install(context.Background(), http.DefaultClient, Source{Manifest: release.manifest, PartURLs: []string{url}}, staging(t), nil); err == nil {
			t.Fatalf("%s should be refused", url)
		}
	}
	redirect := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://example.com/unsafe", http.StatusFound)
	}))
	defer redirect.Close()
	if err := Install(context.Background(), redirect.Client(), Source{Manifest: release.manifest, PartURLs: []string{redirect.URL + "/x"}}, staging(t), nil); err == nil || !strings.Contains(err.Error(), "HTTPS") {
		t.Fatalf("a redirect to plain HTTP should be refused, got %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := Install(ctx, release.server.Client(), Source{Manifest: release.manifest, PartURLs: release.urls}, staging(t), nil); err == nil {
		t.Fatal("a cancelled install should fail")
	}
}

func TestInstallDoesNotReplaceExistingSite(t *testing.T) {
	release := publish(t, validSite(t), 0)
	root := staging(t)
	writeFile(t, root, "site", "untouched")
	if err := Install(context.Background(), release.server.Client(), Source{Manifest: release.manifest, PartURLs: release.urls}, root, nil); err == nil {
		t.Fatal("an existing site must not be replaced")
	}
	if raw, _ := os.ReadFile(filepath.Join(root, "site")); string(raw) != "untouched" {
		t.Fatal("the existing site was modified")
	}
}

type tarEntry struct {
	header tar.Header
	body   string
}

func compressTar(t *testing.T, entries []tarEntry, trailing []byte) []byte {
	t.Helper()
	var raw bytes.Buffer
	writer := tar.NewWriter(&raw)
	for _, entry := range entries {
		header := entry.header
		if header.Typeflag == tar.TypeReg || header.Typeflag == 0 {
			header.Size = int64(len(entry.body))
		}
		if header.Format == tar.FormatUnknown {
			header.Format = tar.FormatUSTAR
		}
		if header.Mode == 0 {
			header.Mode = 0o644
		}
		if err := writer.WriteHeader(&header); err != nil {
			t.Fatalf("%s: %v", header.Name, err)
		}
		if entry.body != "" {
			if _, err := writer.Write([]byte(entry.body)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	raw.Write(trailing)
	var out bytes.Buffer
	encoder, _ := zstd.NewWriter(&out)
	_, _ = encoder.Write(raw.Bytes())
	_ = encoder.Close()
	return out.Bytes()
}

func extract(t *testing.T, archive []byte, limits Limits) (string, error) {
	t.Helper()
	root := staging(t)
	if err := os.Mkdir(filepath.Join(root, "site"), 0o755); err != nil {
		t.Fatal(err)
	}
	_, err := Extract(context.Background(), bytes.NewReader(archive), root, limits)
	return root, err
}

func file(name, body string) tarEntry {
	return tarEntry{header: tar.Header{Name: name, Typeflag: tar.TypeReg}, body: body}
}

func TestExtractRejectsTraversalAndAmbiguousPaths(t *testing.T) {
	for _, name := range []string{"../escape", "/site/escape", "site/../../escape", "site/../escape", "site//bad", "site/./bad",
		"site/C:bad", `site/evil\path`, "site/NUL", "site/com1.txt", "site/name.", "site/name ", "other/file", "site"} {
		root, err := extract(t, compressTar(t, []tarEntry{file(name, "evil")}, nil), Limits{})
		if err == nil {
			t.Fatalf("%q should be refused", name)
		}
		if exists(filepath.Join(filepath.Dir(root), "escape")) {
			t.Fatalf("%q escaped the staging directory", name)
		}
	}
}

func TestExtractRejectsLinksSpecialFilesAndExtendedHeaders(t *testing.T) {
	for _, entry := range []tarEntry{
		{header: tar.Header{Name: "site/link", Typeflag: tar.TypeSymlink, Linkname: "/etc/passwd"}},
		{header: tar.Header{Name: "site/hard", Typeflag: tar.TypeLink, Linkname: "site/a"}},
		{header: tar.Header{Name: "site/fifo", Typeflag: tar.TypeFifo}},
		{header: tar.Header{Name: "site/char", Typeflag: tar.TypeChar}},
		{header: tar.Header{Name: "site/pax", Typeflag: tar.TypeReg, Format: tar.FormatPAX, PAXRecords: map[string]string{"comment": "x"}}},
		{header: tar.Header{Name: "site/" + strings.Repeat("long/", 30) + "name", Typeflag: tar.TypeReg, Format: tar.FormatGNU}},
	} {
		if _, err := extract(t, compressTar(t, []tarEntry{entry}, nil), Limits{}); err == nil {
			t.Fatalf("%s (type %q) should be refused", entry.header.Name, entry.header.Typeflag)
		}
	}
}

func TestExtractRejectsDuplicatesAndCollisions(t *testing.T) {
	for _, entries := range [][]tarEntry{
		{file("site/file", "a"), file("site/file", "b")},
		{file("site/File", "a"), file("site/file", "b")},
		{file("site/file", "a"), file("site/file/nested", "b")},
		{file("site/file/nested", "a"), file("site/file", "b")},
	} {
		if _, err := extract(t, compressTar(t, entries, nil), Limits{}); err == nil {
			t.Fatalf("%v should be refused", entries)
		}
	}
}

func TestExtractEnforcesLimitsAndIntegrity(t *testing.T) {
	big := compressTar(t, []tarEntry{file("site/bomb", strings.Repeat("x", 8192))}, nil)
	if _, err := extract(t, big, Limits{ExpandedBytes: 2048}); err == nil || !strings.Contains(err.Error(), "limit") {
		t.Fatalf("expanded size limit: %v", err)
	}
	if _, err := extract(t, big, Limits{FileBytes: 1024}); err == nil || !strings.Contains(err.Error(), "limit") {
		t.Fatalf("file size limit: %v", err)
	}
	if _, err := extract(t, compressTar(t, []tarEntry{file("site/a", "1"), file("site/b", "2")}, nil), Limits{Files: 1}); err == nil {
		t.Fatal("file count limit")
	}
	if _, err := extract(t, compressTar(t, []tarEntry{file("site/a", "1")}, []byte("garbage after the end marker")), Limits{}); err == nil {
		t.Fatal("data after the end marker should be refused")
	}
	valid := compressTar(t, []tarEntry{file("site/a", strings.Repeat("payload", 100))}, nil)
	if _, err := extract(t, valid[:len(valid)-6], Limits{}); err == nil {
		t.Fatal("a truncated stream should be refused")
	}
	corrupt := append([]byte(nil), valid...)
	corrupt[len(corrupt)/2] ^= 0xff
	if _, err := extract(t, corrupt, Limits{}); err == nil {
		t.Fatal("a corrupted stream should be refused")
	}
	if root, err := extract(t, valid, Limits{}); err != nil || !exists(filepath.Join(root, "site", "a")) {
		t.Fatalf("a valid archive should extract: %v", err)
	}
}

func TestManifestValidation(t *testing.T) {
	release := publish(t, validSite(t), 512)
	base := *release.manifest
	raw, _ := json.Marshal(base)
	if _, err := ParseManifest(raw, expected, locales()); err != nil {
		t.Fatal(err)
	}
	mutations := map[string]func(m map[string]any){
		"schema 1":        func(m map[string]any) { m["schema"] = 1 },
		"key":             func(m map[string]any) { m["key"] = "ffffffffffffffff" },
		"revision":        func(m map[string]any) { m["revision"] = "wrong" },
		"commit":          func(m map[string]any) { m["commit"] = strings.Repeat("b", 40) },
		"fingerprint":     func(m map[string]any) { m["data"] = map[string]string{"fingerprint": "other", "label": "tw@1"} },
		"label":           func(m map[string]any) { m["data"] = map[string]string{"fingerprint": "tw:1:1:en=x", "label": "other"} },
		"builtAt invalid": func(m map[string]any) { m["builtAt"] = "2026-02-30T00:00:00Z" },
		"builtAt future":  func(m map[string]any) { m["builtAt"] = "9999-01-01T00:00:00Z" },
		"locales partial": func(m map[string]any) { m["locales"] = locales()[1:] },
		"locales dup":     func(m map[string]any) { l := locales(); l[0] = l[1]; m["locales"] = l },
		"format":          func(m map[string]any) { m["format"] = "tar+gzip" },
		"sha256":          func(m map[string]any) { m["sha256"] = "bad" },
		"size":            func(m map[string]any) { m["size"] = 1 },
		"no parts":        func(m map[string]any) { m["parts"] = []any{} },
		"part name":       func(m map[string]any) { parts := m["parts"].([]any); parts[0].(map[string]any)["name"] = "evil" },
		"part too big": func(m map[string]any) {
			parts := m["parts"].([]any)
			parts[0].(map[string]any)["size"] = PartBytes + 1
		},
		"files":         func(m map[string]any) { m["files"] = 0 },
		"expandedBytes": func(m map[string]any) { m["expandedBytes"] = MaxExpandedBytes + 1 },
		"pages":         func(m map[string]any) { m["pages"] = -1 },
		"unknown field": func(m map[string]any) { m["extra"] = true },
	}
	for name, mutate := range mutations {
		var value map[string]any
		_ = json.Unmarshal(raw, &value)
		mutate(value)
		changed, _ := json.Marshal(value)
		if _, err := ParseManifest(changed, expected, locales()); err == nil {
			t.Errorf("%s should be refused", name)
		}
	}
	for _, value := range []string{"null", "[]", `"x"`, "{}", string(raw) + "{}"} {
		if _, err := ParseManifest([]byte(value), expected, locales()); err == nil {
			t.Errorf("%s should be refused", value)
		}
	}
}
