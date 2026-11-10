# API (Express + TypeScript + Prisma)
# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
# node_modules completo: inclui o Prisma CLI (para "migrate deploy") e o client já gerado
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
# Anexos dos lançamentos (foto/PDF). Em produção monte um volume persistente aqui
# (no Coolify: Storages → Volume, destino /data/anexos). Sem volume, os anexos somem a cada deploy.
ENV UPLOADS_DIR=/data/anexos
RUN mkdir -p /data/anexos && chown -R node:node /data
USER node
EXPOSE 3333
# Aplica as migrações pendentes e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
