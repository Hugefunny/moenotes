package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/web"
)

func TestRetiredRoomToolNeverReachesAccountProxy(t *testing.T) {
	calls := 0
	account := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = w.Write([]byte(`{"user":null}`))
	}))
	defer account.Close()
	cfg := testConfig(t)
	cfg.APIOrigin = account.URL
	handler := (&Server{cfg: cfg, site: siteconfig.Current(), store: &Store{Roots: &web.RootSource{}}}).routes()
	paths := []string{"/api/room-check", "/api/room-check/", "/api/room-check/v1/rooms/create", "/api/room-check/v1/rooms/1234567/watch", "/api/room-check/v1/rooms/1234567/events?watch=old", "/api/room-check/v1/rooms/1234567/probe/leave"}
	for _, locale := range []string{"", "/zh-tw", "/ja", "/en", "/ko", "/th", "/id", "/vi", "/es", "/pt", "/fr", "/de", "/ru"} {
		paths = append(paths, locale+"/tools/room-check", locale+"/tools/room-check/")
	}
	for _, path := range paths {
		for _, method := range []string{http.MethodGet, http.MethodPost, http.MethodDelete} {
			got := httptest.NewRecorder()
			handler.ServeHTTP(got, httptest.NewRequest(method, "http://site"+path, nil))
			if got.Code != http.StatusGone || got.Header().Get("Cache-Control") != "no-store" {
				t.Errorf("%s %s: got %d, cache=%q", method, path, got.Code, got.Header().Get("Cache-Control"))
			}
		}
	}
	if calls != 0 {
		t.Fatalf("retired requests reached account service %d times", calls)
	}
	me := httptest.NewRecorder()
	handler.ServeHTTP(me, httptest.NewRequest(http.MethodGet, "http://site/api/me", nil))
	if me.Code != http.StatusOK || !strings.Contains(me.Body.String(), `"user":null`) || calls != 1 {
		t.Fatalf("account API should remain available: %d %q calls=%d", me.Code, me.Body.String(), calls)
	}
}
