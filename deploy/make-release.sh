#!/bin/sh
# Builds an offline release package (docs/phase1/09 §4): container images, deployment
# files and a signed checksum manifest, transferable to a client without internet access.
#   ./make-release.sh 1.0.0      → release/qiyas-1.0.0/
# The package holds code and the official DGA data only; no client data.
#
# N7: SHA256SUMS is signed so that the package carries no trust root of its own.
#   minisign (preferred): QIYAS_MINISIGN_KEY=<path to the secret key>  → SHA256SUMS.minisig
#   cosign (fallback):    QIYAS_COSIGN_KEY=<key path or KMS URI>        → SHA256SUMS.sig
# The public key and the SHA-256 of SHA256SUMS are published out of band (never inside the
# package). Without a signing tool and key the script stops; QIYAS_ALLOW_UNSIGNED=1 builds an
# unsigned package for internal testing only.
# If syft is installed, CycloneDX SBOMs of the two Qiyas images are added to the package.
set -eu
VERSION="${1:?usage: make-release.sh <version>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../release/qiyas-$VERSION"

# Decide how to sign before spending time on the build.
SIGNER=""
if [ -n "${QIYAS_MINISIGN_KEY:-}" ] && command -v minisign >/dev/null 2>&1; then
  SIGNER=minisign
elif [ -n "${QIYAS_COSIGN_KEY:-}" ] && command -v cosign >/dev/null 2>&1; then
  SIGNER=cosign
elif [ "${QIYAS_ALLOW_UNSIGNED:-}" = "1" ]; then
  echo "WARNING: QIYAS_ALLOW_UNSIGNED=1, the release will NOT be signed. Do not ship it to a client." >&2
else
  echo "ERROR: cannot sign the release. Install minisign and set QIYAS_MINISIGN_KEY, or install" >&2
  echo "       cosign and set QIYAS_COSIGN_KEY. (QIYAS_ALLOW_UNSIGNED=1 skips signing, test builds only.)" >&2
  exit 1
fi

mkdir -p "$OUT"

# TODO(CI-15): pin postgres, redis and clamav by digest (image@sha256:...) here, in the
# docker save list below and in deploy/docker-compose.yml, so a release always holds the
# exact images that were scanned. MinIO is already pinned by digest.
POSTGRES_IMAGE=postgres:16-alpine
REDIS_IMAGE=redis:7-alpine
MINIO_IMAGE=cgr.dev/chainguard/minio@sha256:18c8fa28697b25e0f34c6faae171079e88a03efb8e76a21d3b5d07b4e3cbef3e
CLAMAV_IMAGE=clamav/clamav:1.4

export QIYAS_VERSION="$VERSION"
docker compose -f "$HERE/docker-compose.yml" --env-file "$HERE/.env.example" build api web
docker pull "$POSTGRES_IMAGE"
docker pull "$REDIS_IMAGE"
docker pull "$MINIO_IMAGE"
docker pull "$CLAMAV_IMAGE"

docker save -o "$OUT/images.tar" \
  "qiyas-api:$VERSION" "qiyas-web:$VERSION" \
  "$POSTGRES_IMAGE" "$REDIS_IMAGE" "$MINIO_IMAGE" "$CLAMAV_IMAGE"

cp "$HERE/docker-compose.yml" "$HERE/.env.example" "$HERE/README.md" "$OUT/"
sed -i.bak "s/^QIYAS_VERSION=.*/QIYAS_VERSION=$VERSION/" "$OUT/.env.example" && rm -f "$OUT/.env.example.bak"
# the compose file builds from source in development; the package runs the saved images
sed -i.bak '/^    build:/,/^      dockerfile:/d' "$OUT/docker-compose.yml" && rm -f "$OUT/docker-compose.yml.bak"
mkdir -p "$OUT/certs"

# CI-6: SBOMs (covered by SHA256SUMS and therefore by the signature).
if command -v syft >/dev/null 2>&1; then
  syft "qiyas-api:$VERSION" -o "cyclonedx-json=$OUT/sbom-qiyas-api.cdx.json"
  syft "qiyas-web:$VERSION" -o "cyclonedx-json=$OUT/sbom-qiyas-web.cdx.json"
else
  echo "NOTE: syft not found, no SBOM added to the package." >&2
fi

( cd "$OUT" && rm -f SHA256SUMS SHA256SUMS.minisig SHA256SUMS.sig \
  && find . -type f ! -name 'SHA256SUMS*' -exec sha256sum {} + | sort -k2 > SHA256SUMS )

case "$SIGNER" in
  minisign)
    minisign -S -s "$QIYAS_MINISIGN_KEY" -m "$OUT/SHA256SUMS" -x "$OUT/SHA256SUMS.minisig" \
      -t "qiyas $VERSION SHA256SUMS"
    echo "Signed: $OUT/SHA256SUMS.minisig" ;;
  cosign)
    cosign sign-blob --yes --key "$QIYAS_COSIGN_KEY" --output-signature "$OUT/SHA256SUMS.sig" "$OUT/SHA256SUMS"
    echo "Signed: $OUT/SHA256SUMS.sig" ;;
esac

echo "Release ready: $OUT"
echo "Publish out of band: the public key and this digest of the manifest:"
sha256sum "$OUT/SHA256SUMS"
