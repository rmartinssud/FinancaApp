// Traduz os códigos de erro do Better Auth para mensagens em português
const mensagens = {
  INVALID_EMAIL_OR_PASSWORD: "Email ou senha incorretos.",
  INVALID_EMAIL: "Digite um email válido.",
  INVALID_PASSWORD: "Senha incorreta.",
  EMAIL_NOT_VERIFIED: "Confirme seu email antes de entrar. Enviamos um novo link para você.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este email.",
  PASSWORD_TOO_SHORT: "A senha precisa ter pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "A senha está longa demais.",
  INVALID_TOKEN: "Este link é inválido ou expirou. Peça um novo.",
  TOKEN_EXPIRED: "Este link expirou. Peça um novo.",
  INVALID_CODE: "Código inválido. Confira o app autenticador e tente de novo.",
  INVALID_TWO_FACTOR_COOKIE: "Sua tentativa expirou. Entre com email e senha novamente.",
  INVALID_BACKUP_CODE: "Código de backup inválido.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Muitas tentativas. Entre novamente.",
};

export function traduzirErro(erro) {
  if (!erro) return "";
  if (erro.status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  // Mensagens que não estão na lista viram um aviso genérico (as originais vêm em inglês)
  return mensagens[erro.code] ?? "Algo deu errado. Tente novamente.";
}

// Validação simples de email no navegador
export const emailValido = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
