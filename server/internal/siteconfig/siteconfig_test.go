package siteconfig

import (
	"strings"
	"testing"
)

func TestEmbeddedConfig(t *testing.T) {
	site := Current()
	codes := site.LocaleCodes()
	if len(codes) < 5 || codes[0] != "zh-CN" {
		t.Fatalf("unexpected locales %v", codes)
	}
	if !site.IsLocalePrefix("ja") || site.IsLocalePrefix("xx") || site.IsLocalePrefix("") {
		t.Fatal("locale prefixes")
	}
	if !strings.HasPrefix(site.AssetVersionURL(), "https://") || !strings.HasPrefix(site.MasterdataVersionURL(), "https://") {
		t.Fatal("upstream URLs")
	}
}

func TestPlayerPaths(t *testing.T) {
	site := Current()
	cases := map[string]string{
		"/u/tw/21139118822":          "/u/",
		"/u/tw/21139118822/":         "/u/",
		"/ja/u/jp/59336778464/":      "/ja/u/",
		"/zh-tw/u/kr/41139118822":    "/zh-tw/u/",
		"/u/jp/9223372036854775807":  "/u/",
		"/u/jp/9223372036854775808":  "",
		"/u/jp/10000000000000000000": "",
		"/u/jp/0":                    "",
		"/u/tw/31139118822":          "",
		"/u/xx/21139118822":          "",
		"/xx/u/tw/21139118822":       "",
		"/u/tw":                      "",
		"/u/tw/21139118822/extra":    "",
	}
	for path, want := range cases {
		got, ok := site.PlayerShellPath(path)
		if ok != (want != "") || got != want {
			t.Errorf("%s: got %q (%v), want %q", path, got, ok, want)
		}
	}
}

func TestParseRejectsBrokenDocuments(t *testing.T) {
	for _, raw := range []string{
		`{}`,
		`{"locales":[{"code":"a","prefix":"b"}],"player":{"path":"/u"},"upstream":{"assetApi":"x","masterdata":"y"}}`,
		`{"locales":[{"code":"a","prefix":""}],"player":{"path":"u"},"upstream":{"assetApi":"x","masterdata":"y"}}`,
		`{"locales":[{"code":"a","prefix":""}],"player":{"path":"/u","servers":[{"server":"tw","profileId":"("}]},"upstream":{"assetApi":"x","masterdata":"y"}}`,
	} {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("%s should be refused", raw)
		}
	}
}
