FROM node:22-alpine AS build

WORKDIR /workspace
COPY . .
RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @secure-api/backend run build \
  && pnpm --filter @secure-api/backend deploy --prod /opt/service

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /opt/service ./

EXPOSE 3001
CMD ["node", "dist/server.js"]
