# MoeNotes deploy image: the Go server alone. It serves the live build from the /data volume and installs the site
# builds GitHub Actions publishes as Releases; it never renders the site itself. See docs/deployment.md.

# The source digest names what the image's site sources are, so the server can tell a new image needs a new build.
# Only the files that shape the site go into this stage (the same set the digest covers).
FROM golang:1.25-alpine AS build
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/moenotes ./cmd/moenotes
COPY astro.config.mjs package.json bun.lock tsconfig.json /site/
COPY src/ /site/src/
COPY public/ /site/public/
RUN /out/moenotes source-digest /site > /out/source-digest
# Offline smoke test: a broken server fails the image build, so the running deployment stays up.
RUN /out/moenotes self-check

FROM alpine:3.24
RUN apk add --no-cache ca-certificates tini tzdata
COPY --from=build /out/moenotes /usr/local/bin/moenotes
COPY --from=build /out/source-digest /app/source-digest

# The commit the build comes from; the image has no .git. Zeabur provides ZEABUR_GIT_COMMIT_SHA at build time, other
# builds pass --build-arg MOENOTES_REVISION=$(git rev-parse HEAD). GitHub Actions checks out exactly this commit.
ARG ZEABUR_GIT_COMMIT_SHA=""
ARG MOENOTES_REVISION=${ZEABUR_GIT_COMMIT_SHA}
ENV MOENOTES_REVISION=${MOENOTES_REVISION} \
    MOENOTES_SOURCE_DIGEST_FILE=/app/source-digest \
    MOENOTES_DATA_DIR=/data
EXPOSE 80

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["moenotes", "serve"]
