import Header from "./components/Header.jsx";
import Hero from "./components/Hero.jsx";
import TresCards from "./components/TresCards.jsx";
import InfoSession from "./components/InfoSession.jsx";
import CarouselCards from "./components/CarouselCards.jsx";
import Estatisticas from "./components/Estatisticas.jsx";
import Funcionalidades from "./components/Funcionalidades.jsx";
import ComoFunciona from "./components/ComoFunciona.jsx";
import WhatsappDemo from "./components/WhatsappDemo.jsx";
import DashboardPreview from "./components/DashboardPreview.jsx";
import Planos from "./components/Planos.jsx";
import Faq from "./components/Faq.jsx";
import CtaFinal from "./components/CtaFinal.jsx";
import Footer from "./components/Footer.jsx";

// A página é montada na ordem das seções abaixo
function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <TresCards />
        <InfoSession />
        <CarouselCards />
        <Estatisticas />
        <Funcionalidades />
        <ComoFunciona />
        <WhatsappDemo />
        <DashboardPreview />
        <Planos />
        <Faq />
        <CtaFinal />
      </main>
      <Footer />
    </>
  );
}

export default App;
