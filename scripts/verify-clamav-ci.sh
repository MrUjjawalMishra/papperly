#!/usr/bin/env bash
set -euo pipefail
scanner_container="papperly-clamav-ci-${GITHUB_RUN_ID:-local}"
scanner_container_id=""
cleanup() { if [[ -n "$scanner_container_id" ]]; then docker rm -f "$scanner_container_id" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
scanner_container_id="$(docker run -d --name "$scanner_container" --memory=2g --cpus=2 \
  -p 127.0.0.1:33310:3310 \
  -v "$PWD/apps/scanner/clamd.conf:/etc/clamav/clamd.conf:ro" \
  -v "$PWD/apps/scanner/start-clamav.sh:/papperly/start-clamav.sh:ro" \
  -v /etc/ssl/certs/ca-certificates.crt:/etc/ssl/certs/ca-certificates.crt:ro \
  -e SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
  --entrypoint /bin/sh \
  clamav/clamav:1.5.4@sha256:6d87c712e3391e13c1ba6e05dfb074d4b1ddb5a6834b23bb9da990d2a4ef042a /papperly/start-clamav.sh)"
if ! node scripts/wait-clamav.mjs; then
  docker logs --tail 60 "$scanner_container"
  exit 1
fi
node scripts/verify-clamav.mjs
docker build -t papperly-scanner-ci apps/scanner
