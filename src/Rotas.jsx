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
const Cartoes = lazy(() => import("./app/Cartoes.jsx"));
const Fatura = lazy(() => import("./app/Fatura.jsx"));
const Orcamentos = lazy(() => import("./app/Orcamentos.jsx"));
const OrcamentoDetalhes = lazy(() => import("./app/OrcamentoDetalhes.jsx"));
const OrcamentosArquivados = lazy(() => import("./app/OrcamentosArquivados.jsx"));
const Objetivos = lazy(() => import("./app/Objetivos.jsx"));
const ObjetivoDetalhes = lazy(() => import("./app/ObjetivoDetalhes.jsx"));
const Dividas = lazy(() => import("./app/Dividas.jsx"));
const DividaDetalhes = lazy(() => import("./app/DividaDetalhes.jsx"));
const PlanoDividas = lazy(() => import("./app/PlanoDividas.jsx"));
const Familia = lazy(() => import("./app/Familia.jsx"));
const Tags = lazy(() => import("./app/Tags.jsx"));
const Estatisticas = lazy(() => import("./app/Estatisticas.jsx"));
const EconomiaMensal = lazy(() => import("./app/EconomiaMensal.jsx"));
const Relatorios = lazy(() => import("./app/Relatorios.jsx"));
const Calendario = lazy(() => import("./app/Calendario.jsx"));
const Convite = lazy(() => import("./pages/Convite.jsx"));
const Ajuda = lazy(() => import("./app/Ajuda.jsx"));
const AjudaPublica = lazy(() => import("./pages/AjudaPublica.jsx"));
const Privacidade = lazy(() => import("./pages/Privacidade.jsx"));
const EducacaoPublica = lazy(() => import("./pages/EducacaoPublica.jsx"));
const Educacao = lazy(() => import("./app/Educacao.jsx"));
const AdminEducacao = lazy(() => import("./app/admin/AdminEducacao.jsx"));
const EditorConteudo = lazy(() => import("./app/admin/EditorConteudo.jsx"));
const EditorCurso = lazy(() => import("./app/admin/EditorCurso.jsx"));
const MeuPlano = lazy(() => import("./app/MeuPlano.jsx"));
const OpenFinance = lazy(() => import("./app/OpenFinance.jsx"));
const AdminCupons = lazy(() => import("./app/admin/AdminCupons.jsx"));

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
          {/* Convite para um espaço: abre logado ou não */}
          <Route path="/convite/:token" element={<Convite />} />
          {/* Central de Ajuda aberta (sem login) */}
          <Route path="/ajuda" element={<AjudaPublica />} />
          <Route path="/ajuda/:slug" element={<AjudaPublica />} />
          <Route path="/privacidade" element={<Privacidade />} />
          {/* Educação financeira aberta (sem login; o conteúdo "só para cadastrados" mostra o convite) */}
          <Route path="/educacao" element={<EducacaoPublica pagina="home" />} />
          <Route path="/educacao/cursos" element={<EducacaoPublica pagina="cursos" />} />
          <Route path="/educacao/cursos/:slug" element={<EducacaoPublica pagina="curso" />} />
          <Route path="/educacao/cursos/:slug/:aula" element={<EducacaoPublica pagina="aula" />} />
          <Route path="/educacao/:slug" element={<EducacaoPublica pagina="conteudo" />} />

          {/* Área logada */}
          <Route path="/app" element={<RotaProtegida><Inicio /></RotaProtegida>} />
          <Route path="/app/lancamentos" element={<RotaProtegida><Lancamentos /></RotaProtegida>} />
          <Route path="/app/contas" element={<RotaProtegida><Contas /></RotaProtegida>} />
          <Route path="/app/categorias" element={<RotaProtegida><Categorias /></RotaProtegida>} />
          <Route path="/app/cartoes" element={<RotaProtegida><Cartoes /></RotaProtegida>} />
          <Route path="/app/cartoes/:id" element={<RotaProtegida><Fatura /></RotaProtegida>} />
          <Route path="/app/orcamentos" element={<RotaProtegida><Orcamentos /></RotaProtegida>} />
          <Route path="/app/orcamentos/arquivados" element={<RotaProtegida><OrcamentosArquivados /></RotaProtegida>} />
          <Route path="/app/orcamentos/:id" element={<RotaProtegida><OrcamentoDetalhes /></RotaProtegida>} />
          <Route path="/app/objetivos" element={<RotaProtegida><Objetivos /></RotaProtegida>} />
          <Route path="/app/objetivos/:id" element={<RotaProtegida><ObjetivoDetalhes /></RotaProtegida>} />
          <Route path="/app/dividas" element={<RotaProtegida><Dividas /></RotaProtegida>} />
          <Route path="/app/dividas/plano" element={<RotaProtegida><PlanoDividas /></RotaProtegida>} />
          <Route path="/app/dividas/:id" element={<RotaProtegida><DividaDetalhes /></RotaProtegida>} />
          <Route path="/app/familia" element={<RotaProtegida><Familia /></RotaProtegida>} />
          <Route path="/app/tags" element={<RotaProtegida><Tags /></RotaProtegida>} />
          <Route path="/app/estatisticas" element={<RotaProtegida><Estatisticas /></RotaProtegida>} />
          <Route path="/app/economia" element={<RotaProtegida><EconomiaMensal /></RotaProtegida>} />
          <Route path="/app/relatorios" element={<RotaProtegida><Relatorios /></RotaProtegida>} />
          <Route path="/app/calendario" element={<RotaProtegida><Calendario /></RotaProtegida>} />
          <Route path="/app/seguranca" element={<RotaProtegida><Seguranca /></RotaProtegida>} />
          <Route path="/app/plano" element={<RotaProtegida><MeuPlano /></RotaProtegida>} />
          <Route path="/app/open-finance" element={<RotaProtegida><OpenFinance /></RotaProtegida>} />
          {/* Cupons de plano (só ADMIN da plataforma; a API confere de novo) */}
          <Route path="/app/admin/cupons" element={<RotaProtegida><AdminCupons /></RotaProtegida>} />
          <Route path="/app/ajuda" element={<RotaProtegida><Ajuda /></RotaProtegida>} />
          <Route path="/app/ajuda/:slug" element={<RotaProtegida><Ajuda /></RotaProtegida>} />
          <Route path="/app/educacao" element={<RotaProtegida><Educacao pagina="home" /></RotaProtegida>} />
          <Route path="/app/educacao/cursos" element={<RotaProtegida><Educacao pagina="cursos" /></RotaProtegida>} />
          <Route path="/app/educacao/cursos/:slug" element={<RotaProtegida><Educacao pagina="curso" /></RotaProtegida>} />
          <Route path="/app/educacao/cursos/:slug/:aula" element={<RotaProtegida><Educacao pagina="aula" /></RotaProtegida>} />
          <Route path="/app/educacao/:slug" element={<RotaProtegida><Educacao pagina="conteudo" /></RotaProtegida>} />
          {/* Painel da Educação financeira (equipe: EDITOR e ADMIN; a API confere de novo) */}
          <Route path="/app/admin/educacao" element={<RotaProtegida><AdminEducacao /></RotaProtegida>} />
          <Route path="/app/admin/educacao/conteudos/:id" element={<RotaProtegida><EditorConteudo /></RotaProtegida>} />
          <Route path="/app/admin/educacao/cursos/:id" element={<RotaProtegida><EditorCurso /></RotaProtegida>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default Rotas;
