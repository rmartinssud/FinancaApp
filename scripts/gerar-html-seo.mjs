// Gera dist/educacao-ssi.html a partir do dist/index.html do Vite (rode depois do "vite build").
// Em /educacao/* o Nginx serve este arquivo com SSI ligado: o bloco entre <!-- seo:inicio --> e
// <!-- seo:fim --> vira um include de /api/seo/head, que devolve título, descrição, Open Graph e JSON-LD
// da página. Assim o Google e a prévia do WhatsApp veem as tags sem rodar JavaScript.
// Se a API cair, o Nginx usa o bloco "seo_padrao" (as tags normais do index.html).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(raiz, process.argv[2] ?? "dist");
const html = readFileSync(path.join(dist, "index.html"), "utf8");

const re = /<!--\s*seo:inicio[\s\S]*?-->([\s\S]*?)<!--\s*seo:fim\s*-->/;
const m = html.match(re);
if (!m) {
  console.error("gerar-html-seo: marcadores <!-- seo:inicio --> / <!-- seo:fim --> não encontrados no dist/index.html");
  process.exit(1);
}
const padrao = m[1].trim();
const ssi = [
  `<!--# block name="seo_padrao" -->${padrao}<!--# endblock -->`,
  // $seo_uri: o endereço original pedido (definido no nginx.conf antes do rewrite)
  `<!--# include virtual="/api/seo/head?path=$seo_uri" stub="seo_padrao" -->`,
].join("\n    ");
writeFileSync(path.join(dist, "educacao-ssi.html"), html.replace(re, ssi));
console.log("gerar-html-seo: dist/educacao-ssi.html criado.");
