FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.json tsconfig.typecheck.json turbo.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile

RUN pnpm build

FROM node:22-alpine AS production

WORKDIR /app

RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/packages/hybrid-rag-cli/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/packages/hybrid-rag-cli/package.json ./package.json

USER appuser

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js", "server"]
