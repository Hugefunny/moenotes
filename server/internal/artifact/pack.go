package artifact

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/klauspost/compress/zstd"
)

// PackOptions configures Pack.
type PackOptions struct {
	// LocalePrefixes are the path prefixes of non-default locales (`ja`, `zh-tw`); files under them sort next to the
	// default locale's copy of the same page.
	LocalePrefixes []string
	// PartBytes is the maximum part size; zero means PartBytes.
	PartBytes int64
}

// PackResult describes the written parts and the site they hold.
type PackResult struct {
	Parts         []Part
	Size          int64
	SHA256        string
	Files         int64
	ExpandedBytes int64
	Pages         int64
}

type entry struct {
	rel     string
	sortKey string
	locale  string
	dir     bool
}

// orderFiles lists site's directories and files, page-major: directories first (so each exists before its files),
// then files sorted by their path without the locale prefix, the default locale before the prefixed copies.
func orderFiles(site string, prefixes []string) ([]entry, error) {
	isPrefix := map[string]bool{}
	for _, prefix := range prefixes {
		if prefix != "" {
			isPrefix[prefix] = true
		}
	}
	var dirs, files []entry
	err := filepath.WalkDir(site, func(file string, item fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(site, file)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if rel == "." {
			return nil
		}
		switch {
		case item.IsDir():
			dirs = append(dirs, entry{rel: rel, dir: true})
		case item.Type().IsRegular():
			key, locale := rel, ""
			if head, rest, ok := strings.Cut(rel, "/"); ok && isPrefix[head] {
				key, locale = rest, head
			}
			files = append(files, entry{rel: rel, sortKey: key, locale: locale})
		default:
			return fmt.Errorf("unsupported file type in site: %s", rel)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].rel < dirs[j].rel })
	sort.Slice(files, func(i, j int) bool {
		if files[i].sortKey != files[j].sortKey {
			return files[i].sortKey < files[j].sortKey
		}
		return files[i].locale < files[j].locale
	})
	return append(dirs, files...), nil
}

// partWriter splits a byte stream into numbered files of at most limit bytes, hashing each part and the whole.
type partWriter struct {
	dir     string
	limit   int64
	parts   []Part
	file    *os.File
	written int64
	partSum hash.Hash
	total   hash.Hash
	size    int64
}

func (w *partWriter) Write(p []byte) (int, error) {
	n := 0
	for len(p) > 0 {
		if w.file == nil || w.written == w.limit {
			if err := w.next(); err != nil {
				return n, err
			}
		}
		chunk := p
		if room := w.limit - w.written; int64(len(chunk)) > room {
			chunk = chunk[:room]
		}
		if _, err := w.file.Write(chunk); err != nil {
			return n, err
		}
		w.partSum.Write(chunk)
		w.total.Write(chunk)
		w.written += int64(len(chunk))
		w.size += int64(len(chunk))
		n += len(chunk)
		p = p[len(chunk):]
	}
	return n, nil
}

func (w *partWriter) next() error {
	if err := w.finish(); err != nil {
		return err
	}
	if len(w.parts) >= MaxParts {
		return fmt.Errorf("archive needs more than %d parts", MaxParts)
	}
	name := PartName(len(w.parts))
	file, err := os.OpenFile(filepath.Join(w.dir, name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	w.file, w.written, w.partSum = file, 0, sha256.New()
	w.parts = append(w.parts, Part{Name: name})
	return nil
}

func (w *partWriter) finish() error {
	if w.file == nil {
		return nil
	}
	err := w.file.Close()
	w.file = nil
	last := &w.parts[len(w.parts)-1]
	last.Size = w.written
	last.SHA256 = hex.EncodeToString(w.partSum.Sum(nil))
	return err
}

// Pack writes site as page-major ustar + zstd parts into outDir, which must not contain parts already.
func Pack(ctx context.Context, site, outDir string, options PackOptions) (PackResult, error) {
	limit := options.PartBytes
	if limit <= 0 || limit > PartBytes {
		limit = PartBytes
	}
	entries, err := orderFiles(site, options.LocalePrefixes)
	if err != nil {
		return PackResult{}, err
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return PackResult{}, err
	}
	parts := &partWriter{dir: outDir, limit: limit, total: sha256.New()}
	encoder, err := zstd.NewWriter(parts,
		zstd.WithEncoderLevel(zstd.SpeedBetterCompression),
		zstd.WithWindowSize(WindowBytes),
		zstd.WithEncoderCRC(true),
	)
	if err != nil {
		return PackResult{}, err
	}
	archive := tar.NewWriter(encoder)
	result := PackResult{}
	epoch := time.Unix(0, 0).UTC()
	fail := func(err error) (PackResult, error) {
		_ = encoder.Close()
		_ = parts.finish()
		for _, part := range parts.parts {
			_ = os.Remove(filepath.Join(outDir, part.Name))
		}
		return PackResult{}, err
	}
	for _, item := range entries {
		if err := ctx.Err(); err != nil {
			return fail(err)
		}
		name := "site/" + item.rel
		if err := ValidatePath(name, item.dir); err != nil {
			return fail(err)
		}
		header := &tar.Header{Name: name, Mode: 0o644, ModTime: epoch, Typeflag: tar.TypeReg, Format: tar.FormatUSTAR}
		if item.dir {
			header.Name, header.Mode, header.Typeflag = name+"/", 0o755, tar.TypeDir
			if err := archive.WriteHeader(header); err != nil {
				return fail(fmt.Errorf("%s: %w", name, err))
			}
			continue
		}
		file, err := os.Open(filepath.Join(site, filepath.FromSlash(item.rel)))
		if err != nil {
			return fail(err)
		}
		info, err := file.Stat()
		if err == nil && info.Size() > MaxFileBytes {
			err = fmt.Errorf("%s is larger than %d bytes", item.rel, MaxFileBytes)
		}
		if err == nil {
			header.Size = info.Size()
			err = archive.WriteHeader(header)
		}
		if err == nil {
			_, err = io.CopyN(archive, file, header.Size)
		}
		file.Close()
		if err != nil {
			return fail(fmt.Errorf("%s: %w", name, err))
		}
		result.Files++
		result.ExpandedBytes += header.Size
		if strings.HasSuffix(item.rel, ".html") {
			result.Pages++
		}
	}
	if err := archive.Close(); err != nil {
		return fail(err)
	}
	if err := encoder.Close(); err != nil {
		return fail(err)
	}
	if err := parts.finish(); err != nil {
		return fail(err)
	}
	if len(parts.parts) == 0 {
		return fail(errors.New("empty archive"))
	}
	if result.Files == 0 {
		return fail(errors.New("site has no files"))
	}
	result.Parts = parts.parts
	result.Size = parts.size
	result.SHA256 = hex.EncodeToString(parts.total.Sum(nil))
	return result, nil
}
