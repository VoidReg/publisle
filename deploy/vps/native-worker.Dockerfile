FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS native
WORKDIR /native
COPY deploy/vps/native-runtime/package.json deploy/vps/native-runtime/package-lock.json ./
COPY packages/research/package.json ./research.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY deploy/vps/install-native-artifact.mjs ./install-native-artifact.mjs
RUN node install-native-artifact.mjs

FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS runtime
WORKDIR /app
COPY deploy/vps/runtime/package.json deploy/vps/runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=native /publisle-pdf /usr/local/bin/publisle-pdf
COPY --from=native /fonts /app/fonts
COPY --from=native /native-fonts.json /app/native-fonts.json
COPY packages/pdf-service/dist/worker.mjs /app/worker.mjs
ENV HOME=/tmp VIPS_CONCURRENCY=1 MALLOC_ARENA_MAX=2
USER 1000:1000
ENTRYPOINT ["node", "--max-old-space-size=96", "/app/worker.mjs"]
