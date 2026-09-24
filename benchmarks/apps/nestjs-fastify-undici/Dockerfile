ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-slim

WORKDIR /app

COPY . .

# Install from the lockfile, including devDependencies: the apps run through the
# workspace's pinned TypeScript/ts-node (a global ts-node pulls in the latest
# TypeScript, whose 7.x native compiler has no JS API and crashes ts-node).
# Then install the library build from .lib/ (see scripts/pack-lib.sh).
RUN npm ci --include=dev && node scripts/install-lib.js

ENV NODE_ENV=production

EXPOSE 3003

CMD ["node_modules/.bin/ts-node", "--transpile-only", "--project", "apps/nestjs-fastify-undici/tsconfig.app.json", "-r", "tsconfig-paths/register", "apps/nestjs-fastify-undici/src/main.ts"]
