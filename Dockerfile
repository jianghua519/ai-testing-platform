# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-yaml \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/web-dsl-schema/package.json ./packages/web-dsl-schema/package.json
COPY packages/dsl-compiler/package.json ./packages/dsl-compiler/package.json
COPY packages/playwright-adapter/package.json ./packages/playwright-adapter/package.json
COPY apps/web-worker/package.json ./apps/web-worker/package.json
COPY apps/control-plane/package.json ./apps/control-plane/package.json
COPY apps/ai-orchestrator/package.json ./apps/ai-orchestrator/package.json

RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY contracts ./contracts
COPY docs ./docs
COPY README.md ./

RUN npm run build

FROM node:22-bookworm-slim AS app-runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-yaml \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app ./

EXPOSE 8080

CMD ["node", "./scripts/start_control_plane_server.mjs"]

FROM mcr.microsoft.com/playwright:v1.58.2-noble AS playwright-runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-yaml \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app ./

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

CMD ["sleep", "infinity"]
