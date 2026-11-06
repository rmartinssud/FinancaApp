import { PrismaClient } from "@prisma/client";

// Uma única conexão com o banco para o app inteiro
export const prisma = new PrismaClient();
