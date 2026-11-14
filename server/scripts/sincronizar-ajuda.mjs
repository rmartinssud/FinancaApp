// Copia os artigos da Central de Ajuda (../src/ajuda/artigos) para server/ajuda/artigos.
// A imagem Docker da API só leva a pasta server/, e o assistente do WhatsApp usa esses artigos.
// Rode depois de mudar a Ajuda:  npm run ajuda:sync   (um teste avisa se esquecer)
import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const server = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const origem = path.join(server, "../src/ajuda/artigos");
const destino = path.join(server, "ajuda/artigos");

if (!existsSync(origem)) {
  console.log("Ajuda: pasta de origem não encontrada, nada a sincronizar.");
  process.exit(0);
}
mkdirSync(destino, { recursive: true });
const arquivos = readdirSync(origem).filter((f) => f.endsWith(".md"));
for (const f of readdirSync(destino)) if (f.endsWith(".md") && !arquivos.includes(f)) rmSync(path.join(destino, f));
for (const f of arquivos) copyFileSync(path.join(origem, f), path.join(destino, f));
console.log(`Ajuda: ${arquivos.length} artigos copiados para server/ajuda/artigos.`);
