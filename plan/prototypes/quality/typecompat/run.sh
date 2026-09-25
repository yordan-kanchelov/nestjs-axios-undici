#!/bin/sh
# Compiles usage.template.ts against @nestjs/axios and nestjs-axios-undici (strict). Run from this dir;
# needs ../consumer with both packages installed.
set -u
C=../consumer
for pkg in @nestjs/axios nestjs-axios-undici; do
  f=$C/usage.$(echo $pkg | tr '/@' '__').ts
  sed "s#__PKG__#$pkg#" usage.template.ts > $f
  echo "=== $pkg"
  (cd $C && npx tsc --noEmit --strict --experimentalDecorators --emitDecoratorMetadata --target es2022 --module node16 --moduleResolution node16 --skipLibCheck false --types node $(basename $f)) 2>&1 | grep -E "error TS" | sed -E 's#^[^(]+\(([0-9]+),[0-9]+\)#line \1#' | cut -c1-260
done
