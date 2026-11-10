import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";

// ─────────────────────────────────────────────
// Armazenamento de anexos. Hoje: disco local, na pasta UPLOADS_DIR (padrão /data/anexos).
// Para mudar de VPS basta copiar a pasta; para usar S3, crie outra implementação
// desta interface e troque em "armazenamento" abaixo. O banco guarda só a chave.
// ─────────────────────────────────────────────

export interface Armazenamento {
  salvar(dados: Buffer, extensao: string): Promise<string>; // devolve a chave
  ler(chave: string): Promise<Buffer>;
  apagar(chave: string): Promise<void>;
}

// Chave: "ab/<32 hex>.<ext>" (subpasta com os 2 primeiros caracteres para não lotar um diretório só)
const CHAVE_VALIDA = /^[0-9a-f]{2}\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

export class ArmazenamentoEmDisco implements Armazenamento {
  constructor(readonly pasta: string) {}

  private caminho(chave: string) {
    if (!CHAVE_VALIDA.test(chave)) throw new Error("Chave de anexo inválida.");
    return path.join(this.pasta, chave);
  }

  async salvar(dados: Buffer, extensao: string) {
    const nome = randomBytes(16).toString("hex");
    const chave = `${nome.slice(0, 2)}/${nome}.${extensao}`;
    const destino = this.caminho(chave);
    await mkdir(path.dirname(destino), { recursive: true });
    await writeFile(destino, dados, { flag: "wx" });
    return chave;
  }

  ler(chave: string) {
    return readFile(this.caminho(chave));
  }

  async apagar(chave: string) {
    try {
      await unlink(this.caminho(chave));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
}

export const pastaDeAnexos = () => process.env.UPLOADS_DIR || "/data/anexos";

let atual: Armazenamento | null = null;
export function armazenamento(): Armazenamento {
  atual ??= new ArmazenamentoEmDisco(pastaDeAnexos());
  return atual;
}

// Apaga os arquivos (erros só vão para o log: o lançamento já foi apagado)
export async function apagarArquivos(chaves: string[]) {
  for (const c of chaves) {
    try {
      await armazenamento().apagar(c);
    } catch (e) {
      console.error("Falha ao apagar anexo", c, e);
    }
  }
}
