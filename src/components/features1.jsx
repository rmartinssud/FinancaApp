
import { useState } from "react"
import ramosDireito from "../img/ramos-direito.png"
import ramosEsquerdo from "../img/ramos-esquerdo.png"
import CountUp from "react-countup"
import ScrollTrigger from "react-scroll-trigger"

export default function Features1(){

    const [CounterOn, setCounterOn] = useState(false);

    return(
        <>
           <section className="flex flex-col w-[1280px] h-[471px] mx-auto mt-52">
              <div className="flex flex-row w-full">
                <div className="flex flex-col w-[50%] pr-20">
                    <div className="flex flex-row items-center justify-end ">
                      <div className="flex flex-row mr-4  h-[100px] justify-center items-center">
                        <img className="w-[30px] h-[65px]" src={ramosEsquerdo} />
                      </div> 
                      <div className="flex flex-col ">
                        <span className="flex justify-center font-[Almarai] text-zinc-500 ">CRIADA DESDE </span>
                        <span className="flex font-extrabold text-[#2ca9bc] font-[Roboto] text-[64px] p-0 -mt-5">
                          <ScrollTrigger onEnter={() =>setCounterOn(true)}  onExit={() => setCounterOn(false)}>
                            {
                               CounterOn && 
                               <CountUp
                                  start={0}
                                  end={2015}
                                  duration={2.75}
                                  separator=""
                                  decimals={0}
                                  decimal=""
                                  prefix=""
                                  suffix=""
                                  
                                  >
                                  {({ countUpRef}) => (
                                      <span ref={countUpRef} className='p-2'/>
                                  )}
                               </CountUp>
                            } 
                          </ScrollTrigger>
                        </span>
                      </div>
                      <div className="flex flex-row ml-4 h-[100px] justify-center items-center">
                        <img className="w-[30px] h-[65px]" src={ramosDireito} />
                      </div>
                    </div>               
                </div>
                <div className="flex flex-col w-[50%] pl-20">
                    <div className="flex flex-row items-center justify-start">
                      <div className="flex flex-row mr-4  h-[100px] justify-center items-center">
                        <img className="w-[30px] h-[65px]" src={ramosEsquerdo} />
                      </div> 
                      <div className="flex flex-col ">
                        <span className="flex justify-center font-[Almarai] text-zinc-500 ">CLIENTES SATISFEITOS </span>
                        <span className="flex font-extrabold text-[#2ca9bc] font-[Roboto] text-[64px] p-0 -mt-5">
                          <ScrollTrigger onEnter={() =>setCounterOn(true)}  onExit={() => setCounterOn(false)}>
                            {
                               CounterOn && 
                               <CountUp
                                  start={0}
                                  end={100}
                                  duration={2.75}
                                  separator=""
                                  decimals={0}
                                  decimal=""
                                  prefix=""
                                  suffix="M"
                                  
                                  >
                                  {({ countUpRef}) => (
                                      <span ref={countUpRef} className='p-2'/>
                                  )}
                               </CountUp>
                            } +
                          </ScrollTrigger>
                        </span>
                      </div>
                      <div className="flex flex-row ml-4 h-[100px] justify-center items-center">
                        <img className="w-[30px] h-[65px]" src={ramosDireito} />
                      </div>
                    </div>               
                </div>
              </div>
              <div className="flex flex-row w-full mt-5 px-10">
                 <span className=" text-center text-5xl font-[Almarai] font-midium leading-[1.125]">We enable our customers to build great banking experiences that their customers love, in a 
                     <span className="active relative">
                        <span className="texto-diferente text-cyan-600 font-bold before:w-[138px] before:h-[16px] before:absolute before:bg-sky-600 before:opacity-20 before:bottom-[6px] before:left-1"> faster&nbsp;
                        </span>
                     </span> and
                 more flexible about cor way than ever before.
                
                 </span>
              </div>
           </section>
        </>
    )
}