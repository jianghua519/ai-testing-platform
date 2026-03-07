# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim

WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-yaml \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/control-plane/package.json ./apps/control-plane/package.json
COPY apps/web-worker/package.json ./apps/web-worker/package.json
COPY packages/dsl-compiler/package.json ./packages/dsl-compiler/package.json
COPY packages/playwright-adapter/package.json ./packages/playwright-adapter/package.json
COPY packages/web-dsl-schema/package.json ./packages/web-dsl-schema/package.json

RUN --mount=type=cache,target=/root/.npm npm ci
RUN --mount=type=cache,target=/root/.cache/ms-playwright npx playwright install --with-deps chromium

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY contracts ./contracts
COPY docs ./docs
COPY README.md ./

RUN npm run build

EXPOSE 8080

CMD ["node", "./scripts/start_control_plane_server.mjs"]
