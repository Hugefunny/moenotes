// Package artifact defines the site build artifact that GitHub Actions publishes and the deploy server installs.
//
// The archive is one POSIX ustar stream compressed with zstd. Files are ordered page-major: the thirteen locale
// copies of a page follow each other, so the compressor's window covers them and the near-identical copies cost
// almost nothing (a 4.6 GiB site packs into about 30 MiB). The compressed stream is split into numbered parts
// (`site.tar.zst.000`, `.001`, ...) of at most PartBytes each, well under GitHub's 2 GiB per Release asset; their
// concatenation is the stream. `site-manifest.json` names every part with its size and SHA-256.
package artifact

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/StarMoe-org/moenotes/server/internal/upstream"
)

const (
	// Schema is the manifest version this server reads and writes.
	Schema = 2
	// Format names the archive encoding in the manifest.
	Format = "tar+zstd"
	// ManifestName is the Release asset holding the manifest.
	ManifestName = "site-manifest.json"
	// PartPrefix starts every part's asset name; the index follows as three digits.
	PartPrefix = "site.tar.zst."

	// PartBytes is the default and maximum part size.
	PartBytes int64 = 1 << 30
	// MaxParts bounds the number of parts (and so the compressed size).
	MaxParts = 32
	// MaxExpandedBytes bounds the unpacked site.
	MaxExpandedBytes int64 = 64 << 30
	// MaxFileBytes bounds a single file of the site.
	MaxFileBytes int64 = 1 << 30
	// MaxFiles bounds the number of files of the site.
	MaxFiles = 2_000_000
	// MaxManifestBytes bounds the manifest download.
	MaxManifestBytes = 64 << 10
	// WindowBytes is the zstd window the packer uses; the installer accepts up to MaxWindowBytes.
	WindowBytes    = 64 << 20
	MaxWindowBytes = 128 << 20
)

// Part is one numbered piece of the compressed stream.
type Part struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

// PartName is the asset name of part index.
func PartName(index int) string { return fmt.Sprintf("%s%03d", PartPrefix, index) }

// Manifest describes one published site build (`site-manifest.json`).
type Manifest struct {
	Schema   int                  `json:"schema"`
	Key      string               `json:"key"`
	Revision string               `json:"revision"`
	Commit   string               `json:"commit"`
	Data     upstream.DataVersion `json:"data"`
	BuiltAt  string               `json:"builtAt"`
	Locales  []string             `json:"locales"`
	Format   string               `json:"format"`
	// Size and SHA256 cover the whole compressed stream (all parts concatenated).
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
	Parts  []Part `json:"parts"`
	// Files and ExpandedBytes count the regular files of the site and their bytes; the installer requires both.
	Files         int64 `json:"files"`
	ExpandedBytes int64 `json:"expandedBytes"`
	Pages         int64 `json:"pages"`
}

// Expected is the build identity the server asked for.
type Expected struct {
	Key      string
	Revision string
	Commit   string
	Data     upstream.DataVersion
}

var (
	hex16  = regexp.MustCompile(`^[a-f0-9]{16}$`)
	hex40  = regexp.MustCompile(`^[a-f0-9]{40}$`)
	hex64  = regexp.MustCompile(`^[a-f0-9]{64}$`)
	stamp  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$`)
	errBad = errors.New("invalid site manifest")
)

func text(value string, maxLength int) bool {
	if value == "" || len(value) > maxLength || !utf8.ValidString(value) {
		return false
	}
	for _, r := range value {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}

// ParseManifest decodes and validates a manifest against the expected build and the supported locales.
func ParseManifest(raw []byte, expected Expected, locales []string) (*Manifest, error) {
	if len(raw) > MaxManifestBytes {
		return nil, fmt.Errorf("%w: larger than %d bytes", errBad, MaxManifestBytes)
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	var m Manifest
	if err := decoder.Decode(&m); err != nil {
		return nil, fmt.Errorf("%w: %v", errBad, err)
	}
	if decoder.More() {
		return nil, fmt.Errorf("%w: trailing data", errBad)
	}
	if err := m.Validate(expected, locales); err != nil {
		return nil, err
	}
	return &m, nil
}

// Validate checks the manifest's identity, integrity fields and bounds.
func (m *Manifest) Validate(expected Expected, locales []string) error {
	fail := func(format string, args ...any) error {
		return fmt.Errorf("%w: %s", errBad, fmt.Sprintf(format, args...))
	}
	if m.Schema != Schema {
		return fail("unsupported schema %d", m.Schema)
	}
	for _, field := range []struct {
		name, got, want string
		pattern         *regexp.Regexp
	}{
		{"key", m.Key, expected.Key, hex16}, {"revision", m.Revision, expected.Revision, hex16},
		{"commit", m.Commit, expected.Commit, hex40},
	} {
		if !field.pattern.MatchString(field.got) || !field.pattern.MatchString(field.want) || field.got != field.want {
			return fail("%s mismatch", field.name)
		}
	}
	if !text(m.Data.Fingerprint, 16_384) || m.Data.Fingerprint != expected.Data.Fingerprint {
		return fail("data.fingerprint mismatch")
	}
	if !text(m.Data.Label, 1024) || m.Data.Label != expected.Data.Label {
		return fail("data.label mismatch")
	}
	if !stamp.MatchString(m.BuiltAt) {
		return fail("invalid builtAt")
	}
	built, err := time.Parse(time.RFC3339Nano, m.BuiltAt)
	if err != nil || built.Before(time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)) || built.After(time.Now().Add(24*time.Hour)) {
		return fail("unsafe builtAt")
	}
	if len(m.Locales) != len(locales) {
		return fail("must list every supported locale exactly once")
	}
	seen := map[string]bool{}
	for _, locale := range m.Locales {
		if seen[locale] || !slices.Contains(locales, locale) {
			return fail("must list every supported locale exactly once")
		}
		seen[locale] = true
	}
	if m.Format != Format {
		return fail("unsupported format %q", m.Format)
	}
	if !hex64.MatchString(m.SHA256) {
		return fail("invalid sha256")
	}
	if len(m.Parts) == 0 || len(m.Parts) > MaxParts {
		return fail("must have 1 to %d parts", MaxParts)
	}
	var total int64
	for index, part := range m.Parts {
		if part.Name != PartName(index) {
			return fail("part %d must be named %s", index, PartName(index))
		}
		if part.Size <= 0 || part.Size > PartBytes || (index < len(m.Parts)-1 && part.Size != m.Parts[0].Size) {
			return fail("invalid size of %s", part.Name)
		}
		if !hex64.MatchString(part.SHA256) {
			return fail("invalid sha256 of %s", part.Name)
		}
		total += part.Size
	}
	if m.Size != total {
		return fail("size does not match its parts")
	}
	if m.Files <= 0 || m.Files > MaxFiles {
		return fail("invalid file count")
	}
	if m.ExpandedBytes <= 0 || m.ExpandedBytes > MaxExpandedBytes {
		return fail("invalid expanded size")
	}
	if m.Pages < 0 || m.Pages > m.Files {
		return fail("invalid page count")
	}
	return nil
}

var reservedName = regexp.MustCompile(`(?i)^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)`)

// ValidatePath checks an archive path: `site/...`, relative, without traversal, and portable to every filesystem
// the server may run on.
func ValidatePath(name string, directory bool) error {
	parts := strings.Split(name, "/")
	if len(name) > 1024 || !utf8.ValidString(name) || len(parts) > 32 || parts[0] != "site" || (!directory && len(parts) == 1) {
		return fmt.Errorf("unsafe archive path: %q", name)
	}
	for _, part := range parts {
		if part == "" || part == "." || part == ".." || strings.ContainsAny(part, `\:`) ||
			strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") || reservedName.MatchString(part) {
			return fmt.Errorf("unsafe archive path: %q", name)
		}
		for _, r := range part {
			if r < 0x20 || r == 0x7f {
				return fmt.Errorf("unsafe archive path: %q", name)
			}
		}
	}
	return nil
}
