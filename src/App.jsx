import Header from "./components/Header.jsx";
import Hero from "./components/Hero.jsx";
import TresCards from "./components/TresCards.jsx";
import InfoSession from "./components/InfoSession.jsx";
import CarouselCards from "./components/CarouselCards.jsx";
import Estatisticas from "./components/Estatisticas.jsx";

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
      </main>
    </>
  );
}

export default App;
