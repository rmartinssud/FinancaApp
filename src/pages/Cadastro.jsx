import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../auth/AuthLayout.jsx";
import Campo from "../auth/Campo.jsx";
import BotaoEnviar from "../auth/BotaoEnviar.jsx";
import Alerta from "../auth/Alerta.jsx";
import BotaoGoogle from "../auth/BotaoGoogle.jsx";
import { signUp } from "../lib/auth-client.js";
import { traduzirErro, emailValido } from "../lib/erros.js";

const linkClasse = "rounded font-bold text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30";

function Cadastro() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ nome: "", email: "", senha: "", confirmar: "" });
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Atualiza um campo do formulário pelo "name" do input
  const mudar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  function validar() {
    const e = {};
    if (form.nome.trim().length < 2) e.nome = "Digite seu nome.";
    if (!emailValido(form.email)) e.email = "Digite um email válido.";
    if (form.senha.length < 8) e.senha = "A senha precisa ter pelo menos 8 caracteres.";
    if (form.confirmar !== form.senha) e.confirmar = "As senhas não são iguais.";
    return e;
  }

  async function cadastrar(e) {
    e.preventDefault();
    const novosErros = validar();
    setErros(novosErros);
    setErroGeral("");
    if (Object.keys(novosErros).length) return;

    setCarregando(true);
    const { error } = await signUp.email({
      name: form.nome.trim(),
      email: form.email.trim(),
      password: form.senha,
      callbackURL: "/verificar-email", // para onde o link do email leva
    });
    setCarregando(false);

    if (error) return setErroGeral(traduzirErro(error));
    navigate(`/verificar-email?enviado=1&email=${encodeURIComponent(form.email.trim())}`);
  }

  return (
    <AuthLayout titulo="Criar conta" subtitulo="Comece grátis. Sua família, a Carteira e as categorias já ficam prontas.">
      <form onSubmit={cadastrar} noValidate className="space-y-5">
        <Alerta>{erroGeral}</Alerta>
        <Campo label="Nome" name="nome" value={form.nome} onChange={mudar} erro={erros.nome} autoComplete="name" />
        <Campo label="Email" type="email" name="email" value={form.email} onChange={mudar} erro={erros.email} autoComplete="email" />
        <Campo
          label="Senha"
          type="password"
          name="senha"
          value={form.senha}
          onChange={mudar}
          erro={erros.senha}
          dica="Mínimo de 8 caracteres."
          autoComplete="new-password"
        />
        <Campo label="Confirme a senha" type="password" name="confirmar" value={form.confirmar} onChange={mudar} erro={erros.confirmar} autoComplete="new-password" />
        <BotaoEnviar texto="Criar minha conta" textoCarregando="Criando..." carregando={carregando} className="w-full" />
      </form>

      <BotaoGoogle />

      <p className="mt-8 text-center text-slate-600">
        Já tem conta?{" "}
        <Link to="/entrar" className={linkClasse}>
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}

export default Cadastro;
