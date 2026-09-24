ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-slim

# Set production environment
ENV NODE_ENV=production

WORKDIR /app

# Copy all files
COPY . .

# Install dependencies
RUN npm install

# Install ts-node and required types
RUN npm install -g ts-node
RUN npm install  @types/node tsconfig-paths

# Expose port
EXPOSE 3003

# Run with ts-node
CMD ["ts-node", "--project", "apps/nestjs-fastify-undici/tsconfig.app.json", "-r", "tsconfig-paths/register", "apps/nestjs-fastify-undici/src/main.ts"]
