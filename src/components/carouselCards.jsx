
import { register } from 'swiper/element/bundle'

import {Swiper, SwiperSlide} from 'swiper/react';
import {Autoplay} from 'swiper/modules';
import UmSVG from '../assets/1azul.svg';
import Budget from '../assets/icon-budget.svg';


register();

import 'swiper/css'
//import 'swiper/css/navigation'
//import 'swiper/css/pagination'
import 'swiper/css/autoplay'

function CarouselCards({carousel,larg}) {
    //console.log(carousel);
    
    if(carousel){ 
        
        return ( 
            <>
            <div  className="relative overflow-hidden z-1 mx-auto w-[1460px]  h-[800px] px-[50px] py-[120px] flex flex-row gap-2 rounded-[48px] border-3 mt-16 bg-[#eaedfc] drop-shadow-xl">
                <div className="absolute w-[600px] z-10 h-[400px] rounded-[100%] bg-[#464fa3] bottom-0 -left-52 blur-[150px]  translate-y-[50%]"></div>
                <div className="absolute w-[600px] z-10 h-[400px] rounded-[100%] bg-sky-200 top-8 blur-[100px] -right-72 translate-y-28"></div>
                <div className="flex flex-row h-[110px] justify-between ">
                    <span className=" w-1/2 h-[110px] text-5xl font-[Almarai] font-bold leading-tight ">Proteger sua
                    
                            <span className="active relative">
                                <span className="texto-diferente text-cyan-600  before:w-[160px] before:h-[16px] before:absolute before:bg-sky-600 before:opacity-20 before:bottom-[16px] before:left-1"> família
                                </span>
                            </span>  das adversidades
                            
                    
                    </span>
                    <p className="flex text-desc-carousel w-1/2 h-[110px] px-3  items-end">
                        Veja nossas features, temos as melhores funções para te ajudar de uma vez por todas a ficar no controle de seu orçamento. Planejador de controle de dívidas, entradas e saidas, cadastro de cartões de crédito e débito.
                    </p>
                    
                </div>
                
                
            </div>
        
            <Swiper
                modules={[Autoplay]}
                slidesPerView={3}
                centeredSlides={true}
                spaceBetween={-200}
                grabCursor={true}
                loop={true}
                speed={800}
                freeMode={true}
                allowTouchMove={true}
                autoplay={{
                    delay:3500,
                    disableOnInteraction: false,
                }}
                
                className='mySwiper -mt-[540px]'>
                    
                    <SwiperSlide>
                        <div className="swiper flex flex-col items-center justify-start bg-white my-8 px-6 pt-12 pb-8 rounded-[28px] drop-shadow-xl  w-[410px] h-[400px] ">
                            <img src={Budget} alt='Teste' className='w-32 h-32'/>
                            <h3 className='font-[Roboto] text-[26px] text-center font-medium mt-6'>Orçamento Consciente</h3>
                            <span className="flex flex-row mt-4 text-center text-gray-500">Passos para criar e seguir um orçamento eficaz, equilibrando renda e despesas.</span>
                        </div>
                    </SwiperSlide>
                    <SwiperSlide>
                        <div className="swiper flex flex-col items-center justify-start bg-white my-8 px-6 pt-12 pb-8 rounded-[28px] drop-shadow-xl  w-[410px] h-[400px] ">
                            <img src={UmSVG} alt='Teste' className='w-32 h-32'/>
                            <h3 className='font-[Roboto] text-[26px] text-center font-medium mt-6'>Superação de Dívidas</h3>
                            <span className="flex flex-row mt-4 text-center text-gray-500">Estratégias práticas para entender e se livrar das dívidas de maneira responsável.</span>
                        </div>
                    </SwiperSlide>
                    <SwiperSlide>
                        <div className="swiper flex flex-col items-center justify-start bg-white my-8 px-6 pt-12 pb-8 rounded-[28px] drop-shadow-xl  w-[410px] h-[400px] ">
                            <img src={UmSVG} alt='Teste' className='w-32 h-32'/>
                            <h3 className='font-[Roboto] text-[26px] text-center font-medium mt-6'>Investimentos para o Futuro</h3>
                            <span className="flex flex-row mt-4 text-center text-gray-500">Fundamentos e orientações sobre como começar a investir de forma segura e eficaz.</span>
                        </div>
                    </SwiperSlide>
                    <SwiperSlide>
                        <div className="swiper flex flex-col items-center justify-start bg-white my-8 px-6 pt-12 pb-8 rounded-[28px] drop-shadow-xl  w-[410px] h-[400px] ">
                            <img src={UmSVG} alt='Teste' className='w-32 h-32'/>
                            <h3 className='font-[Roboto] text-[26px] text-center font-medium mt-6'>Proteção Financeira Familiar</h3>
                            <span className="flex flex-row mt-4 text-center text-gray-500">Como planejar para adversidades e proteger financeiramente a família.</span>
                        </div>
                    </SwiperSlide>
                    <SwiperSlide>
                        <div className="swiper flex flex-col items-center justify-start bg-white my-8 px-6 pt-12 pb-8 rounded-[28px] drop-shadow-xl  w-[410px] h-[400px] ">
                            <img src={UmSVG} alt='Teste' className='w-32 h-32'/>
                            <h3 className='font-[Roboto] text-[26px] text-center font-medium mt-6'>Doação e Abençoar Outros</h3>
                            <span className="flex flex-row mt-4 text-center text-gray-500">A importância de doar e contribuir para o bem-estar da comunidade.</span>
                        </div>
                    </SwiperSlide>
                </Swiper>
            
            </>
        );
    }//end if condition
    else if(carousel === false) {
        return ( 
            <>
            <div style={{width:larg}}className="relative overflow-hidden z-1 mx-auto   h-[800px] px-[50px] py-[120px] flex flex-row gap-2 rounded-[48px] border-3 bg-[#eaedfc] drop-shadow-xl">
                <div className="absolute w-[600px] z-10 h-[400px] rounded-[100%] bg-[#464fa3] bottom-0 -left-52 blur-[150px]  translate-y-[50%]"></div>
                  <div className="absolute w-[600px] z-10 h-[400px] rounded-[100%] bg-sky-200 top-8 blur-[100px] -right-72 translate-y-28"></div>
                  <div className="flex flex-row h-[110px] justify-between ">
                    <span className=" w-1/2 h-[110px] text-5xl font-[Almarai] font-bold leading-tight ">Proteger sua
                      
                            <span className="active relative">
                                <span className="texto-diferente text-cyan-600  before:w-[160px] before:h-[16px] before:absolute before:bg-sky-600 before:opacity-20 before:bottom-[16px] before:left-1"> família
                                </span>
                            </span>  das adversidades
                            
                      
                    </span>
                       <p className="flex text-desc-carousel w-1/2 h-[110px] px-3  items-end">
                           Veja nossas features, temos as melhores funções para te ajudar de uma vez por todas a ficar no controle de seu orçamento. Planejador de controle de dívidas, entradas e saidas, cadastro de cartões de crédito e débito.
                       </p>
                       
                </div>
                
                
            </div>
        </>
    
      );
    }

    }

export default CarouselCards;