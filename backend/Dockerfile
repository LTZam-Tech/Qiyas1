# TODO(CI-15): pin node:20-alpine by digest (node:20-alpine@sha256:...).
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev for building). CI-15: npm ci installs exactly what
# the lockfile records. backend/package-lock.json is not tracked yet (backend/.gitignore); until
# it is, the build falls back to npm install and says so.
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else echo "WARNING: backend/package-lock.json missing, falling back to npm install (unpinned)" >&2; npm install --no-audit --no-fund; fi

# Copy source code
COPY . .

# Build the TypeScript project
RUN npm run build

# Stage 2: Production runtime
# TODO(CI-15): pin node:20-alpine by digest (node:20-alpine@sha256:...).
FROM node:20-alpine
# Pull the latest Alpine security fixes for OS packages (musl, zlib, pcre2, nghttp2...); CI-7 trivy gate
RUN apk upgrade --no-cache

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies (npm ci when the lockfile is present, see above)
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; \
    else echo "WARNING: backend/package-lock.json missing, falling back to npm install (unpinned)" >&2; npm install --omit=dev --no-audit --no-fund; fi

# The runtime needs only node: drop npm, npx and corepack (and their bundled tar, glob, minimatch,
# sigstore, pacote... that the image scan flags). CI-7
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /root/.npm

# Copy built files from builder stage (dist includes the Qiyas migrations and DGA data)
COPY --from=builder /app/dist ./dist
# The original schema's SQL migrations, applied at start-up before the Qiyas ones
COPY --from=builder /app/db/migrations ./db/migrations

# Create necessary directories; run as the unprivileged node user
RUN mkdir -p uploads evidence-store logs && chown -R node:node uploads evidence-store logs
USER node

# Expose backend port
EXPOSE 8000

# Start server
CMD ["node", "dist/server.js"]
