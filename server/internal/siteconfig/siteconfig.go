// Package siteconfig holds the facts about the site that the TypeScript sources own (src/config): the locales and
// their path prefixes, the player page rules and the default public data endpoints. scripts/generate-runtime-config.ts
// writes site.json from those sources; `bun run lint` fails when the committed copy is stale.
package siteconfig

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
)

//go:embed site.json
var siteJSON []byte

// Locale is one supported UI locale and the path prefix its pages live under ("" for the default locale).
type Locale struct {
	Code   string `json:"code"`
	Prefix string `json:"prefix"`
}

type document struct {
	Locales []Locale `json:"locales"`
	Player  struct {
		Path    string `json:"path"`
		Servers []struct {
			Server    string `json:"server"`
			ProfileID string `json:"profileId"`
		} `json:"servers"`
		MaxJpProfileID string `json:"maxJpProfileId"`
	} `json:"player"`
	Upstream struct {
		AssetAPI              string `json:"assetApi"`
		AssetVersionPath      string `json:"assetVersionPath"`
		Masterdata            string `json:"masterdata"`
		MasterdataVersionPath string `json:"masterdataVersionPath"`
	} `json:"upstream"`
}

// Site is the parsed configuration.
type Site struct {
	doc        document
	prefixes   map[string]string
	profileIDs map[string]*regexp.Regexp
	playerPath *regexp.Regexp
}

var current = mustParse(siteJSON)

func mustParse(raw []byte) *Site {
	site, err := Parse(raw)
	if err != nil {
		panic(fmt.Sprintf("siteconfig: invalid site.json: %v", err))
	}
	return site
}

// Parse reads a site.json document.
func Parse(raw []byte) (*Site, error) {
	var doc document
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}
	if len(doc.Locales) == 0 {
		return nil, errors.New("no locales")
	}
	site := &Site{doc: doc, prefixes: map[string]string{}, profileIDs: map[string]*regexp.Regexp{}}
	defaults := 0
	for _, locale := range doc.Locales {
		if locale.Code == "" {
			return nil, errors.New("locale without a code")
		}
		if locale.Prefix == "" {
			defaults++
			continue
		}
		if !regexp.MustCompile(`^[a-z-]+$`).MatchString(locale.Prefix) {
			return nil, fmt.Errorf("unsupported locale prefix %q", locale.Prefix)
		}
		site.prefixes[locale.Prefix] = locale.Code
	}
	if defaults != 1 {
		return nil, errors.New("exactly one locale must have no path prefix")
	}
	if !strings.HasPrefix(doc.Player.Path, "/") || strings.HasSuffix(doc.Player.Path, "/") {
		return nil, fmt.Errorf("invalid player path %q", doc.Player.Path)
	}
	for _, server := range doc.Player.Servers {
		pattern, err := regexp.Compile(server.ProfileID)
		if err != nil {
			return nil, fmt.Errorf("profile ID pattern of %s: %w", server.Server, err)
		}
		site.profileIDs[server.Server] = pattern
	}
	site.playerPath = regexp.MustCompile(`^(?:/([a-z-]+))?` + regexp.QuoteMeta(doc.Player.Path) + `/([a-z]+)/(\d+)/?$`)
	if doc.Upstream.AssetAPI == "" || doc.Upstream.Masterdata == "" {
		return nil, errors.New("missing upstream origins")
	}
	return site, nil
}

// Current is the configuration embedded in the binary.
func Current() *Site { return current }

// Locales lists every supported locale in display order.
func (s *Site) Locales() []Locale { return append([]Locale(nil), s.doc.Locales...) }

// LocaleCodes lists the locale codes in display order.
func (s *Site) LocaleCodes() []string {
	codes := make([]string, 0, len(s.doc.Locales))
	for _, locale := range s.doc.Locales {
		codes = append(codes, locale.Code)
	}
	return codes
}

// IsLocalePrefix reports whether a first path segment is a locale prefix (`ja`, `zh-tw`).
func (s *Site) IsLocalePrefix(segment string) bool {
	_, ok := s.prefixes[segment]
	return ok
}

// PlayerPage is a player named by a site path.
type PlayerPage struct {
	Prefix    string
	Server    string
	ProfileID string
}

// ParsePlayerPath returns the player a site path names (`/u/tw/21139118822`, `/ja/u/jp/1`).
func (s *Site) ParsePlayerPath(pathname string) (PlayerPage, bool) {
	match := s.playerPath.FindStringSubmatch(pathname)
	if match == nil {
		return PlayerPage{}, false
	}
	prefix, server, id := match[1], match[2], match[3]
	if prefix != "" && !s.IsLocalePrefix(prefix) {
		return PlayerPage{}, false
	}
	pattern, ok := s.profileIDs[server]
	if !ok || !pattern.MatchString(id) {
		return PlayerPage{}, false
	}
	// JP IDs are signed int64: compare 19-digit IDs as decimal text, as the TypeScript check does.
	if server == "jp" && len(id) >= len(s.doc.Player.MaxJpProfileID) && id > s.doc.Player.MaxJpProfileID {
		return PlayerPage{}, false
	}
	return PlayerPage{Prefix: prefix, Server: server, ProfileID: id}, true
}

// PlayerShellPath is the static shell serving a player page (`/ja/u/`).
func (s *Site) PlayerShellPath(pathname string) (string, bool) {
	player, ok := s.ParsePlayerPath(pathname)
	if !ok {
		return "", false
	}
	prefix := ""
	if player.Prefix != "" {
		prefix = "/" + player.Prefix
	}
	return prefix + s.doc.Player.Path + "/", true
}

// AssetAPI is the public asset service origin: PUBLIC_ASSET_API when set, as the site build reads it.
func (s *Site) AssetAPI() string {
	if value := strings.TrimSpace(os.Getenv("PUBLIC_ASSET_API")); value != "" {
		return strings.TrimRight(value, "/")
	}
	return strings.TrimRight(s.doc.Upstream.AssetAPI, "/")
}

// MasterdataOrigin is the public metadata service origin.
func (s *Site) MasterdataOrigin() string { return strings.TrimRight(s.doc.Upstream.Masterdata, "/") }

// AssetVersionURL is the asset service's release manifest.
func (s *Site) AssetVersionURL() string { return s.AssetAPI() + s.doc.Upstream.AssetVersionPath }

// MasterdataVersionURL is the metadata service's version manifest.
func (s *Site) MasterdataVersionURL() string {
	return s.MasterdataOrigin() + s.doc.Upstream.MasterdataVersionPath
}
