// Package finalize prepares an installed build for serving, in two steps.
//
// Link runs before a build goes live: files identical to the live build's are hard-linked to them together with
// their compressed variants. Pages untouched by a data update thus cost no disk or compression time and keep their
// mtime-based ETags. It also returns the manifest (relative path -> size and SHA-256), stored next to the site as
// files.json so it is never served.
//
// Compress runs in the background once the build is live: every compressible file without variants gets brotli
// and gzip ones next to it (`page.html.br`, `page.html.gz`). Until then the server sends the file as is. Variants
// appear atomically, and a run picks up whatever an interrupted one left out.
package finalize

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/gzip"
)

// Encoding is a precompressed variant, in the server's order of preference.
type Encoding struct {
	Name   string
	Suffix string
}

// Encodings lists the variants the server looks for, preferred first.
var Encodings = []Encoding{{Name: "br", Suffix: ".br"}, {Name: "gzip", Suffix: ".gz"}}

// Compressible lists the extensions that get precompressed variants.
var Compressible = map[string]bool{
	".html": true, ".js": true, ".mjs": true, ".css": true, ".json": true, ".map": true, ".svg": true,
	".xml": true, ".txt": true, ".wasm": true, ".bin": true, ".onnx": true, ".webmanifest": true, ".ico": true,
	".ttf": true, ".otf": true,
}

// IsCompressible reports whether a file name gets precompressed variants.
func IsCompressible(name string) bool { return Compressible[strings.ToLower(path.Ext(name))] }

const (
	minBytes = 1024
	// A variant is kept only when it is at most this share of the original.
	maxRatio = 0.9
)

// Names of the files replaceWithLink and writeAtomically rename into place.
var temporary = regexp.MustCompile(`\.(?:link|tmp)-\d+$`)

// Manifest maps a site-relative path to its size and SHA-256 (files.json).
type Manifest map[string]Entry

// Entry is one file of a manifest, stored as `[size, "sha256"]` like the earlier server wrote it.
type Entry struct {
	Size   int64
	SHA256 string
}

// MarshalJSON writes the entry as a two-element array.
func (e Entry) MarshalJSON() ([]byte, error) { return json.Marshal([]any{e.Size, e.SHA256}) }

// UnmarshalJSON reads a two-element array.
func (e *Entry) UnmarshalJSON(raw []byte) error {
	var tuple []json.RawMessage
	if err := json.Unmarshal(raw, &tuple); err != nil || len(tuple) != 2 {
		return errors.New("manifest entry must be [size, sha256]")
	}
	if err := json.Unmarshal(tuple[0], &e.Size); err != nil {
		return err
	}
	return json.Unmarshal(tuple[1], &e.SHA256)
}

// ReadManifest loads a files.json; a missing file is no manifest.
func ReadManifest(file string) (Manifest, error) {
	raw, err := os.ReadFile(file)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var manifest Manifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, fmt.Errorf("%s: %w", file, err)
	}
	return manifest, nil
}

// WriteManifest stores a files.json atomically.
func WriteManifest(file string, manifest Manifest) error {
	raw, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	return writeAtomically(file, raw)
}

// ListFiles returns the regular files under site as sorted slash-separated relative paths.
func ListFiles(site string) ([]string, error) {
	var files []string
	err := filepath.WalkDir(site, func(file string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type().IsRegular() {
			rel, err := filepath.Rel(site, file)
			if err != nil {
				return err
			}
			files = append(files, filepath.ToSlash(rel))
		}
		return nil
	})
	sort.Strings(files)
	return files, err
}

// LinkResult reports a link run.
type LinkResult struct {
	Manifest Manifest
	Files    int
	Linked   int
}

// Previous is the live build a new one is linked against.
type Previous struct {
	Site     string
	Manifest Manifest
}

// Link hashes every file of site and hard-links the ones identical to previous's copies (with their variants).
func Link(ctx context.Context, site string, previous *Previous) (LinkResult, error) {
	// Astro renders from server chunks in <outDir>/.prerender and deletes them afterwards; never publish them.
	if err := os.RemoveAll(filepath.Join(site, ".prerender")); err != nil {
		return LinkResult{}, err
	}
	files, err := ListFiles(site)
	if err != nil {
		return LinkResult{}, err
	}
	result := LinkResult{Manifest: make(Manifest, len(files)), Files: len(files)}
	for _, file := range files {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		full := filepath.Join(site, filepath.FromSlash(file))
		entry, err := hashFile(full)
		if err != nil {
			return result, err
		}
		result.Manifest[file] = entry
		if previous == nil {
			continue
		}
		before, ok := previous.Manifest[file]
		if !ok || before != entry {
			continue
		}
		from := filepath.Join(previous.Site, filepath.FromSlash(file))
		if replaceWithLink(from, full) {
			for _, encoding := range Encodings {
				replaceWithLink(from+encoding.Suffix, full+encoding.Suffix)
			}
			result.Linked++
		}
	}
	return result, nil
}

func hashFile(file string) (Entry, error) {
	handle, err := os.Open(file)
	if err != nil {
		return Entry{}, err
	}
	defer handle.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, handle)
	if err != nil {
		return Entry{}, err
	}
	return Entry{Size: size, SHA256: hex.EncodeToString(hash.Sum(nil))}, nil
}

// replaceWithLink hard-links from over to in one rename; false (and to untouched) when from cannot be linked.
func replaceWithLink(from, to string) bool {
	temp := fmt.Sprintf("%s.link-%d", to, os.Getpid())
	if err := os.Link(from, temp); err != nil {
		return false
	}
	if err := os.Rename(temp, to); err != nil {
		_ = os.Remove(temp)
		return false
	}
	return true
}

// writeAtomically makes data appear at file complete or not at all.
func writeAtomically(file string, data []byte) error {
	temp := fmt.Sprintf("%s.tmp-%d", file, os.Getpid())
	if err := os.WriteFile(temp, data, 0o644); err != nil {
		_ = os.Remove(temp)
		return err
	}
	if err := os.Rename(temp, file); err != nil {
		_ = os.Remove(temp)
		return err
	}
	return nil
}

// CompressResult reports a compression run.
type CompressResult struct {
	Files      int
	Compressed int
}

// Compress adds variants to every compressible file of site that lacks one, using up to workers files at once.
// Safe while the site is served; a file missing a variant (one too large to keep, or cut off by an interrupted run)
// is compressed again on each run.
func Compress(ctx context.Context, site string, workers int) (CompressResult, error) {
	files, err := ListFiles(site)
	if err != nil {
		return CompressResult{}, err
	}
	present := make(map[string]bool, len(files))
	for _, file := range files {
		present[file] = true
	}
	var todo []string
	for _, file := range files {
		if temporary.MatchString(file) {
			if err := os.Remove(filepath.Join(site, filepath.FromSlash(file))); err != nil && !errors.Is(err, fs.ErrNotExist) {
				return CompressResult{}, err
			}
			continue
		}
		if !IsCompressible(file) {
			continue
		}
		complete := true
		for _, encoding := range Encodings {
			complete = complete && present[file+encoding.Suffix]
		}
		if !complete {
			todo = append(todo, file)
		}
	}

	var compressed atomic.Int64
	var firstErr error
	var errOnce sync.Once
	jobs := make(chan string)
	var wg sync.WaitGroup
	for range max(1, workers) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for file := range jobs {
				done, err := compressFile(filepath.Join(site, filepath.FromSlash(file)))
				if err != nil {
					errOnce.Do(func() { firstErr = fmt.Errorf("%s: %w", file, err) })
					continue
				}
				if done {
					compressed.Add(1)
				}
			}
		}()
	}
feed:
	for _, file := range todo {
		select {
		case <-ctx.Done():
			break feed
		case jobs <- file:
		}
	}
	close(jobs)
	wg.Wait()
	result := CompressResult{Files: len(files), Compressed: int(compressed.Load())}
	if firstErr != nil {
		return result, firstErr
	}
	return result, ctx.Err()
}

func compressFile(file string) (bool, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return false, err
	}
	if len(data) < minBytes {
		return false, nil
	}
	var br bytes.Buffer
	brWriter := brotli.NewWriterOptions(&br, brotli.WriterOptions{Quality: 9, LGWin: 22})
	if _, err := brWriter.Write(data); err != nil {
		return false, err
	}
	if err := brWriter.Close(); err != nil {
		return false, err
	}
	var gz bytes.Buffer
	gzWriter, err := gzip.NewWriterLevel(&gz, gzip.BestCompression)
	if err != nil {
		return false, err
	}
	if _, err := gzWriter.Write(data); err != nil {
		return false, err
	}
	if err := gzWriter.Close(); err != nil {
		return false, err
	}
	variants := map[string][]byte{"br": br.Bytes(), "gzip": gz.Bytes()}
	for _, encoding := range Encodings {
		variant := variants[encoding.Name]
		if float64(len(variant)) <= float64(len(data))*maxRatio {
			if err := writeAtomically(file+encoding.Suffix, variant); err != nil {
				return false, err
			}
		}
	}
	return true, nil
}
