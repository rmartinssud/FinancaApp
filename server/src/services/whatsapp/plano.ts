// ─────────────────────────────────────────────
// Quem pode usar o WhatsApp (bot e alertas).
//
// Ponto único para a Fase 9 (planos e assinaturas) ligar os limites por plano:
// hoje todo mundo pode. Toda entrada do WhatsApp passa por aqui (ligar número,
// mensagens recebidas e alertas), então basta mudar esta função.
// ─────────────────────────────────────────────

export async function podeUsarWhatsApp(_quem: { userId: string; householdId?: string | null }): Promise<boolean> {
  return true;
}
