package artifact

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/upstream"
)

// TestRealSiteRoundTrip packs a real build output (MOENOTES_ROUNDTRIP_SITE) and installs it again. Opt-in: it needs
// a built site and several GiB of disk.
func TestRealSiteRoundTrip(t *testing.T) {
	site := os.Getenv("MOENOTES_ROUNDTRIP_SITE")
	if site == "" {
		t.Skip("set MOENOTES_ROUNDTRIP_SITE to a built site")
	}
	ctx := context.Background()
	config := siteconfig.Current()
	var prefixes []string
	homepages := []string{}
	for _, locale := range config.Locales() {
		prefixes = append(prefixes, locale.Prefix)
		if locale.Prefix == "" {
			homepages = append(homepages, "index.html")
		} else {
			homepages = append(homepages, locale.Prefix+"/index.html")
		}
	}
	dir := t.TempDir()
	started := time.Now()
	packed, err := Pack(ctx, site, filepath.Join(dir, "release"), PackOptions{LocalePrefixes: prefixes, PartBytes: 8 << 20})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("packed %d files (%d bytes) into %d parts, %d bytes, in %s", packed.Files, packed.ExpandedBytes, len(packed.Parts), packed.Size, time.Since(started))
	server := httptest.NewTLSServer(http.FileServer(http.Dir(filepath.Join(dir, "release"))))
	defer server.Close()
	var urls []string
	for _, part := range packed.Parts {
		urls = append(urls, server.URL+"/"+part.Name)
	}
	manifest := &Manifest{Schema: Schema, Key: "0123456789abcdef", Revision: "fedcba9876543210", Commit: string(bytes.Repeat([]byte("a"), 40)),
		Data: upstream.DataVersion{Fingerprint: "x", Label: "y"}, BuiltAt: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		Locales: config.LocaleCodes(), Format: Format, Size: packed.Size, SHA256: packed.SHA256, Parts: packed.Parts,
		Files: packed.Files, ExpandedBytes: packed.ExpandedBytes, Pages: packed.Pages}
	staging := filepath.Join(dir, "staging")
	if err := os.Mkdir(staging, 0o755); err != nil {
		t.Fatal(err)
	}
	started = time.Now()
	if err := Install(ctx, server.Client(), Source{Manifest: manifest, PartURLs: urls}, staging, homepages); err != nil {
		t.Fatal(err)
	}
	t.Logf("installed in %s", time.Since(started))
	compared := 0
	err = filepath.WalkDir(site, func(path string, entry os.DirEntry, err error) error {
		if err != nil || !entry.Type().IsRegular() {
			return err
		}
		rel, _ := filepath.Rel(site, path)
		want, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		got, err := os.ReadFile(filepath.Join(staging, "site", rel))
		if err != nil {
			return err
		}
		if !bytes.Equal(want, got) {
			t.Errorf("%s differs", rel)
		}
		compared++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if int64(compared) != packed.Files {
		t.Fatalf("compared %d files, packed %d", compared, packed.Files)
	}
}
