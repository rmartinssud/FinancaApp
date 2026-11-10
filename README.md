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
| `UPLOADS_DIR` | Pasta onde ficam os anexos dos lançamentos (padrão `/data/anexos`). Em produção precisa ser um **volume persistente**. |

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

---

## API de finanças (Fase 3)

Todas as rotas exigem login (cookie da sessão) e trabalham só com os dados da família do usuário. Ids de outra família respondem **404**. Quem tem papel **VIEWER** só pode ler: `POST`, `PATCH` e `DELETE` respondem **403**.

- Dinheiro vai e volta como **texto com 2 casas** (`"10.50"`). Na entrada, aceita texto ou número com até 2 casas (`"10.5"`, `10.5`).
- Mês no formato `AAAA-MM`, sempre no horário de Brasília. Sem `month`, vale o mês atual.
- Datas: `"2026-11-07"` (guardada às 12:00 UTC, não muda de dia) ou data/hora ISO com fuso (`"2026-11-07T14:30:00-03:00"`). Na resposta, ISO em UTC.
- Erros de validação: `400 { "error": "Dados inválidos.", "detalhes": { "campo": ["mensagem"] } }`. Outros erros: `{ "error": "mensagem" }`.

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/transactions?month=&accountId=&categoryId=&type=&accountType=` | Lançamentos do mês, mais recentes primeiro, com `category`, `account`, `notes`, `groupId` e `recurrence`. **Compras no cartão não vêm** (no lugar delas o app mostra a linha da fatura, veja `/invoices`), a não ser que `accountId` seja um cartão ou `accountType=CREDIT_CARD`. `accountType` (`WALLET`/`BANK`/`CREDIT_CARD`) filtra pela forma de pagamento (a tela não usa mais); transferências entram se a origem ou o destino for desse tipo. |
| GET | `/api/transactions/invoices?month=` | Uma linha por cartão com fatura que **vence** no mês: `cardId`, `cardName`, `brand`, `color`, `month`, `total`, `paidAmount`, `remaining`, `dueDate`, `closingDate`, `status` (`OPEN`/`CLOSED`/`PAID`/`OVERDUE`) e `paid` (true/false). Só cartões com compras no mês. O `total` é o mesmo valor que entra como despesa no resumo do mês. |
| POST | `/api/transactions` | Cria receita/despesa: `type` (`INCOME`/`EXPENSE`), `amount` > 0, `description` (1–120), `date`, `accountId`, `categoryId` (opcional, do mesmo tipo), `status` (`CONFIRMED` padrão ou `PENDING`), `notes` (opcional, até 1000). Repetição (opcional): `recurrence` = `NONE` (padrão), `INSTALLMENT` (parcelar: divide `amount` em `times` meses, 2–48, centavos na 1ª), `REPEAT` (repetir: o mesmo `amount` por `times` meses) ou `FIXED` (fixa mensal: 12 meses, o mesmo valor). Com repetição, cria um lançamento por mês com o mesmo `groupId`; o 1º segue o `status` e os outros ficam `PENDING`; parcelar/repetir têm `installmentNumber`/`installmentTotal` ("2/6"). A resposta é o 1º lançamento com `group` (todos). Transferência: veja a Fase 3b (sem repetição). |
| PATCH | `/api/transactions/:id` | Altera qualquer um dos campos acima (menos a repetição), inclusive `notes` (`""` ou `null` limpa). Num lançamento de repetição, mexe **só nele**. Compra no cartão e pagamento de fatura não se alteram por aqui (409). |
| DELETE | `/api/transactions/:id` | Apaga o lançamento (204). Parcela de compra no cartão apaga a compra inteira; pagamento de fatura é desfeito. Lançamento de repetição (parcelar/repetir/fixa): apaga **só ele**. |
| GET | `/api/categories?type=` | Categorias da família (`INCOME` ou `EXPENSE`). |
| POST | `/api/categories` | Cria: `name` (1–40), `type`, `color` (`#RRGGBB`), `icon` e, para subcategoria, `parentId` (categoria principal do mesmo tipo; um nível só). |
| PATCH | `/api/categories/:id` | Altera `name`, `color`, `icon` ou `parentId` (o tipo não muda). |
| DELETE | `/api/categories/:id` | Apaga (e as subcategorias); os lançamentos ficam sem categoria (204). |
| GET | `/api/accounts?type=` | Contas com `currentBalance` = saldo inicial + receitas − despesas + transferências recebidas − enviadas (só confirmados). Compras no cartão não mexem no saldo. |
| POST | `/api/accounts` | Cria: `name`, `type` (`WALLET`/`BANK`/`CREDIT_CARD`), `initialBalance` (padrão 0). `creditLimit`, `closingDay` e `dueDay` só para cartão. |
| PATCH | `/api/accounts/:id` | Altera a conta. Se deixar de ser cartão, os campos de cartão são limpos. |
| DELETE | `/api/accounts/:id` | Apaga a conta e os lançamentos dela, inclusive transferências (204). A última conta (que não seja cartão) não pode ser apagada (409). |
| POST | `/api/accounts/:id/adjust` | Ajustar saldo: recebe `balance` (saldo real hoje) e lança a diferença como "Ajuste de saldo" (`isAdjustment`). Não vale para cartão (400). Se já bate, `adjustment: null`. |
| GET | `/api/summary?month=` | Resumo do mês (só confirmados): `totals` (receitas, despesas, saldo), `byCategory` (despesas por categoria, maior primeiro) e `accounts` com saldo atual. Transferências não entram; compras no cartão contam no mês do **vencimento da fatura**. Ajustes de saldo não entram. |

## Transferências, cartões e faturas (Fase 3b)

**Transferência** é um lançamento só (`type: "TRANSFER"`) com `accountId` (origem) e `toAccountId` (destino), as duas contas da família, diferentes e que não sejam cartão. Tira da origem, põe no destino e não conta como receita nem despesa. `description` é opcional (vira "Transferência"); não tem categoria. Editar ou apagar mexe nas duas pontas de uma vez.

**Cartão de crédito** é uma conta do tipo `CREDIT_CARD` (os cartões criados na Fase 3 continuam valendo). Cada **fatura** é identificada pelo mês do **vencimento** (`AAAA-MM`). Compra feita **no dia do fechamento ou depois** vai para a fatura seguinte. Ex.: fecha dia 3 e vence dia 10 → compra em 05/11 entra na fatura que vence em 10/12 (`2026-12`).

**Compra no cartão**: cada parcela é um lançamento `EXPENSE` no cartão com `invoiceMonth` (mês da fatura), `purchaseId` (igual para todas as parcelas) e `installmentNumber`/`installmentTotal` ("2/10"). O valor total é dividido; os centavos que sobram ficam na 1ª parcela. A compra conta como despesa no mês do vencimento da fatura e não mexe no saldo das contas.

**Pagar fatura** cria uma transferência da conta escolhida para o cartão com `invoiceMonth`: o saldo da conta diminui e **não** conta como despesa de novo. Apagar esse pagamento desfaz o pagamento. Compras numa fatura que já tem pagamento ficam travadas (409) até o pagamento ser desfeito.

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/transactions` | Transferência: `type: "TRANSFER"`, `amount`, `date`, `accountId` (origem), `toAccountId` (destino), `description` (opcional), `status`. |
| GET | `/api/cards?archived=true` | Cartões ativos (ou arquivados) com `usedLimit`, `availableLimit`, `currentInvoice` (fatura aberta hoje) e `closedInvoice` (fatura anterior ainda a pagar). |
| POST | `/api/cards` | Cria: `name`, `brand` (`VISA`/`MASTERCARD`/`ELO`/`AMEX`/`HIPERCARD`/`OTHER`), `creditLimit`, `closingDay`, `dueDay`, `color` (`#RRGGBB`), `paymentAccountId` (opcional; conta ou carteira, nunca outro cartão). |
| GET | `/api/cards/:id` | Um cartão com limite e fatura atual. |
| PATCH | `/api/cards/:id` | Altera os campos acima; `{ "archived": true }` arquiva e `false` reativa. |
| GET | `/api/cards/:id/invoices/:month` | Fatura do mês (ou `atual`): `closingDate`, `dueDate`, `status` (`OPEN`/`CLOSED`/`PAID`/`OVERDUE`), `total`, `paid`, `remaining`, `purchases` e `payments`. |
| POST | `/api/cards/:id/invoices/:month/pay` | Paga a fatura: `accountId` (padrão: conta de pagamento do cartão), `date` (padrão: agora), `amount` (padrão: o que falta). 409 se já estiver paga. |
| POST | `/api/card-expenses` | Compra: `cardId`, `amount` (total), `description`, `categoryId` (despesa, opcional), `date` (da compra), `installments` (1–24, padrão 1), `currentInstallment` (opcional, 1 até `installments`, padrão 1: compra já em andamento, veja abaixo), `invoiceMonth` (opcional, "AAAA-MM": fatura escolhida para a 1ª parcela lançada quando o banco lançou a compra em outra fatura; de 1 mês antes a 2 meses depois da automática, senão 400 "Escolha uma fatura próxima da data da compra."). Devolve `{ purchaseId, invoiceMonth, installments }`. |
| GET | `/api/card-expenses/:purchaseId` | A compra com todas as parcelas e `invoiceMonth` (fatura da 1ª parcela lançada). |
| PUT | `/api/card-expenses/:purchaseId` | Refaz a compra com os dados novos (troca todas as parcelas de uma vez). Aceita `currentInstallment` e `invoiceMonth` como o POST (sem `invoiceMonth` volta para a fatura automática). Mover para uma fatura com pagamento dá 409. |
| DELETE | `/api/card-expenses/:purchaseId` | Apaga a compra e as parcelas (204). |

**Compra parcelada já em andamento** (`currentInstallment` > 1): para compras que começaram antes de usar o app. `currentInstallment` é a parcela que cai na **fatura atual** do cartão (onde entraria uma compra feita hoje). Mande `amount` com o valor **total** da compra e `date` com a data **original** (não pode ser depois de hoje). O total é dividido entre todas as parcelas, como no banco, mas só são lançadas as parcelas de `currentInstallment` até o fim: a parcela atual na fatura atual e as seguintes nas próximas faturas, com os rótulos certos ("4/10" … "10/10"). A data de cada parcela é a data da compra + (parcela − 1) meses, só para exibir. Ex.: compra de R$ 1.000 em 10x feita em julho, parcela 4 na fatura atual → 7 parcelas de R$ 100, a primeira na fatura atual. Assim o limite usado e o total das faturas mostram só o que falta pagar. Ao editar, a 1ª parcela existente diz qual era a parcela atual. As regras de fatura com pagamento (409) continuam valendo.

### Saldo não bate com o banco?
1. Confira o **saldo inicial** da conta: ele deve ser o saldo do banco no dia em que você começou a usar o app. Não lance de novo despesas antigas que já estavam descontadas nesse saldo.
2. Lançamentos **pendentes** não mexem no saldo até serem confirmados.
3. Veja se cada receita e despesa foi lançada na **conta certa**.
4. Se ainda houver diferença, vá em **Contas**, toque na conta e use **Ajustar saldo**: digite o saldo que aparece no banco hoje. O ajuste não conta como receita nem despesa do mês e pode ser apagado.

### Usando a tela de Lançamentos

- **Topo**: o título, o **total da aba** (Despesas: total de despesas; Receitas: total de receitas; Transfs: total transferido; Extrato: receitas − despesas) e o mês (‹ Novembro ›). Ajustes de saldo não entram no total.
- **Barra de baixo** com 4 abas: **Despesas**, **Receitas**, **Transfs** (transferências e pagamentos de fatura) e **Extrato** (tudo). O botão **+** fica logo acima da barra.
- **Compras no cartão não aparecem uma a uma.** Em Despesas e no Extrato aparece **uma linha por cartão**: "Fatura Nubank", com o total da fatura que vence no mês, o dia do vencimento e a situação (aberta, fechada, paga, vencida). Toque nela para abrir a fatura do cartão naquele mês. As compras ficam em **Cartões** → cartão → fatura. O total da fatura é o mesmo que entra como despesa no Início.
- **Nova Receita / Nova Despesa** (botão +): abre em tela cheia, com **Salvar** no canto de cima. Campos: Descrição, Valor, **Repetição**, Data (vencimento), **Efetivada** (ligado = pago/recebido; desligado = pendente, não mexe no saldo), Categoria (o **+** cria uma categoria nova), Conta e, em **Mais informações**, **Observações**.
- **Repetição**:
  - **Não recorrente**: um lançamento só.
  - **Parcelar ou repetir**: diga quantas vezes (2 a 48). **Parcelar** divide o valor (R$ 300 em 3x → 3 × R$ 100, os centavos que sobram vão na 1ª); **Repetir** lança o mesmo valor todo mês. Cada um aparece no seu mês com o selo "2/3".
  - **Fixa mensal**: lança este mês e os próximos 11 (12 no total), com o selo "Fixa".
  - Só o 1º lançamento segue o "Efetivada"; os dos meses seguintes ficam **pendentes** e são efetivados automaticamente quando a data chega (a não ser que **Não efetivar automaticamente** esteja ligado). Alterar ou apagar um deles mexe **só naquele** lançamento.
- Os campos de **Mais informações** (Subcategoria, Tags, Multicategorias, Data lançamento, Encargos/Desconto, Anexo, Não efetivar automaticamente e os "Ignorar em…") estão explicados em [Campos extras do lançamento](#campos-extras-do-lançamento).
- **Despesa cartão** (no botão +) e **Ajuste de saldo** (em Contas) continuam como antes.

### Começando com um cartão que já está em uso

1. **Cadastre o cartão** com o limite total e os dias de **fechamento** e **vencimento**. Use como fechamento o dia da **"melhor data de compra"** que o app do banco mostra (compras desse dia em diante já vão para a fatura seguinte).
2. **Compras à vista da fatura atual**: lance cada uma com a **data real** da compra. Elas caem na fatura aberta, como no banco.
3. **Parcelados em andamento**: logo depois de criar o cartão o app pergunta "Já tem compras parceladas neste cartão?" (ou use **Lançar compra em andamento** na fatura do cartão). Em **Despesa cartão**, escolha as parcelas, ligue **Compra já em andamento** e informe o **valor total**, a **data da compra** e a **parcela desta fatura** (ex.: 4 de 10). O app lança só as parcelas que faltam, a partir da fatura atual.
4. **Compra em outra fatura no banco**: se o app do banco mostra uma compra numa fatura diferente da que o app sugere (comum em compras feitas perto do fechamento, que o banco lança depois, ou quando o fechamento muda por fim de semana/feriado), troque a fatura no formulário da compra — **Fatura: ‹ outubro de 2026 (vence 30/10) ›** — para a mesma do banco. Dá para escolher de 1 mês antes a 2 meses depois da fatura automática; nos parcelados, as parcelas seguintes acompanham. Para corrigir uma compra já lançada, abra a compra na fatura e troque ali.
5. **Confira com o banco**: o total da fatura atual e o **limite disponível** do app devem bater com o app do banco. Se o limite não bater, falta lançar algum parcelado ou as compras de uma fatura já fechada que você ainda não pagou.

## Família e espaços (Fase 4)

Um login pode participar de **vários espaços**. Cada espaço tem as próprias contas, cartões, categorias e lançamentos — nada passa de um para o outro.

- **Seu espaço**: criado no cadastro, com tudo o que você já lançou. Você pode **convidar a família direto para ele**: quem entra vê o histórico e lança junto. Não pode ser apagado; pode ser renomeado (ex.: "Família Martins").
- Quem é convidado continua com o **espaço pessoal dele**, que só ele vê (ex.: a filha com renda própria).
- **Criar espaço** é opcional, só para separar algo à parte (ex.: uma empresa).

### Como usar

1. **Dividir com a família**: no seu espaço, menu **Família** → **Convidar pessoa**. Se quiser, renomeie o espaço no lápis. Não precisa cadastrar nada de novo.
2. **Trocar de espaço**: o mesmo **Espaço ▾** lista todos os seus espaços. Ao escolher, o app recarrega com os dados daquele espaço. O servidor lembra o último espaço usado.
3. **Convidar**: menu **Família** → **Convidar pessoa**. Escolha o papel e:
   - **Enviar convite**: manda um email com o link;
   - **Copiar link**: copia o link para mandar no WhatsApp.
   O link vale por **7 dias** e só pode ser usado **uma vez**. Em **Convites pendentes** dá para **reenviar** (gera um link novo e o antigo para de valer) ou **cancelar**.
4. **Aceitar**: quem recebe abre `/convite/…`. Sem login, entra ou cria a conta e volta para o convite; logado, vê o nome do espaço e toca em **Entrar no espaço**. A pessoa continua com o espaço Pessoal dela. O dono recebe um email quando alguém entra ou sai.

### Papéis

| Papel | Pode |
|---|---|
| **Dono** (`OWNER`) | Tudo: lançar, convidar, remover pessoas, mudar papéis, renomear e apagar o espaço. |
| **Membro** (`MEMBER`) | Criar, editar e apagar contas, cartões, categorias e lançamentos. Não mexe nas pessoas. |
| **Somente leitura** (`VIEWER`) | Só vê (a API responde 403 a qualquer `POST`/`PATCH`/`PUT`/`DELETE`; o app esconde o botão + e a edição). |

- Quem não é o único dono pode **Sair do espaço** (menu Família). O **último dono** não pode sair, ser removido nem virar membro: passe o papel de Dono para outra pessoa antes.
- Quem sai ou é removido perde o acesso na hora; os lançamentos que fez continuam no espaço.

### Pessoal × Família (exemplo)

O filho tem **cartão adicional** no cartão do pai. Ele entra na "Família Martins" como **Membro** e lança as compras do adicional **no espaço da Família**, no cartão do pai — cada lançamento mostra a bolinha com a inicial de **quem lançou** (em Lançamentos e na fatura), e em Lançamentos dá para filtrar por **Pessoa** (com o filtro ligado, as compras no cartão aparecem uma a uma). O **salário** e as contas dele ficam no espaço **Pessoal** dele, que o pai não vê.

### API

O espaço ativo vem do header `X-Household-Id` (se enviado: precisa ser membro, senão **403**) ou, sem header, do último espaço usado (`User.lastHouseholdId`), caindo no mais antigo. **Toda** rota de dados confere a participação no banco. Ids de outro espaço respondem 404.

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/me` | Usuário, espaço ativo (`household`: `id`, `name`, `role`, `isPersonal`) e `households` (todos os espaços, com `memberCount` e `active`). |
| GET | `/api/households` | Meus espaços. |
| POST | `/api/households` | Cria espaço: `name` (1–60). Vem com Carteira e categorias padrão, você como `OWNER`, e fica ativo. |
| POST | `/api/households/:id/activate` | Troca o espaço ativo (403 se não for membro). |
| GET | `/api/family` | Espaço ativo, `members` (`userId`, `name`, `email`, `role`, `joinedAt`) e, para o dono, `invites` pendentes. |
| PATCH | `/api/family` | Renomeia o espaço (dono). |
| DELETE | `/api/family` | Apaga o espaço e todos os dados dele (dono; o Pessoal dá 409). |
| POST | `/api/family/invites` | Convida (dono): `email` (opcional; sem email = convite por link) e `role` (`MEMBER` padrão, `VIEWER` ou `OWNER`). Devolve `{ invite, url }`; com email, envia o link. |
| POST | `/api/family/invites/:id/resend` | Link novo (o antigo deixa de valer), mais 7 dias e reenvia o email. Devolve `{ invite, url }`. |
| DELETE | `/api/family/invites/:id` | Cancela o convite (204). |
| PATCH | `/api/family/members/:userId` | Muda o papel (dono). Último dono: 409. |
| DELETE | `/api/family/members/:userId` | Remove do espaço (dono). Último dono: 409. |
| POST | `/api/family/leave` | Sai do espaço ativo (204). Último dono: 409. |
| GET | `/api/invites/:token` | Público: `householdName`, `invitedBy`, `role`, `expiresAt`. Expirado, usado ou cancelado: 404. |
| POST | `/api/invites/:token/accept` | Logado: entra no espaço com o papel do convite e deixa ele ativo. |
| GET | `/api/transactions?createdById=` | Filtro por quem lançou. Todo lançamento devolve `createdBy` (`{ id, name }`, ou `null` se a pessoa apagou a conta). Com `createdById`, as compras no cartão vêm uma a uma. |

Segurança: o token do convite é aleatório (32 bytes) e só o **hash** fica no banco; o link completo aparece só na resposta de criar/reenviar e no email.

## Contas: cheque especial, investimento e logos dos bancos

### Cheque especial
Em **Contas → editar conta bancária**, preencha **Cheque especial (limite)**. A conta pode ficar negativa:
a lista mostra **"Usando R$ X do cheque especial"** (em vermelho) e **"Disponível R$ Y"** (saldo + limite).
Deixe vazio (ou 0) para tirar. Só vale para **Conta bancária** — carteira, investimento e cartão não têm cheque especial.
Na API: `overdraftLimit` (texto, ≥ 0) em `POST/PATCH /api/accounts`; as contas devolvem também `availableBalance`.

### Conta de investimento
Crie uma conta do tipo **Investimento** (corretora, CDB, poupança...). Funciona como as outras contas:
transfira para ela (aporte) e dela (resgate) em Lançamentos, e use **Ajustar saldo** para lançar o rendimento.
Ela aparece num grupo próprio em Contas, entra no **Total** do Início e tem a linha **Investimentos R$ X**.
Na API: `type: "INVESTMENT"`.

### Formulário da conta (tela cheia)
**Nova conta / Editando conta** abre em tela cheia, no mesmo visual de Nova despesa: ✕ · título · **Salvar** · ⋮
(na edição o ⋮ tem **Ajustar saldo** e **Apagar conta**). Linhas: nome + logo (▾ abre a lista de logos),
**Saldo inicial** (pode ser negativo: digite `-`), **Cheque especial** (só Conta corrente),
**Categoria** (Outros, Carteira, Conta corrente, Investimento — cartões ficam em Cartões de crédito),
**Número da conta** e **Dados adicionais** (opcionais), e os interruptores:
- **Conta padrão** — só uma por espaço (marcar uma desmarca a outra); já vem escolhida em nova despesa/receita.
- **Exibir na tela de Resumo** — desligado esconde a conta de "Suas contas" no Início (ela continua no total).
- **Conta para investimentos** — o mesmo que escolher a categoria Investimento.
- **Ignorar nos totais** — fica fora do Total/Investimentos do Início e do "Saldo somado" de Contas.
- **Padrão para importação de notificações** — em breve.

Mudar o saldo inicial ou o cheque especial vale para todo o histórico (o saldo é recalculado a partir do saldo inicial).
Na API (`POST/PATCH /api/accounts`): `type` aceita também `"OTHER"`; `accountNumber` (até 40), `notes` (até 500),
`isDefault`, `showOnSummary` (padrão `true`), `ignoreInTotals` (padrão `false`). `GET /api/summary` devolve
`accountsTotals: { total, investments }` já sem as contas ignoradas.

### Logo do banco
No formulário da conta ou do cartão, toque no logo (ou em **Logo do banco**) e busque pelo nome (ou escolha **Sem logo**).
O logo aparece em Contas, no Início, no desenho do cartão e nos lançamentos. Na API: `bankLogo` (slug ou `null`).

Para adicionar um logo: coloque o SVG em `public/bancos/<slug>.svg` e o slug em
`src/app/dados/bancos.js` **e** em `server/src/lib/bancos.ts` (o servidor só aceita slugs da lista).

**Créditos:** a maior parte dos logos vem do repositório público [Tgentil/Bancos-em-SVG](https://github.com/Tgentil/Bancos-em-SVG).
Os demais (todos otimizados com svgo):
- [Wikimedia Commons](https://commons.wikimedia.org/) (arquivos de logo em domínio público): Agibank, Ágora Investimentos
  (só o símbolo), Banco Modal, Binance, Digio, Genial Investimentos, Mercado Bitcoin, Nomad, Warren Investimentos e Will Bank;
- [simple-icons](https://simpleicons.org/) (CC0, com a cor da marca do próprio simple-icons): Wise;
- sites oficiais das marcas: Avenue (avenue.us), Foxbit (foxbit.com.br), Guide Investimentos (guide.com.br, ícone com a
  cor declarada pelo site), Kinvo (kinvo.com.br), Next (next.me, símbolo), NuInvest (nuinvest.com.br) e Toro Investimentos
  (toroinvestimentos.com.br, só o símbolo).

Os logos são marcas registradas dos seus respectivos donos e são usados aqui só para identificar a conta do usuário.

## Orçamentos

Menu **Planejar → Orçamentos**. Serve para dizer quanto você quer gastar (ou espera receber) e acompanhar mês a mês.
Tudo é do **espaço ativo** (Pessoal, Família...). Quem tem acesso **somente leitura** vê, mas não cria nem altera.

### Despesas × Receitas
A tela tem duas abas independentes:
- **Despesas**: cada orçamento é um **limite de gastos** (ex.: Mercado R$ 1.200,00). A barra fica âmbar ao chegar no
  **alerta** (padrão 80%) e vermelha quando passa de 100% (**Estourado**).
- **Receitas**: cada orçamento é uma **receita esperada** (ex.: Salário R$ 5.000,00). Quando entra tudo, aparece **Alcançado**.

No topo aparecem **Meta**, **Usado** e **Saldo** do mês (somando só os orçamentos comuns; os agrupados não entram, para
não contar duas vezes).

### Criando um orçamento
Toque no **+** e escolha **Orçamento** (ou **Agrupado**, nas despesas). Campos:
- **Descrição**, **cor** e **ícone** (os mesmos ícones das categorias).
- **Período**: **Mensal** (começa no mês de vigência e se repete todo mês até ser arquivado) ou **Personalizado**
  (data de início e de fim — ex.: uma viagem ou um trimestre; ele aparece em todos os meses que o período encosta e
  sempre mostra o total do período inteiro).
- **Meta**: valor fixo. Nas despesas mensais também dá para usar **%**:
  - **% do total de receitas do mês** (as receitas confirmadas — o mesmo número de Receitas no Início), ou
  - **% da meta de um orçamento de receita** (ex.: Moradia = 30% da meta do Salário).
- **Categorias**: uma ou mais. Sem nenhuma, entram todas as despesas (ou receitas) do período.
- **Contas e cartões** (só despesas): uma ou mais. Sem nenhuma, entram todas.
- **Compras no cartão contam pela**: **Data da compra** (padrão) ou **Mês da fatura**.
- **Alerta** (só despesas): o percentual que acende o aviso (padrão 80%). Pode desligar.
- **Previsto** (ligado por padrão): os lançamentos **pendentes** também contam no usado.
- **Considerar contas ignoradas nos totais** (desligado por padrão): inclui as contas marcadas "Ignorar nos totais".
- **Exibir no Início**: mostra o orçamento no cartão **Orçamentos do mês** do Início (até 4).

Transferências, pagamentos de fatura e ajustes de saldo **nunca** contam. Um lançamento que combina com dois
orçamentos (ex.: a mesma categoria nos dois) conta **nos dois**.

> **Dica — cartão de crédito:** se você acompanha o gasto pelo que **paga** no mês, escolha **Mês da fatura**: a compra de
> 05/11 num cartão que fecha dia 3 entra na fatura de dezembro e conta em dezembro. Com **Data da compra**, ela conta em
> novembro (e cada parcela no mês dela).

### Agrupado (ex.: 50/30/20)
O agrupado junta orçamentos **mensais de despesa** já criados e mostra a soma das metas e do usado (não tem filtros nem
meta própria). Na lista, toque na setinha para ver os orçamentos de dentro.

Exemplo **50/30/20** com salário de R$ 5.000,00:
1. Na aba **Receitas**, crie **Salário** com meta de R$ 5.000,00 (categoria Salário).
2. Na aba **Despesas**, crie três orçamentos mensais com meta em **% da meta de um orçamento de receita → Salário**:
   **Essenciais 50%** (Moradia, Mercado, Contas, Saúde, Transporte) = R$ 2.500,00; **Estilo de vida 30%** (Lazer...)
   = R$ 1.500,00; **Prioridades 20%** (Educação, investimentos...) = R$ 1.000,00.
   (Ou use **% do total de receitas do mês** para a meta acompanhar o que realmente entrou.)
3. Toque em **+ → Agrupado**, chame de **50/30/20** e marque os três. O agrupado mostra os R$ 5.000,00 e quanto já foi usado.

O botão **Criar 50/30/20** (quando a aba está vazia) abre o formulário de agrupado com essa dica.

### Detalhes e ações
Toque num orçamento para ver o progresso (**Meta**, **Efetivado**, **Pendente**, **Saldo**), os **lançamentos que
contaram** (tocar abre o lançamento; compra no cartão abre a fatura) e um gráfico dos **últimos 6 meses** (meta × usado).
- **Meta recomendada**: média do usado nos 3 últimos meses completos, arredondada para cima (R$ 10). Aparece quando já
  existem lançamentos desde o primeiro desses meses. **Usar** abre "Alterar meta" com o valor.
- **Editar**: muda tudo. Num mensal com valor fixo, a meta nova vale **do mês aberto em diante**.
- **Alterar meta** (mensal com valor fixo): **Só neste mês** ou **Deste mês em diante**. Os meses anteriores ficam como estavam.
- **Transferir saldo** (mensal de despesa): passa parte do saldo para outro orçamento mensal de despesa, **só no mês**
  (ex.: sobrou R$ 100,00 no Mercado e faltou no Lazer). Não dá para passar mais do que o saldo.
- **Copiar**: abre o formulário preenchido para criar outro parecido.
- **Arquivar**: escolha o mês a partir do qual ele some; os meses anteriores continuam no histórico.
- **Excluir**: apaga o orçamento e o histórico de metas (os lançamentos não mudam). Um orçamento de receita usado como
  base de % por outro não pode ser excluído antes de mudar esse outro.

Apagar uma categoria ou conta tira ela dos filtros dos orçamentos (se não sobrar nenhuma, o orçamento passa a valer
para todas).

### Alertas
Por enquanto os alertas são só **dentro do app**: selo **Alerta**/**Estourado** no orçamento e no cartão do Início.
Avisos por **email** e **WhatsApp** ficam para depois.

### API
Tudo em `/api/budgets` (espaço ativo; VIEWER só faz GET). Dinheiro em texto com 2 casas (`"500.00"`), meses `AAAA-MM`
e datas `AAAA-MM-DD` no horário de Brasília.
- `GET /api/budgets?month=2026-11&kind=EXPENSE|INCOME` → `{ summary: { goal, used, balance }, budgets: [...] }`; cada
  orçamento traz `progress: { goal, confirmed, pending, used, balance, percent, status }` (`status`: `OK`, `ALERT`,
  `OVER`, `REACHED`); agrupados trazem `components`. `&home=true` → só os marcados "Exibir no Início" (até 4) e `total`.
- `GET /api/budgets/:id?month=` → `{ budget, transactions, history (6 meses; null no personalizado), recommended }`.
- `POST /api/budgets` · `PUT /api/budgets/:id` · `DELETE /api/budgets/:id`. Campos: `kind`, `isGroup`, `name`, `color`,
  `icon`, `period` (`MONTHLY`/`CUSTOM`), `startMonth` ou `startDate`/`endDate`, `goalType` (`FIXED`, `PERCENT_INCOME`,
  `PERCENT_BUDGET`), `amount`, `percent`, `percentOfBudgetId`, `categoryIds`, `accountIds`, `componentIds`,
  `includeIgnored`, `includePending`, `cardDateRef` (`PURCHASE`/`INVOICE`), `alertPercent` (ou `null`), `showOnHome`;
  no `PUT`, `goalFromMonth` diz de quando vale a meta fixa nova (padrão: mês atual). O tipo e "agrupado" não mudam na edição.
- `POST /api/budgets/:id/goal { amount, month, scope: "month" | "forward" }` — Alterar meta.
- `POST /api/budgets/transfer { fromId, toId, month, amount }` — Transferir saldo.
- `POST /api/budgets/:id/archive { fromMonth }` (`null` desarquiva) · `GET /api/budgets/:id/recommended`.

No banco: `budgets`, `budget_categories` e `budget_accounts` (filtros; somem junto com a categoria/conta),
`budget_group_items` (agrupados) e `budget_goals` (histórico da meta: `fromMonth`, `amount`, `onlyMonth`; as
transferências são linhas `isTransfer` somadas só naquele mês). Migration `20261111000000_orcamentos`.


## Campos extras do lançamento, Estatísticas e Economia mensal

### Campos extras do lançamento

- **Subcategoria**: em **Categorias**, o botão **+ Sub** cria uma subcategoria dentro de uma categoria (um nível só, mesmo tipo). No formulário, escolha a categoria e depois a subcategoria (o campo fica desligado quando a categoria não tem filhas). O lançamento guarda a subcategoria; o Início ("Despesas por categoria"), as Estatísticas e o histórico da categoria **somam na categoria principal**, e um orçamento filtrado por uma categoria conta também as subcategorias dela. Apagar a principal apaga as subcategorias (os lançamentos ficam sem categoria).
- **Tags**: várias por lançamento, por espaço. A linha **Tags** abre a escolha com "criar tag nova" na hora. Em **Lançamentos** há o filtro **Tag**; em **Categorias → Tags** dá para renomear, trocar a cor e apagar.
- **Multicategorias**: divide o valor entre várias categorias (linhas categoria + valor). A soma tem que bater com o **valor final** (o servidor também confere). Resumo, gráfico por categoria, orçamentos e estatísticas usam a divisão. Não vale para **Parcelar**.
- **Data lançamento**: dia em que você registrou / fez a compra (padrão hoje). Só informativa: o mês do lançamento continua sendo o da **Data (vencimento)**.
- **Encargos / Desconto**: juros/multa somam e desconto subtrai. O **valor final** (valor + encargos − desconto) é o que conta em saldos, resumo, orçamentos e estatísticas; o formulário mostra o detalhamento. Não vale para **Parcelar**.
- **Adicionar anexo**: fotos (JPG, PNG, WEBP, HEIC) ou PDF, até **3 MB** cada e até 10 por lançamento. O servidor confere o tipo pelo conteúdo do arquivo. Só quem é do espaço abre o anexo. Apagar o lançamento apaga os anexos.
- **Não efetivar automaticamente**: receitas e despesas **pendentes** cuja data já chegou são efetivadas sozinhas (o servidor confere no início e a cada hora). Ligado, o lançamento fica pendente até você confirmar, mesmo depois da data. Compras no cartão, transferências e ajustes nunca são efetivados automaticamente. **Os pendentes que já existiam antes desta versão começaram com o interruptor ligado**, para nada mudar de surpresa.
- **Ignorar em…** (cada um só tira o lançamento do seu lugar):
  - **Estatísticas e Gráficos**: fora das telas de estatísticas e do gráfico "Despesas por categoria" do Início.
  - **Orçamentos**: não conta em nenhum orçamento.
  - **Economia mensal**: fora da tela Economia mensal.
  - **Ignorar nos totais**: fora das somas de **Receitas/Despesas/Saldo do mês** no Início (como no Mobills). O **saldo da conta continua real**, considerando o lançamento.
- Quem tem acesso **somente leitura** toca no lançamento e vê os detalhes (com anexos), sem editar.

### Estatísticas e Gráficos (menu → Analisar)

Mês e período (só o mês, ou os últimos 3, 6 ou 12 meses até ele), abas **Despesas/Receitas** e **Incluir pendentes** (padrão: só efetivados). Mostra: rosca **por categoria** (toque numa categoria com subcategorias para ver a divisão delas), **por conta e cartão**, **por tag** (um lançamento com duas tags conta nas duas) e **receitas × despesas** dos últimos 6 ou 12 meses com o saldo. Transferências, pagamentos de fatura e ajustes ficam de fora; compras no cartão contam no mês da fatura.

### Economia mensal (menu → Analisar)

Para cada mês: receitas − despesas = economia, em valor e em % da receita; gráfico dos últimos 12 meses, média, total, melhor e pior mês (a média considera só os meses com lançamentos). Ficam de fora: transferências, ajustes, contas/cartões com "Ignorar nos totais" e lançamentos com "Ignorar em Economia mensal".

### Anexos em produção (volume persistente)

Os arquivos ficam no disco do servidor, na pasta `UPLOADS_DIR` (padrão `/data/anexos`), com nome aleatório; o banco guarda só os metadados. O acesso passa por uma camada pequena (`server/src/services/armazenamento.ts`: salvar / ler / apagar): para mudar de VPS basta **copiar a pasta**; para usar S3 no futuro, troca-se só essa camada.

- **Docker Compose**: já vem com o volume `anexos` montado em `/data/anexos`.
- **Coolify**: no serviço **server**, crie um volume persistente (Persistent Storage → Volume) com destino **`/data/anexos`** e faça o redeploy. Sem o volume, os anexos **somem a cada deploy**. A variável `UPLOADS_DIR` é opcional (o Dockerfile já define `/data/anexos`).
- O Nginx do site aceita corpo de até 4 MB em `/api/` (`client_max_body_size 4m`).

### API

| Rota | O que faz |
|---|---|
| `POST/PATCH /api/transactions` | Aceitam também `launchDate`, `fees`, `discount`, `noAutoConfirm`, `ignoreInStatistics`, `ignoreInBudgets`, `ignoreInMonthlySavings`, `ignoreInTotals`, `tagIds` e `splits` (`[{ categoryId, amount }]`, soma = valor final). `amount` é o valor digitado; o salvo/devolvido em `amount` é o valor final (`baseAmount` traz o digitado). |
| `GET /api/transactions?tagId=` | Filtro por tag. `categoryId` agora traz também as subcategorias e as partes de multicategorias. |
| `GET/POST/PATCH/DELETE /api/tags` | Tags do espaço (com `usage`). |
| `POST /api/transactions/:id/attachments` | Envia um anexo: o arquivo é o corpo, `Content-Type` com o tipo e `X-File-Name` com o nome (encodeURIComponent). 413 acima de 3 MB, 400 para tipo não aceito. |
| `GET/DELETE /api/attachments/:id` | Abre (`?download=1` baixa) ou apaga um anexo. |
| `GET /api/stats?from=&to=&type=&includePending=&categoryId=` | Total e divisões por categoria, subcategoria, conta e tag. |
| `GET /api/stats/evolution?month=&months=&includePending=` | Receitas × despesas mês a mês, saldo e acumulado. |
| `GET /api/savings?month=&months=&includePending=` | Economia mensal, média, melhor e pior mês. |
