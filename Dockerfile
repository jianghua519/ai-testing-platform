FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-yaml \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY contracts ./contracts
COPY docs ./docs
COPY README.md ./

RUN npm ci
RUN npx playwright install --with-deps chromium
RUN npm run build

EXPOSE 8080

CMD ["node", "./scripts/start_control_plane_server.mjs"]
