-- Orçamento desarquivado a partir de um mês depois do arquivamento: os meses do meio ficam "pausados"
ALTER TABLE "budgets" ADD COLUMN "pausedMonths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
