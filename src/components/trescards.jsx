import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ButtonArrow45 from "./buttonarrow45";
import { faMoneyBillTransfer } from '@fortawesome/free-solid-svg-icons/faMoneyBillTransfer';
function TresCards() {
    return ( 
        <div className="relative mx-auto w-[1290px] h-[500px] pl-[50px] pt-[60px] flex flex-row gap-3 rounded-3xl border-3 -mt-40 bg-white z-2 drop-shadow-lg">
           
           <div className="card-content flex flex-col w-1/3 border-r-2  items-start h-[380px]">
              <div className="flex flex-row gap-2 items-center text-[#464fa3]">
                <FontAwesomeIcon icon={faMoneyBillTransfer} />
                <span className="">Eliminando as dividas</span>
              </div>
              <h3 className='mt-3 font-[Almarai] text-3xl font-bold'>Pague suas dividas</h3>
              <p className='mt-4 font-[Roboto] text-md'>Lorem ipsum dolor sit amet consectetur, adipisicing elit. Placeat quidem quis enim repellat</p>
              <ul className='mt-3 leading-9 list-disc ml-5'>
                <li>Organização das dívidas</li>
                <li>Plano Eliminação</li>
                <li>Lançamento depesas mês</li>
                <li>Lembrete de vencimento</li>
              </ul>
              <span className='mt-7'>
                <ButtonArrow45 texto={'Saiba Mais'} cor={'#464fa3'} id={'card1'} larg={'160px'} altu={'50px'} />
              </span>
           </div>

           <div className="card-content flex flex-col w-1/3 border-r-2   items-start h-[380px]">
              <div className="flex flex-row gap-2 items-center text-[#464fa3]">
                <FontAwesomeIcon icon={faMoneyBillTransfer} />
                <span className="">Eliminando as dividas</span>
              </div>
              <h3 className='mt-3 font-[Almarai] text-3xl font-bold'>Pague suas dividas</h3>
              <p className='mt-4 font-[Roboto] text-md'>Lorem ipsum dolor sit amet consectetur, adipisicing elit. Placeat quidem quis enim repellat</p>
              <ul className='mt-3 leading-9 list-disc ml-5'>
                <li>Organização das dívidas</li>
                <li>Plano Eliminação</li>
                <li>Lançamento depesas mês</li>
                <li>Lembrete de vencimento</li>
              </ul>
              <span className='mt-7'>
                <ButtonArrow45 texto={'Saiba Mais'} cor={'#464fa3'} id={'card2'} larg={'160px'} altu={'50px'} />
              </span>
           </div>

           <div className="card-content flex flex-col w-1/3 px-5  items-start h-[380px]">
              <div className="flex flex-row gap-2 items-center text-[#464fa3]">
                <FontAwesomeIcon icon={faMoneyBillTransfer} />
                <span className="">Eliminando as dividas</span>
              </div>
              <h3 className='mt-3 font-[Almarai] text-3xl font-bold'>Pague suas dividas</h3>
              <p className='mt-4 font-[Roboto] text-md'>Lorem ipsum dolor sit amet consectetur, adipisicing elit. Placeat quidem quis enim repellat</p>
              <ul className='mt-3 leading-9 list-disc ml-5'>
                <li>Organização das dívidas</li>
                <li>Plano Eliminação</li>
                <li>Lançamento depesas mês</li>
                <li>Lembrete de vencimento</li>
              </ul>
              <span className='mt-7'>
                <ButtonArrow45 texto={'Saiba Mais'} cor={'#464fa3'} id={'card3'} larg={'160px'} altu={'50px'} />
              </span>
           </div>
        </div>
     );
}

export default TresCards;