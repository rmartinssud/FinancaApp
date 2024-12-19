import TresCards from "./components/trescards";
import Header from "./components/header";
import Hero from "./components/hero";
import InfoSession from "./components/infosession";
import CarouselCards from "./components/carouselCards";
import Features1 from "./components/features1";
import Counter from "./components/counter";
import { TbUrgent } from "react-icons/tb";


function App() {
    
  return(
      <>
        <Header />
        <Hero />
        <TresCards />
        <InfoSession />
        <CarouselCards carousel={true} />
        <Features1 />
        <CarouselCards carousel={false} larg={1460} mt={40}/>
        
      </>
   ) 

}

export default App
