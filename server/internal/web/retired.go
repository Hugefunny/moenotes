package web

import "strings"

// IsRetiredRoomCheckPath blocks stale bookmarks and clients after the room tool was withdrawn.
func IsRetiredRoomCheckPath(path string) bool {
	return path == "/api/room-check" || strings.HasPrefix(path, "/api/room-check/") ||
		strings.HasSuffix(strings.TrimRight(path, "/"), "/tools/room-check") ||
		strings.Contains(path, "/tools/room-check/")
}
