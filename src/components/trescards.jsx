import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ButtonArrow45 from "./buttonarrow45";
import { faMoneyBillTransfer } from '@fortawesome/free-solid-svg-icons/faMoneyBillTransfer';
import { faListOl, faPiggyBank } from '@fortawesome/free-solid-svg-icons';
function TresCards() {
    return ( 
        <div className="relative mx-auto w-[1290px] h-[500px] px-[50px] pt-[60px] flex flex-row gap-2 rounded-3xl border-3 -mt-40 bg-white z-2 drop-shadow-xl">
           
           <div className="card-content flex flex-col w-1/3 border-r-2  items-start h-[380px]">
              <div className="flex flex-row gap-2 items-center text-[#464fa3]">
                <FontAwesomeIcon icon={faMoneyBillTransfer} />
                <span className="">Eliminando as dividas</span>
              </div>
              <h3 className='mt-3 font-[Almarai] text-3xl font-bold'>Pague suas dividas</h3>
              <p className='mt-4 font-[Roboto] text-sm '>Eliminar dívidas traz uma sensação de liberdade e paz de espírito.</p>
              <ul className='c1 mt-3 leading-9 list-none ml-5 '>
                <li className='flex flex-row items-center'>Estabeleça um orçamento</li>
                <li className='flex flex-row items-center'>Priorize os pagamentos</li>
                <li className='flex flex-row items-center'>Negocie com credores</li>
                <li className='flex flex-row items-center'>Evite novas dívidas</li>
              </ul>
              <span className='mt-7'>
                <ButtonArrow45 texto={'Saiba Mais'} cor={'#464fa3'} id={'card1'} larg={'160px'} altu={'50px'} />
              </span>
           </div>

           <div className="card-content flex flex-col w-1/3 pl-8 border-r-2   items-start h-[380px]">
              <div className="flex flex-row gap-2 items-center text-[#464fa3]">
                <FontAwesomeIcon icon={faListOl} />
                <span className="">Controlando o orçamento</span>
              </div>
              <h3 className='mt-3 font-[Almarai] text-3xl font-bold'>Estabeleça limites</h3>
              <p className='mt-4 font-[Roboto] text-sm'>Cumprir um orçamento traz a satisfação de estar no controle das suas finanças e alcançando suas metas.</p>
              <ul className='c1 mt-3 leading-9 list-none ml-5'>
                <li className='flex flex-row items-center'>O orçamento é um mapa</li>
                <li className='flex flex-row items-center'>Registre cada gasto</li>
                <li className='flex flex-row items-center'>Revise regularmente</li>
                <li className='flex flex-row items-center'>Estabeleça metas</li>
              </ul>
              <span className='mt-7'>
                <ButtonArrow45 texto={'Saiba Mais'} cor={'#464fa3'} id={'card2'} larg={'160px'} altu={'50px'} />
              </span>
           </div>

           <div className="card-content flex flex-col w-1/3 pl-8   items-start h-[380px]">
              <div className="flex flex-row gap-2 items-center text-[#464fa3]">
                <FontAwesomeIcon icon={faPiggyBank} />
                <span className="">Poupando para o futuro</span>
              </div>
              <h3 className='mt-3 font-[Almarai] text-3xl font-bold'>Viver Previdente</h3>
              <p className='mt-4 font-[Roboto] text-sm'>Poupar para o futuro traz a satisfação de construir segurança e realizar sonhos.</p>
              <ul className='c1 mt-3 leading-9 list-none ml-5'>
                <li className='flex flex-row items-center'>Comece hoje</li>
                <li className='flex flex-row items-center'>Tenha um objetivo</li>
                <li className='flex flex-row items-center'>Consistência é chave</li>
                <li className='flex flex-row items-center'>Invista na sua paz</li>
              </ul>
              <span className='mt-7'>
                <ButtonArrow45 texto={'Saiba Mais'} cor={'#464fa3'} id={'card3'} larg={'160px'} altu={'50px'} />
              </span>
           </div>
        </div>
     );
}

export default TresCards;