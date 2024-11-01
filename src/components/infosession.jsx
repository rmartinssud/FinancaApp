import * as Icon from "react-bootstrap-icons";
import ButtonArrow45 from "./buttonarrow45";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faUserTie } from "@fortawesome/free-solid-svg-icons";
import Bill from '../assets/Bill_Gates_-_2023_-_P062021-670188.jpg'
import Mulher from '../assets/mulher-usando-o-app-de-financas-pessoais.jpg';
function InfoSession() {
    
    return ( 
       <>
          <section className="flex flex-row w-[1280px] h-[671px] mx-auto mt-24">
            <div className="w-1/2">
               <span className="text-5xl font-[Almarai] font-bold leading-tight">Proteger sua
                     <span className="active relative">
                        <span className="texto-diferente text-cyan-600  before:w-[160px] before:h-[16px] before:absolute before:bg-sky-600 before:opacity-20 before:bottom-[16px] before:left-1"> família&nbsp;
                        </span>
                     </span> 
                   das adversidades
               </span>
               <div className="flex flex-row flex-wrap w-full mt-8">
                 <div className="flex flex-row  w-full mb-3 items-center" >
                    <Icon.CheckCircleFill size={20} color="#737dd9" title="Planejamento cuidadoso" style={{marginRight:'20'}} />
                    <span className="font-[Roboto] text-[19px] text-[#464fa3] not-italic font-normal tracking-wide">Planejamento cuidadoso</span>
                 </div>
                 <div className="flex flex-row  w-full mb-3 items-center">
                    <Icon.CheckCircleFill size={20} color="#737dd9" title="Criar uma reserva de emergência" style={{marginRight:'20'}} />
                    <span className="font-[Roboto] text-[19px] text-[#464fa3] not-italic font-normal tracking-wide">Criar uma reserva de emergência</span>
                 </div>
                 <div className="flex flex-row  w-full mb-3 items-center">
                    <Icon.CheckCircleFill size={20} color="#737dd9" title="Controle rigoroso dos gastos" style={{marginRight:'20'}} />
                    <span className="font-[Roboto] text-[19px] text-[#464fa3] not-italic font-normal tracking-wide">Controle rigoroso dos gastos</span>
                 </div>
                 <div className="btn-rating mt-10 flex flex-row">
                    <span className="mr-8">
                       <ButtonArrow45 texto={'Começar agora'} cor={'#464fa3'} id={'btnrating'} altu={'50px'} larg={'180px'}/>
                    </span>
                    <div className="rating h-[20px]">
                       <div>
                            <FontAwesomeIcon icon={faStar} className='text-[#e4e75c]' />
                            <FontAwesomeIcon icon={faStar} className='text-[#e4e75c]' />
                            <FontAwesomeIcon icon={faStar} className='text-[#e4e75c]' />
                            <FontAwesomeIcon icon={faStar} className='text-[#e4e75c]' />
                            <FontAwesomeIcon icon={faStar} className='text-[#e4e75c]' style={{marginRight:"5px"}}/>
                            <span className="font-bold">4.9</span>
                       </div>
                       <div>
                           <span>98.8K Avalições</span>
                       </div>
                    </div>
                 </div>
                </div>
                <div className="w-full rounded-3xl border-[1px] px-6 flex flex-row flex-wrap mt-16 h-[200px]">
                  
                      <img src={Bill} alt="Bil Gates" className="w-16 mt-5 rounded-full h-16  object-cover border-[2px] border-slate-400" />
                   
                   <p className="flex flex-row ml-2 mt-5 h-[100px] w-[470px] font-[Roboto] text-[16px]">
                     "Excelente app para organizar minhas finanças pessoais! A interface é simples e intuitiva, e o controle de gastos me ajudou a economizar bastante. Recomendo para quem quer melhorar sua gestão financeira!"
                   </p>
                   <div className="flex flex-row w-full items-center justify-center">
                     <p className="review-owner text-gray-500 text-[13px]"><span className="review-desc font-[Roboto] text-[13px] not-italic font-black ">Bill Gates </span> . CEO da Microsoft Business</p>
                  </div>
               </div>
            </div>
            
            <div className="w-1/2 flex flex-row items-center justify-center">
               <img src={Mulher} alt="Bil Gates" className="  rounded-2xl  h-[640px] bg-cover border-[2px] border-slate-400" />  
            </div>
          </section>
       </>
     );
}

export default InfoSession;