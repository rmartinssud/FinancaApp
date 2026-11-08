import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import { RotaProtegida, SomenteVisitante, Carregando } from "./auth/RotaProtegida.jsx";

// As telas de login e do app só são baixadas quando alguém abre a rota (lazy),
// assim a landing page continua leve.
const Entrar = lazy(() => import("./pages/Entrar.jsx"));
const Cadastro = lazy(() => import("./pages/Cadastro.jsx"));
const EsqueciSenha = lazy(() => import("./pages/EsqueciSenha.jsx"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha.jsx"));
const VerificarEmail = lazy(() => import("./pages/VerificarEmail.jsx"));
const Inicio = lazy(() => import("./app/Inicio.jsx"));
const Seguranca = lazy(() => import("./app/Seguranca.jsx"));
const Lancamentos = lazy(() => import("./app/Lancamentos.jsx"));
const Contas = lazy(() => import("./app/Contas.jsx"));
const Categorias = lazy(() => import("./app/Categorias.jsx"));

function Rotas() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando />}>
        <Routes>
          {/* Landing page (sem mudanças) */}
          <Route path="/" element={<App />} />

          {/* Login e cadastro */}
          <Route path="/entrar" element={<SomenteVisitante><Entrar /></SomenteVisitante>} />
          <Route path="/cadastro" element={<SomenteVisitante><Cadastro /></SomenteVisitante>} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/verificar-email" element={<VerificarEmail />} />

          {/* Área logada */}
          <Route path="/app" element={<RotaProtegida><Inicio /></RotaProtegida>} />
          <Route path="/app/lancamentos" element={<RotaProtegida><Lancamentos /></RotaProtegida>} />
          <Route path="/app/contas" element={<RotaProtegida><Contas /></RotaProtegida>} />
          <Route path="/app/categorias" element={<RotaProtegida><Categorias /></RotaProtegida>} />
          <Route path="/app/seguranca" element={<RotaProtegida><Seguranca /></RotaProtegida>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default Rotas;
