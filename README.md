# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

links uteis de consulta

Tailwinds comandos
https://tailwindcss.com/docs/editor-setup

Exemplo template
https://preview.themeforest.net/item/finpoan-fintech-banking-and-finance-wordpress-theme/full_screen_preview/53265487?_ga=2.94111257.504905309.1727747333-1217794908.1727747333&_gac=1.26546511.1727747333.Cj0KCQjwmOm3BhC8ARIsAOSbapUYCejmUcBW2g8Oy1PBr5meG0o_W4iUhCkHQAh6l0TKXp19lb-uXcwaAnypEALw_wcB

fontawesome icones free
https://fontawesome.com/search?q=money&o=r&m=free

Bliclioteca de icons varias
https://react-icons.github.io/react-icons/search/#q=



---

## Backend e login (Fase 2)

### Stack

- **API:** Node.js 22, Express 5 e TypeScript (pasta `server/`)
- **Banco:** PostgreSQL com Prisma (ORM e migrações)
- **Login:** Better Auth — cadastro com verificação de email, recuperação de senha, 2FA (TOTP, app autenticador) e login com Google opcional
- **Segurança:** Helmet, CORS restrito ao frontend, limite de tentativas no login, cookies `httpOnly`
- **Frontend:** Vite + React com telas de entrar, cadastro, verificação, senha, 2FA e área logada
- **Testes:** Vitest + Supertest (banco de teste próprio)

### Rodando localmente

1. Tenha um PostgreSQL rodando (instalado na máquina ou via Docker:
   `docker run -d --name financas-db -e POSTGRES_USER=financas -e POSTGRES_PASSWORD=financas -e POSTGRES_DB=financas -p 5432:5432 postgres:17`).
2. Copie as variáveis: `cp server/.env.example server/.env` e preencha (veja a tabela abaixo).
3. Instale tudo: `npm run setup` (frontend e servidor).
4. Crie as tabelas: `cd server && npx prisma migrate dev && cd ..`
5. Suba frontend + API juntos: `npm run dev` → abra http://localhost:5173 (o Vite repassa `/api` para a porta 3333).
6. Testes: `npm test` na raiz (ou `cd server && npx vitest run`). Os testes usam o banco definido em `server/.env.test`.

Sem SMTP configurado, os links de verificação e de troca de senha aparecem no console do servidor.

### Variáveis de ambiente (`server/.env`)

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Endereço do banco PostgreSQL (`postgresql://usuario:senha@host:5432/banco?schema=public`). |
| `BETTER_AUTH_SECRET` | Segredo que assina as sessões. Mínimo 32 caracteres; gere com `openssl rand -hex 32`. Nunca compartilhe. |
| `BETTER_AUTH_URL` | Endereço público onde o `/api` é acessado. No dev é `http://localhost:5173`; em produção, seu domínio (ex.: `https://app.seudominio.com.br`). |
| `FRONTEND_URL` | Endereço do site. Usado no CORS e nos links dos emails. |
| `PORT` | Porta da API (padrão `3333`). |
| `COOKIE_SECURE` | `true` = cookies só por HTTPS. Em produção já é `true` por padrão; use `false` só enquanto a VPS não tiver HTTPS. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Servidor de email para enviar verificação e recuperação de senha (opcional). |
| `SMTP_FROM` | Remetente dos emails (ex.: `Finanças Pessoais <nao-responda@seudominio.com.br>`). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login com Google (opcional). O botão só aparece com os dois preenchidos. URL de retorno no Google Cloud: `<BETTER_AUTH_URL>/api/auth/callback/google`. |
| `AUTH_RATE_LIMIT` | Tentativas de login por IP a cada 15 min (padrão: 30 em produção, 1000 em dev/teste). |
| `NODE_ENV` | `development`, `test` ou `production` (o Docker já define `production`). |

### Deploy na VPS (Contabo) com Docker

Arquivos: `server/Dockerfile` (API), `Dockerfile.web` (site no Nginx), `nginx.conf` e `docker-compose.yml` (Postgres 17 + API + Nginx na porta 80).

1. Na VPS, instale Docker e o plugin Compose, e clone o repositório.
2. Crie `server/.env` a partir do `server/.env.example`, com `BETTER_AUTH_URL` e `FRONTEND_URL` apontando para o seu domínio (ou `http://IP-da-VPS`).
   O `DATABASE_URL` é sobrescrito pelo compose para usar o Postgres do próprio compose.
3. (Recomendado) Crie um `.env` na raiz com `POSTGRES_PASSWORD=uma-senha-forte`.
4. Suba tudo: `docker compose up -d --build`
   A API aplica as migrações sozinha (`prisma migrate deploy`) ao iniciar. Logs: `docker compose logs -f server`.
5. Os dados do banco ficam no volume `pgdata` (sobrevivem a reinícios e rebuilds).

**Próximo passo: HTTPS.** Aponte o domínio para o IP da VPS e use o certbot (Let's Encrypt) com Nginx — por exemplo, um Nginx/certbot no host na frente do container, ou um container de proxy com HTTPS automático. Enquanto estiver só em HTTP, use `COOKIE_SECURE=false`, senão o login não mantém a sessão.

### Trocando o banco de dados

- **Postgres da VPS (ou outro servidor):** basta mudar o `DATABASE_URL` no `server/.env` (e remover a linha `DATABASE_URL` do `docker-compose.yml`, se não for usar o Postgres do compose). Depois: `cd server && npx prisma migrate deploy`.
- **MySQL:** em `server/prisma/schema.prisma`, troque `provider = "postgresql"` por `provider = "mysql"`, ajuste o `DATABASE_URL` (`mysql://usuario:senha@host:3306/banco`), apague a pasta `server/prisma/migrations` e gere as migrações de novo com `npx prisma migrate dev --name init`. Revise campos com tipos específicos do Postgres antes.
