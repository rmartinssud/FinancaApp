// Tipos mínimos do "heic-decode" (o pacote não traz os seus)
declare module "heic-decode" {
  interface ImagemHeic {
    width: number;
    height: number;
    decode(): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  }
  interface Decodificar {
    (opcoes: { buffer: ArrayBufferLike | Uint8Array }): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
    all(opcoes: { buffer: ArrayBufferLike | Uint8Array }): Promise<ImagemHeic[]>;
  }
  const decodificar: Decodificar;
  export default decodificar;
}
