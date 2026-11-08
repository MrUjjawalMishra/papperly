#!/usr/bin/env bash
set -euo pipefail
scanner_container="papperly-clamav-ci-${GITHUB_RUN_ID:-local}"
cleanup() { docker rm -f "$scanner_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$scanner_container" --memory=2g --cpus=2 \
  -p 127.0.0.1:33310:3310 \
  -v "$PWD/apps/scanner/clamd.conf:/etc/clamav/clamd.conf:ro" \
  clamav/clamav:1.5.4@sha256:6d87c712e3391e13c1ba6e05dfb074d4b1ddb5a6834b23bb9da990d2a4ef042a
if ! node scripts/wait-clamav.mjs; then
  docker logs --tail 60 "$scanner_container"
  exit 1
fi
node scripts/verify-clamav.mjs
docker build -t papperly-scanner-ci apps/scanner
