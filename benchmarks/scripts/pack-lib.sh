#!/bin/bash
# Builds the library from the repository root and packs it into
# benchmarks/.lib/nestjs-undici-interceptors.tgz, which the benchmark apps
# depend on. Run it before `npm install` in benchmarks/ (and after any change
# to src/) so the benchmarks measure the code in this checkout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/benchmarks/.lib"

cd "$ROOT"
if [ ! -d node_modules ]; then
  npm ci --ignore-scripts
fi
npm run build

mkdir -p "$OUT"
TARBALL=$(npm pack --ignore-scripts --silent --pack-destination "$OUT" | tail -1)
mv "$OUT/$TARBALL" "$OUT/nestjs-undici-interceptors.tgz"
echo "Packed $(node -p "require('./package.json').version") from $(git rev-parse --short HEAD 2>/dev/null || echo 'working tree') -> benchmarks/.lib/nestjs-undici-interceptors.tgz"
