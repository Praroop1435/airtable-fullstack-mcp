# Generated for Glama & Containerized MCP deployment
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY src ./src

RUN npm ci && npm run build

FROM node:20-slim AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY skills ./skills
COPY README.md LICENSE ./

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/index.js"]
