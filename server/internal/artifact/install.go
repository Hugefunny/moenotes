package artifact

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/klauspost/compress/zstd"
)

// Timeout bounds one installation (download, verification and extraction).
const Timeout = 20 * time.Minute

// Source is a published build: its manifest and the download URL of each part, in order.
type Source struct {
	Manifest *Manifest
	PartURLs []string
}

// Install downloads, verifies and extracts a build into staging/site. staging must be an existing, caller-owned
// directory; downloaded parts are kept in staging/parts until extraction succeeds. On error everything Install
// created is removed.
func Install(ctx context.Context, client *http.Client, source Source, staging string, homepages []string) error {
	ctx, cancel := context.WithTimeout(ctx, Timeout)
	defer cancel()
	if len(source.PartURLs) != len(source.Manifest.Parts) {
		return errors.New("part URLs do not match the manifest")
	}
	root, err := filepath.Abs(staging)
	if err != nil {
		return err
	}
	if info, err := os.Lstat(root); err != nil || !info.IsDir() {
		return errors.New("staging must be an existing directory")
	}
	partsDir := filepath.Join(root, "parts")
	site := filepath.Join(root, "site")
	if err := os.Mkdir(partsDir, 0o700); err != nil {
		return err
	}
	defer os.RemoveAll(partsDir)
	if err := os.Mkdir(site, 0o755); err != nil {
		return err
	}
	ok := false
	defer func() {
		if !ok {
			_ = os.RemoveAll(site)
		}
	}()

	whole := sha256.New()
	files := make([]string, len(source.Manifest.Parts))
	for index, part := range source.Manifest.Parts {
		files[index] = filepath.Join(partsDir, part.Name)
		if err := downloadPart(ctx, client, source.PartURLs[index], files[index], part, whole); err != nil {
			return fmt.Errorf("%s: %w", part.Name, err)
		}
	}
	if hex.EncodeToString(whole.Sum(nil)) != source.Manifest.SHA256 {
		return errors.New("archive sha256 mismatch")
	}
	stream, err := openParts(files)
	if err != nil {
		return err
	}
	defer stream.Close()
	stats, err := Extract(ctx, stream, root, Limits{
		ExpandedBytes: source.Manifest.ExpandedBytes, Files: source.Manifest.Files,
	})
	if err != nil {
		return err
	}
	if stats.Files != source.Manifest.Files || stats.Bytes != source.Manifest.ExpandedBytes {
		return fmt.Errorf("archive holds %d files / %d bytes, manifest says %d / %d", stats.Files, stats.Bytes, source.Manifest.Files, source.Manifest.ExpandedBytes)
	}
	for _, home := range homepages {
		info, err := os.Lstat(filepath.Join(site, filepath.FromSlash(home)))
		if err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("missing site homepage %s", home)
		}
	}
	if info, err := os.Lstat(filepath.Join(site, "_astro")); err != nil || !info.IsDir() {
		return errors.New("missing site _astro directory")
	}
	ok = true
	return nil
}

func publicURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Host == "" {
		return nil, errors.New("artifact URL must be public HTTPS without credentials")
	}
	return parsed, nil
}

// downloadPart streams one part to file, checking its size and SHA-256, and feeds the whole-archive hash.
// No credentials are ever attached; redirects (GitHub's asset CDN) are followed only to HTTPS URLs.
func downloadPart(ctx context.Context, client *http.Client, raw, file string, part Part, whole io.Writer) error {
	target, err := publicURL(raw)
	if err != nil {
		return err
	}
	noRedirect := *client
	noRedirect.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	var response *http.Response
	for redirects := 0; ; redirects++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
		if err != nil {
			return err
		}
		request.Header.Set("User-Agent", "moenotes-site-installer")
		response, err = noRedirect.Do(request)
		if err != nil {
			return err
		}
		if response.StatusCode < 300 || response.StatusCode >= 400 || response.StatusCode == http.StatusNotModified {
			break
		}
		response.Body.Close()
		location := response.Header.Get("Location")
		if location == "" || redirects == 5 {
			return errors.New("invalid artifact redirect")
		}
		next, err := target.Parse(location)
		if err != nil {
			return errors.New("invalid artifact redirect")
		}
		if target, err = publicURL(next.String()); err != nil {
			return err
		}
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", response.StatusCode)
	}
	if response.ContentLength >= 0 && response.ContentLength != part.Size {
		return errors.New("download size mismatch")
	}
	out, err := os.OpenFile(file, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(out, hash, whole), io.LimitReader(response.Body, part.Size+1))
	if closeErr := out.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if written != part.Size {
		return errors.New("download size mismatch")
	}
	if hex.EncodeToString(hash.Sum(nil)) != part.SHA256 {
		return errors.New("sha256 mismatch")
	}
	return nil
}

type multiFile struct {
	io.Reader
	files []*os.File
}

func (m *multiFile) Close() error {
	var errs []error
	for _, file := range m.files {
		errs = append(errs, file.Close())
	}
	return errors.Join(errs...)
}

func openParts(paths []string) (io.ReadCloser, error) {
	stream := &multiFile{}
	readers := make([]io.Reader, 0, len(paths))
	for _, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			stream.Close()
			return nil, err
		}
		stream.files = append(stream.files, file)
		readers = append(readers, file)
	}
	stream.Reader = io.MultiReader(readers...)
	return stream, nil
}

// Limits bounds an extraction; zero fields take the package maximums.
type Limits struct {
	ExpandedBytes int64
	Files         int64
	FileBytes     int64
}

// Stats counts what an extraction wrote.
type Stats struct {
	Files int64
	Bytes int64
}

// Extract unpacks a zstd-compressed ustar stream under root. Every entry must be `site/...`; only regular files
// and directories are accepted (no links, devices, PAX or GNU headers). Paths are checked for traversal and for
// case-insensitive duplicates, and nothing outside root is ever written. root/site must already exist.
func Extract(ctx context.Context, compressed io.Reader, root string, limits Limits) (Stats, error) {
	if limits.ExpandedBytes <= 0 || limits.ExpandedBytes > MaxExpandedBytes {
		limits.ExpandedBytes = MaxExpandedBytes
	}
	if limits.Files <= 0 || limits.Files > MaxFiles {
		limits.Files = MaxFiles
	}
	if limits.FileBytes <= 0 || limits.FileBytes > MaxFileBytes {
		limits.FileBytes = MaxFileBytes
	}
	// The memory cap bounds the zstd window and single-segment frames; the unpacked size is limited per entry below.
	decoder, err := zstd.NewReader(compressed,
		zstd.WithDecoderMaxWindow(MaxWindowBytes),
		zstd.WithDecoderMaxMemory(2*MaxWindowBytes),
		zstd.WithDecoderConcurrency(1),
	)
	if err != nil {
		return Stats{}, err
	}
	defer decoder.Close()
	reader := tar.NewReader(decoder)
	stats := Stats{}
	seen := map[string]bool{}
	directories := map[string]bool{"site": true}
	entries := int64(0)
	for {
		if err := ctx.Err(); err != nil {
			return stats, err
		}
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return stats, fmt.Errorf("invalid archive: %w", err)
		}
		entries++
		if entries > limits.Files*2+1024 {
			return stats, errors.New("archive entry count limit exceeded")
		}
		if header.Format != tar.FormatUSTAR && header.Format != tar.FormatUnknown {
			return stats, fmt.Errorf("unsupported archive format for %q: require POSIX ustar", header.Name)
		}
		if len(header.PAXRecords) > 0 || header.Linkname != "" {
			return stats, fmt.Errorf("unsupported archive entry %q", header.Name)
		}
		directory := header.Typeflag == tar.TypeDir
		if !directory && header.Typeflag != tar.TypeReg {
			return stats, fmt.Errorf("unsupported archive entry type %q for %q: only regular files and directories", header.Typeflag, header.Name)
		}
		name := strings.TrimPrefix(header.Name, "./")
		if directory {
			name = strings.TrimSuffix(name, "/")
		}
		if err := ValidatePath(name, directory); err != nil {
			return stats, err
		}
		key := strings.ToLower(name)
		if seen[key] {
			return stats, fmt.Errorf("duplicate archive path: %s", name)
		}
		seen[key] = true
		parts := strings.Split(name, "/")
		for i := 1; i < len(parts); i++ {
			parent := strings.Join(parts[:i], "/")
			if directories[parent] {
				continue
			}
			if seen[strings.ToLower(parent)] {
				return stats, fmt.Errorf("archive path %s is below a file", name)
			}
			if err := os.Mkdir(filepath.Join(root, filepath.FromSlash(parent)), 0o755); err != nil {
				return stats, err
			}
			directories[parent] = true
			seen[strings.ToLower(parent)] = true
		}
		target := filepath.Join(root, filepath.FromSlash(name))
		if directory {
			if header.Size != 0 {
				return stats, fmt.Errorf("archive directory %s has a size", name)
			}
			if !directories[name] {
				if err := os.Mkdir(target, 0o755); err != nil {
					return stats, err
				}
				directories[name] = true
			}
			continue
		}
		if header.Size < 0 || header.Size > limits.FileBytes || stats.Bytes+header.Size > limits.ExpandedBytes {
			return stats, errors.New("archive expanded/file size limit exceeded")
		}
		stats.Files++
		if stats.Files > limits.Files {
			return stats, errors.New("archive file count limit exceeded")
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err != nil {
			if errors.Is(err, fs.ErrExist) {
				return stats, fmt.Errorf("duplicate archive path: %s", name)
			}
			return stats, err
		}
		written, err := io.Copy(out, io.LimitReader(reader, header.Size))
		if closeErr := out.Close(); err == nil {
			err = closeErr
		}
		if err != nil {
			return stats, err
		}
		if written != header.Size {
			return stats, errors.New("truncated archive")
		}
		stats.Bytes += written
	}
	// Anything after the tar end marker (other than zero padding) is an error.
	rest, err := io.Copy(io.Discard, io.LimitReader(&nonZero{reader: decoder}, 1<<20))
	if err != nil {
		return stats, fmt.Errorf("invalid archive: %w", err)
	}
	if rest != 0 {
		return stats, errors.New("archive has data after its end marker")
	}
	return stats, nil
}

// nonZero passes through only nonzero bytes, so trailing tar padding reads as empty.
type nonZero struct{ reader io.Reader }

func (n *nonZero) Read(p []byte) (int, error) {
	for {
		count, err := n.reader.Read(p)
		kept := 0
		for _, b := range p[:count] {
			if b != 0 {
				p[kept] = b
				kept++
			}
		}
		if kept > 0 || err != nil {
			return kept, err
		}
	}
}
