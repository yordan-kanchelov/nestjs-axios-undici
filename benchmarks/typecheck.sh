#!/bin/bash

echo "Type checking all apps..."

apps=("mock-service" "nestjs-express-axios" "nestjs-fastify-axios" "nestjs-fastify-undici" "nestjs-express-axios-interceptor" "nestjs-fastify-axios-interceptor" "nestjs-fastify-undici-interceptor")

for app in "${apps[@]}"; do
  echo "Checking $app..."
  cd "apps/$app" && npx tsc --noEmit -p tsconfig.app.json
  if [ $? -ne 0 ]; then
    echo "Type check failed for $app"
    exit 1
  fi
  cd ../..
done

echo "Type checking completed successfully!"