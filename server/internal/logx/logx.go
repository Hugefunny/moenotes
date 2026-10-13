// Package logx prints the server's one-line log format: `<UTC timestamp> [moenotes] <message>`.
package logx

import (
	"fmt"
	"os"
	"sync"
	"time"
)

var mu sync.Mutex

// Printf writes one log line to standard output.
func Printf(format string, args ...any) {
	line := fmt.Sprintf("%s [moenotes] %s\n", time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), fmt.Sprintf(format, args...))
	mu.Lock()
	defer mu.Unlock()
	_, _ = os.Stdout.WriteString(line)
}

// Duration formats an elapsed time as `45s`, `4m10s` or `1h02m`.
func Duration(d time.Duration) string {
	seconds := int64(d.Round(time.Second) / time.Second)
	if seconds < 0 {
		seconds = 0
	}
	if seconds < 60 {
		return fmt.Sprintf("%ds", seconds)
	}
	minutes := seconds / 60
	if minutes < 60 {
		return fmt.Sprintf("%dm%02ds", minutes, seconds%60)
	}
	return fmt.Sprintf("%dh%02dm", minutes/60, minutes%60)
}
