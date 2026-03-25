FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server-deps
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001
ENV FFMPEG_PATH=/usr/bin/ffmpeg

COPY server ./server
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY --from=client-build /app/client/dist ./client/dist

EXPOSE 3001
CMD ["node", "server/index.js"]
