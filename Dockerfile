FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts/build.mjs scripts/build.mjs
COPY web web
COPY painel-negocio-3.html ./
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server server
COPY --from=build /app/dist dist
USER node
EXPOSE 3000
CMD ["npm", "start"]
