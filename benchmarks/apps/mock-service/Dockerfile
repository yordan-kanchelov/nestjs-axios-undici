ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-slim

# Set production environment
ENV NODE_ENV=production

WORKDIR /app

# Copy all files
COPY . .

# Install dependencies
RUN npm install

# Install ts-node for running TypeScript directly
RUN npm install -g ts-node
RUN npm install -D @types/node tsconfig-paths

# Expose port
EXPOSE 3001

# Run with ts-node
CMD ["ts-node", "--project", "apps/mock-service/tsconfig.app.json", "apps/mock-service/src/main.ts"]
