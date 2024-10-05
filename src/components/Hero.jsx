import * as Icon from "react-bootstrap-icons";
import img from "../img/mulher_segurando_cartao_credito.png"
import ButtonArrow45 from "./buttonarrow45.jsx";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBoltLightning, faHeadset} from '@fortawesome/free-solid-svg-icons'

//import { height } from "@fortawesome/free-solid-svg-icons/fa0";

function Hero() {
    const btnWidth = {
       width:'400px'
    }
    return ( 
        <>
        <div className="hero h-800 w-full h-800 flex flex-row">
          <div className="content flex flex-row" >
            <div className="texts pl-6 w-1/2 flex flex-col h-full">
                <p className="hero-p mt-16">Esteja no controle</p>
                <h1 className="titulo-main text-2xl mb-4 " >Melhor app de <br />finanças pessoais</h1>
                <div className="flex flex-row flex-wrap w-1/2 mt-8">
                   <div className="flex flex-row  w-full mb-3 items-center" ><Icon.CheckCircleFill size={20} color="#464fa3" title="Eliminando as dividas" style={{marginRight:'20'}} /><span className="txt-span-hero">Eliminando as dividas</span></div>
                   <div className="flex flex-row  w-full mb-3 items-center"><Icon.CheckCircleFill size={20} color="#464fa3" title="Controlando o orçamento" style={{marginRight:'20'}} /><span className="txt-span-hero">Controlando o orçamento</span></div>
                   <div className="flex flex-row  w-full mb-3 items-center"><Icon.CheckCircleFill size={20} color="#464fa3" title="Poupando para o futuro" style={{marginRight:'20'}} /><span className="txt-span-hero">Poupando para o futuro</span></div>
                </div>
                <div className="input-email flex flex-row w-full flex-wrap ">
                   <input type="text" className="input-hero w-96 pl-6 mt-6 h-16 rounded-full outline-none" placeholder="Digite seu email" />
                   <ButtonArrow45 texto={'Inscreva-se'} cor={'#464fa3'} id={'btn1'} altu={'65px'} larg={'150px'} />
                </div>
                <div className="flex flex-row mt-5 w-full flex-wrap ">
                    <span className="flex flex-row items-center mr-11">
                        <span className="mr-2"><FontAwesomeIcon icon={faBoltLightning} className='text-[#464fa3]'/></span>
                        <p className="text-[#464fa3] font-300">Chega de surpresas no fim do mês</p>
                    </span>
                    <span className="flex flex-row items-center">
                        <span className="mr-2"><FontAwesomeIcon icon={faHeadset} className='text-[#464fa3]' /></span>
                        <p className="text-[#464fa3]">Suporte pelo zap</p>
                    </span>
                </div>
            </div>
            <div className="img w-1/2 flex justify-end h-full border">
                <img className="mt-5 -mr-40" src={img} alt="Mulher segurando cartão de crédito melhor app de finança pessoal" />
            </div>
          </div>
        </div>
        </>
     );
}

export default Hero;