// Package web serves the live build and the server's own endpoints.
package web

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/StarMoe-org/moenotes/server/internal/finalize"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
)

// Roots are the directories requests are served from; replaced as a whole when a build goes live.
type Roots struct {
	Current string
	// Previous are older builds, newest first. Only /_astro/ is looked up there.
	Previous []string
}

// RootSource holds the current roots.
type RootSource struct{ value atomic.Pointer[Roots] }

// Load returns the current roots.
func (r *RootSource) Load() Roots {
	if roots := r.value.Load(); roots != nil {
		return *roots
	}
	return Roots{}
}

// Store replaces the roots.
func (r *RootSource) Store(roots Roots) { r.value.Store(&roots) }

const (
	immutable  = "public, max-age=31536000, immutable"
	revalidate = "no-cache"
	// PageVersionMetric names the Server-Timing metric carrying an HTML page's version: the page compares it with a
	// later HEAD of its own URL to tell that a newer build changed it (src/lib/site/page-update.ts).
	PageVersionMetric = "page"
)

// Content types by extension; anything else falls back to the mime package, then application/octet-stream.
var contentTypes = map[string]string{
	".html": "text/html;charset=utf-8", ".htm": "text/html;charset=utf-8",
	".js": "text/javascript;charset=utf-8", ".mjs": "text/javascript;charset=utf-8",
	".css": "text/css;charset=utf-8", ".json": "application/json;charset=utf-8", ".map": "application/json;charset=utf-8",
	".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain;charset=utf-8",
	".md": "text/markdown;charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
	".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon",
	".wasm": "application/wasm", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
	".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm",
	".pdf": "application/pdf", ".onnx": "application/octet-stream", ".bin": "application/octet-stream",
}

// ContentType is the Content-Type of a file name.
func ContentType(name string) string {
	ext := strings.ToLower(path.Ext(name))
	if value, ok := contentTypes[ext]; ok {
		return value
	}
	if value := mime.TypeByExtension(ext); value != "" {
		return value
	}
	return "application/octet-stream"
}

type fileInfo struct {
	path  string
	size  int64
	mtime time.Time
}

func stat(file string) (fileInfo, bool) {
	info, err := os.Stat(file)
	if err != nil || !info.Mode().IsRegular() {
		return fileInfo{}, false
	}
	return fileInfo{path: file, size: info.Size(), mtime: info.ModTime()}, true
}

// sitePath is the request path confined to the site root, keeping a trailing slash; false when it cannot name a file.
func sitePath(raw string) (string, bool) {
	if strings.ContainsAny(raw, "\x00\\") {
		return "", false
	}
	if !strings.HasPrefix(raw, "/") {
		raw = "/" + raw
	}
	cleaned := path.Clean(raw)
	if strings.HasSuffix(raw, "/") && cleaned != "/" {
		cleaned += "/"
	}
	return cleaned, true
}

func join(root, pathname string) string {
	return filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(pathname, "/")))
}

func findFile(root, pathname string) (fileInfo, bool) {
	base := join(root, pathname)
	candidates := []string{filepath.Join(base, "index.html")}
	if !strings.HasSuffix(pathname, "/") {
		candidates = []string{base, filepath.Join(base, "index.html"), base + ".html"}
	}
	for _, candidate := range candidates {
		if info, ok := stat(candidate); ok {
			return info, true
		}
	}
	return fileInfo{}, false
}

// Static serves the Astro output: `{path}`, `{path}/index.html`, `{path}.html`, then `/404.html` with status 404.
// Player pages have no file of their own: every player gets the locale's player shell, which reads the player from
// its URL. `/_astro/` files are content-hashed: cached for a year and, when missing from the live build, looked up
// in earlier builds, so a page loaded just before a swap still finds its scripts.
type Static struct {
	Roots *RootSource
	Site  *siteconfig.Site
}

func (s *Static) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	roots := s.Roots.Load()
	if roots.Current == "" {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Retry-After", "60")
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("MoeNotes is being built for the first time. Please retry in a few minutes.\n"))
		return
	}
	pathname, ok := sitePath(r.URL.Path)
	if !ok {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	lookup := pathname
	if shell, ok := s.Site.PlayerShellPath(pathname); ok {
		lookup = shell
	}
	isImmutable := strings.HasPrefix(pathname, "/_astro/")
	file, found := findFile(roots.Current, lookup)
	if !found && isImmutable {
		for _, root := range roots.Previous {
			if file, found = stat(join(root, pathname)); found {
				break
			}
		}
	}
	if found {
		cache := revalidate
		if isImmutable {
			cache = immutable
		}
		serveFile(w, r, file, http.StatusOK, cache)
		return
	}
	if notFound, ok := stat(filepath.Join(roots.Current, "404.html")); ok {
		serveFile(w, r, notFound, http.StatusNotFound, revalidate)
		return
	}
	http.Error(w, "Not Found", http.StatusNotFound)
}

func base36(value int64) string { return strconv.FormatInt(value, 36) }

// fileVersion is a file's version in any encoding: its uncompressed size and modification time. Finalize hard-links
// unchanged files across builds, so it stays stable while the content does.
func fileVersion(file fileInfo) string {
	return base36(file.size) + "-" + base36(file.mtime.UnixMilli())
}

func acceptedEncodings(header string) map[string]bool {
	accepted := map[string]bool{}
	for _, part := range strings.Split(header, ",") {
		fields := strings.Split(strings.ToLower(strings.TrimSpace(part)), ";")
		token := strings.TrimSpace(fields[0])
		if token == "" {
			continue
		}
		keep := true
		for _, param := range fields[1:] {
			param = strings.TrimSpace(param)
			if strings.HasPrefix(param, "q=") {
				q, err := strconv.ParseFloat(param[2:], 64)
				keep = err == nil && q > 0
			}
		}
		if keep {
			accepted[token] = true
		}
	}
	return accepted
}

func matchesETag(header, etag string) bool {
	if header == "" {
		return false
	}
	for _, tag := range strings.Split(header, ",") {
		value := strings.TrimSpace(tag)
		if value == "*" || value == etag || value == "W/"+etag {
			return true
		}
	}
	return false
}

// serveFile sends a file, or its precompressed variant when the client accepts one and it has been written.
func serveFile(w http.ResponseWriter, r *http.Request, file fileInfo, status int, cacheControl string) {
	header := w.Header()
	contentType := ContentType(file.path)
	header.Set("Content-Type", contentType)
	header.Set("Cache-Control", cacheControl)
	served, encoding := file, ""
	if finalize.IsCompressible(file.path) {
		header.Set("Vary", "Accept-Encoding")
		accepted := acceptedEncodings(r.Header.Get("Accept-Encoding"))
		for _, candidate := range finalize.Encodings {
			if !accepted[candidate.Name] {
				continue
			}
			if variant, ok := stat(file.path + candidate.Suffix); ok {
				served, encoding = variant, candidate.Name
				break
			}
		}
	}
	if encoding != "" {
		header.Set("Content-Encoding", encoding)
	}
	if strings.HasPrefix(contentType, "text/html") {
		header.Set("Server-Timing", fmt.Sprintf(`%s;desc="%s"`, PageVersionMetric, fileVersion(file)))
	}
	etag := `"` + base36(served.size) + "-" + base36(served.mtime.UnixMilli())
	if encoding != "" {
		etag += "-" + encoding
	}
	etag += `"`
	header.Set("ETag", etag)
	header.Set("Last-Modified", served.mtime.UTC().Format(http.TimeFormat))
	if status == http.StatusOK && matchesETag(r.Header.Get("If-None-Match"), etag) {
		header.Del("Content-Type")
		w.WriteHeader(http.StatusNotModified)
		return
	}
	handle, err := os.Open(served.path)
	if err != nil {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}
	defer handle.Close()
	if status == http.StatusOK && encoding == "" {
		// Byte ranges for uncompressed files (media, WASM); ServeContent also answers conditional requests.
		http.ServeContent(w, r, "", served.mtime, handle)
		return
	}
	header.Set("Content-Length", strconv.FormatInt(served.size, 10))
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = io.Copy(w, handle)
	}
}
