# Build
FROM node:26.12.1-bookworm-slim AS build

# Copy, build static files; see .dockerignore for exclusions
WORKDIR /app
COPY . ./
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN npm run deploy

# Dependencies
FROM node:26.12.1-bookworm-slim AS dependencies

# Copy, build static files; see .dockerignore for exclusions
WORKDIR /app
COPY . ./
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN npm ci --ignore-scripts --no-update-notifier --omit=dev

# Pin the patched runtime; the Distroless Node 26 image still ships an older Node.
FROM node:26.12.1-bookworm-slim
ENV NODE_ENV=production

# Copy app and dependencies
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/generated ./generated
COPY --from=build /app/dist ./dist

# Boilerplate, not used in OpenShift/Kubernetes
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3000/api

# Nonroot user; Node 26 automatically respects cgroup memory limits
USER 65532
CMD ["node", "/app/dist/main"]
