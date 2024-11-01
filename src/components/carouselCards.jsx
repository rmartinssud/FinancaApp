
import { register } from 'swiper/element/bundle'

import {Swiper, SwiperSlide} from 'swiper/react';
import { Pagination, Navigation } from 'swiper/modules';
import UmSVG from '../assets/1.svg';


register();

import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'

function CarouselCards() {

    return ( 
        <>
        <div className="relative overflow-hidden z-1 mx-auto w-[1460px] z-1 h-[800px] px-[50px] py-[120px] flex flex-row gap-2 rounded-[48px] border-3 mt-16 bg-[#eaedfc] z-2 drop-shadow-xl">
            <div className="absolute w-[600px] z-10 h-[400px] rounded-[100%] bg-[#464fa3] bottom-0 -left-52 blur-[150px]  translate-y-[50%]"></div>
            <div className="absolute w-[600px] z-10 h-[400px] rounded-[100%] bg-sky-200 top-8 blur-[100px] -right-72 translate-y-28"></div>
            <div className="flex flex-row h-[110px] justify-between border border-blue-700">
                <span className=" w-1/2 h-[110px] text-5xl font-[Almarai] font-bold leading-tight  border border-red-700">Proteger sua
                  
                        <span className="active relative">
                            <span className="texto-diferente text-cyan-600  before:w-[160px] before:h-[16px] before:absolute before:bg-sky-600 before:opacity-20 before:bottom-[16px] before:left-1"> família
                            </span>
                        </span>  das adversidades
                        
                  
                </span>
                   <p className="flex text-desc-carousel w-1/2 h-[110px] px-3 border border-green-700 items-end">
                       Veja nossas features, temos as melhores funções para te ajudar de uma vez por todas a ficar no controle de seu orçamento. Planejador de controle de dívidas, entradas e saidas, cadastro de cartões de crédito e débito.
                   </p>
                   
            </div>
            
            
        </div>
        <Swiper
                    slidesPerView={3}
                    centeredSlides={true}
                    spaceBetween={-200}
                    grabCursor={true}
                    loop={true}
                        
                    
                    className='-mt-[480px]'>
                        <SwiperSlide>
                            <div className="swiper flex flex-col items-center justify-center bg-white my-6 px-6 py-4 rounded-[28px] drop-shadow-xl  w-[410px] h-[400px] ">
                                <img src={UmSVG} alt='Teste' className='w-32 h-32'/>
                                <h3 className=''>Doe e Ajude</h3>
                                <span>Testando o card slide</span>
                            </div>
                        </SwiperSlide>
                        <SwiperSlide>
                            <div className="swiper flex flex-col items-center justify-center  bg-white px-6 py-4 rounded-[28px]  border w-[410px] h-[400px] ">
                                <img src={UmSVG} alt='Teste' className='w-32 h-32'/>
                                <h3 className=''>Doe e Ajude</h3>
                                <span>Testando o card slide</span>
                            </div>
                        </SwiperSlide>
                        <SwiperSlide>
                            <div className="swiper flex flex-col items-center justify-center bg-white px-6 py-4 rounded-[28px] drop-shadow-xl border w-[410px] h-[400px] ">
                                <img src={UmSVG} alt='Teste' className='w-32 h-32'/>
                                <h3 className=''>Doe e Ajude</h3>
                                <span>Testando o card slide</span>
                            </div>
                        </SwiperSlide>
                        <SwiperSlide>
                            <div className="swiper flex flex-col items-center justify-center bg-white px-6 py-4 rounded-[28px] drop-shadow-xl border w-[410px] h-[400px] ">
                                <img src={UmSVG} alt='Teste' className='w-32 h-32'/>
                                <h3 className=''>Doe e Ajude</h3>
                                <span>Testando o card slide</span>
                            </div>
                        </SwiperSlide>
                        <SwiperSlide>
                            <div className="swiper flex flex-col items-center justify-center bg-white px-6 py-4 rounded-[28px] drop-shadow-xl border w-[410px] h-[400px] ">
                                <img src={UmSVG} alt='Teste' className='w-32 h-32'/>
                                <h3 className=''>Doe e Ajude</h3>
                                <span>Testando o card slide</span>
                            </div>
                        </SwiperSlide>
                    </Swiper>
        </>
     );
}

export default CarouselCards;