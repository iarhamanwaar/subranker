# Multi-stage so the published image carries no compiler, no test suite and no
# dev dependencies — only what is needed to serve requests.
FROM node:20-alpine AS build
WORKDIR /app

# corepack pins pnpm to the version in package.json, so a build here matches a
# build on a contributor's machine.
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Dependencies are installed before the source is copied, so editing a source
# file does not invalidate the dependency layer.
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod


FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Runs unprivileged. The image is likely to sit on a box beside other
# services, and nothing here needs root.
RUN addgroup -S app && adduser -S -G app app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app
EXPOSE 7010

# The server binds loopback by default, which is right behind a reverse proxy
# but wrong inside a container: nothing outside could reach it.
ENV HOST=0.0.0.0
ENV PORT=7010

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7010)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
