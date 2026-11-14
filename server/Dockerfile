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
# ffmpeg: converte a voz do assistente do WhatsApp (Gemini TTS) para OGG/Opus (nota de voz)
# ghostscript: comprime PDFs de anexo acima de 3 MB (/ebook) antes de gravar
# (fotos usam o sharp, que já vem com a libvips pré-compilada para Alpine/musl via npm: nada a instalar)
RUN apk add --no-cache openssl ffmpeg ghostscript
ENV NODE_ENV=production
# node_modules completo: inclui o Prisma CLI (para "migrate deploy") e o client já gerado
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Artigos da Central de Ajuda (cópia de src/ajuda/artigos): conhecimento do assistente do WhatsApp
COPY ajuda ./ajuda
COPY package.json ./
# Anexos dos lançamentos (foto/PDF). Em produção monte um volume persistente aqui
# (no Coolify: Storages → Volume, destino /data/anexos). Sem volume, os anexos somem a cada deploy.
ENV UPLOADS_DIR=/data/anexos
RUN mkdir -p /data/anexos && chown -R node:node /data
USER node
EXPOSE 3333
# Aplica as migrações pendentes e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
