FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev for building)
RUN npm ci

# Copy source code
COPY . .

# Build the TypeScript project
RUN npm run build

# Stage 2: Production runtime
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

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
CMD ["npm", "start"]
