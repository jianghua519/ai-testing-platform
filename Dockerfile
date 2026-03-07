FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY contracts ./contracts
COPY README.md ./

RUN npm ci
RUN npm run build

EXPOSE 8080

CMD ["node", "./scripts/start_control_plane_server.mjs"]
