FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN NODE_ENV=production npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production APP_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package*.json ./
RUN mkdir -p /var/lib/nagano/data /var/lib/nagano/backups /var/lib/nagano/keys && chown -R node:node /var/lib/nagano
USER node
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
