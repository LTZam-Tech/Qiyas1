#!/bin/sh
# Builds an offline release package (docs/phase1/09 §4): container images, deployment
# files and a checksum manifest, transferable to a client without internet access.
#   ./make-release.sh 1.0.0      → release/qiyas-1.0.0/
# The package holds code and the official DGA data only; no client data.
set -eu
VERSION="${1:?usage: make-release.sh <version>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../release/qiyas-$VERSION"
mkdir -p "$OUT"

export QIYAS_VERSION="$VERSION"
docker compose -f "$HERE/docker-compose.yml" --env-file "$HERE/.env.example" build api web
docker pull postgres:16-alpine
docker pull redis:7-alpine
docker pull cgr.dev/chainguard/minio@sha256:18c8fa28697b25e0f34c6faae171079e88a03efb8e76a21d3b5d07b4e3cbef3e
docker pull clamav/clamav:1.4

docker save -o "$OUT/images.tar" \
  "qiyas-api:$VERSION" "qiyas-web:$VERSION" \
  postgres:16-alpine redis:7-alpine cgr.dev/chainguard/minio@sha256:18c8fa28697b25e0f34c6faae171079e88a03efb8e76a21d3b5d07b4e3cbef3e clamav/clamav:1.4

cp "$HERE/docker-compose.yml" "$HERE/.env.example" "$HERE/README.md" "$OUT/"
sed -i.bak "s/^QIYAS_VERSION=.*/QIYAS_VERSION=$VERSION/" "$OUT/.env.example" && rm -f "$OUT/.env.example.bak"
# the compose file builds from source in development; the package runs the saved images
sed -i.bak '/^    build:/,/^      dockerfile:/d' "$OUT/docker-compose.yml" && rm -f "$OUT/docker-compose.yml.bak"
mkdir -p "$OUT/certs"

( cd "$OUT" && find . -type f ! -name SHA256SUMS -exec sha256sum {} + | sort -k2 > SHA256SUMS )
echo "Release ready: $OUT"
