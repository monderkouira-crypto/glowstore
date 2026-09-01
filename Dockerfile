FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-spec run codegen
RUN PORT=19800 BASE_PATH=/ pnpm --filter @workspace/glowstore-dz run build
RUN pnpm --filter @workspace/api-server run build

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/frontend
ENV OBJECT_STORAGE_PROVIDER=google

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/artifacts/api-server/dist ./api-dist
COPY --from=build /app/artifacts/glowstore-dz/dist/public ./frontend

EXPOSE 8080
CMD ["node", "--enable-source-maps", "/app/api-dist/index.mjs"]