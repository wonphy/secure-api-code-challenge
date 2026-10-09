FROM node:22-alpine AS build

WORKDIR /workspace
COPY . .
RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @secure-api/gateway run build \
  && pnpm --filter @secure-api/gateway deploy --prod /opt/service

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /opt/service ./

EXPOSE 3000
CMD ["node", "dist/server.js"]
