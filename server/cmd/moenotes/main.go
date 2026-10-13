// Command moenotes is the MoeNotes deploy server and its build tooling.
//
//	moenotes [serve]                       serve the live build and install new CI builds (docs/deployment.md)
//	moenotes self-check                    offline smoke test; the image build runs it
//	moenotes pack <site dir> <out dir>     write site.tar.zst.NNN parts and print their summary as JSON (CI)
//	moenotes source-digest [<checkout>]    print the source digest of a checkout (default: current directory)
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/StarMoe-org/moenotes/server/internal/app"
	"github.com/StarMoe-org/moenotes/server/internal/artifact"
	"github.com/StarMoe-org/moenotes/server/internal/config"
	"github.com/StarMoe-org/moenotes/server/internal/siteconfig"
	"github.com/StarMoe-org/moenotes/server/internal/upstream"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	command := "serve"
	if len(args) > 0 {
		command, args = args[0], args[1:]
	}
	switch command {
	case "serve":
		cfg, err := config.Load()
		if err != nil {
			return err
		}
		return app.New(ctx, cfg, siteconfig.Current()).Run(ctx)
	case "self-check", "--self-check":
		return app.SelfCheck(ctx)
	case "pack":
		flags := flag.NewFlagSet("pack", flag.ContinueOnError)
		partBytes := flags.Int64("part-bytes", artifact.PartBytes, "maximum size of one part")
		if err := flags.Parse(args); err != nil {
			return err
		}
		if flags.NArg() != 2 {
			return errors.New("usage: moenotes pack [-part-bytes N] <site dir> <out dir>")
		}
		var prefixes []string
		for _, locale := range siteconfig.Current().Locales() {
			prefixes = append(prefixes, locale.Prefix)
		}
		result, err := artifact.Pack(ctx, flags.Arg(0), flags.Arg(1), artifact.PackOptions{LocalePrefixes: prefixes, PartBytes: *partBytes})
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{
			"format": artifact.Format, "size": result.Size, "sha256": result.SHA256, "parts": result.Parts,
			"files": result.Files, "expandedBytes": result.ExpandedBytes, "pages": result.Pages,
		})
	case "source-digest":
		root := "."
		if len(args) > 0 {
			root = args[0]
		}
		digest, err := upstream.SourceDigest(root)
		if err != nil {
			return err
		}
		fmt.Println(digest)
		return nil
	default:
		return fmt.Errorf("unknown command %q (serve, self-check, pack, source-digest)", command)
	}
}
