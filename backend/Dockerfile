FROM node:20-alpine AS build

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json* ./
COPY packages/contracts /app/packages/contracts
RUN npm ci

COPY backend/. .
RUN npm run build

FROM node:20-alpine

WORKDIR /app/backend

LABEL org.opencontainers.image.source="https://github.com/zamo24/geochannel"
LABEL org.opencontainers.image.licenses="Apache-2.0"

COPY backend/package.json backend/package-lock.json* ./
COPY packages/contracts /app/packages/contracts
RUN npm ci --omit=dev

COPY --from=build /app/backend/dist ./dist
COPY LICENSE NOTICE /licenses/

EXPOSE 8081

CMD ["node", "--experimental-specifier-resolution=node", "dist/index.js"]
