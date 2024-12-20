import * as Icon from "react-bootstrap-icons";
import img from "../img/mulher_segurando_cartao_credito.png"
import ButtonArrow45 from "./buttonarrow45.jsx";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBoltLightning, faHeadset} from '@fortawesome/free-solid-svg-icons'

//import { height } from "@fortawesome/free-solid-svg-icons/fa0";

function Hero() {
    
    return ( 
        <>
        <main className="relative overflow-hidden hero h-800 w-full h-800 flex flex-row rounded-b-[60px] z-0">
          <div className="absolute w-[1000px] z-1 h-[400px] rounded-[100%] bg-sky-300 blur-[50px] bottom-0 -left-52 translate-y-[30%]"></div>
          <div className="absolute w-[600px] z-1 h-[400px] rounded-[100%] bg-[#464fa3] -top-40 -right-72 translate-y-[30%] blur-[200px]"></div>
          <div className="content relative z-3 flex flex-row bg-[url('./img/bg-bola.png')] bg-no-repeat bg-contain bg-right-top" >
            <div className="texts relative z-4 pl-6 w-1/2 flex flex-col h-full">
                <p className="hero-p relative mt-16 z-3">Esteja no controle</p>
                <h1 className="font-[Almarai] text-6xl text-white leading-[60px] not-italic font-extrabold mb-4 " >Melhor app de <br />finanças pessoais</h1>
                <div className="flex flex-row flex-wrap w-1/2 mt-8">
                   <div className="flex flex-row  w-full mb-3 items-center" ><Icon.CheckCircleFill size={20} color="#464fa3" title="Eliminando as dividas" style={{marginRight:'20'}} /><span className="txt-span-hero">Eliminando as dividas</span></div>
                   <div className="flex flex-row  w-full mb-3 items-center"><Icon.CheckCircleFill size={20} color="#464fa3" title="Controlando o orçamento" style={{marginRight:'20'}} /><span className="txt-span-hero">Controlando o orçamento</span></div>
                   <div className="flex flex-row  w-full mb-3 items-center"><Icon.CheckCircleFill size={20} color="#464fa3" title="Poupando para o futuro" style={{marginRight:'20'}} /><span className="txt-span-hero">Poupando para o futuro</span></div>
                </div>
                <div className="input-email flex flex-row w-full items-center mt-6 ">
                   <input type="text" className="input-hero w-96 pl-6 h-16 rounded-full outline-none" placeholder="Digite seu email" />
                   <span className="-ml-16"><ButtonArrow45 texto={'Inscreva-se'} cor={'#464fa3'} id={'arrowHero'} altu={'65px'} larg={'150px'} /></span>
                </div>
                <div className="flex flex-row mt-5 w-full flex-wrap ">
                    <span className="flex flex-row items-center mr-11">
                        <span className="mr-2"><FontAwesomeIcon icon={faBoltLightning} className='text-[#464fa3]'/></span>
                        <p className="relative text-[#464fa3] font-300 z-10">Chega de surpresas no fim do mês</p>
                    </span>
                    <span className="flex flex-row items-center">
                        <span className="mr-2"><FontAwesomeIcon icon={faHeadset} className='text-[#464fa3]' /></span>
                        <p className="text-[#464fa3]">Suporte pelo zap</p>
                    </span>
                </div>
            </div>
            <div className="img w-1/2 flex justify-end h-full">
                <img id="img-mulher" className=" relative z-0 mt-5 -mr-36" src={img} alt="Mulher segurando cartão de crédito melhor app de finança pessoal" />
            </div>
          </div>
        </main>
        </>
     );
}

export default Hero;