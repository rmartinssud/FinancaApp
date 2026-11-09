-- Ajuste de saldo: lançamento que acerta o saldo da conta com o do banco.
-- Não entra em receitas/despesas do mês nem nas categorias.
ALTER TABLE "transactions" ADD COLUMN "isAdjustment" BOOLEAN NOT NULL DEFAULT false;
