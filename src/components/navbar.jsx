import Logo from "./logobox.jsx"
import { FaFacebook, FaInstagram, FaSquareXTwitter, FaSquareEnvelope, FaRegComment} from "react-icons/fa6";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBagShopping, faSearch, faUser } from '@fortawesome/free-solid-svg-icons'
import ButtonArrow45 from "./buttonarrow45.jsx";



function Navbar() {
    

    return ( 
        <div id='navbar-container '>
          <div className='bg-top-menu flex flex-row justify-center bg-[#464fa3]'>
            <div className='extra-menu flex justify-between items-center w-full p-20 '>
                <div className='social-icons flex flex-row justify-between items-center text-white'>
                   <span className="item-icons first-icon flex justify-center items-center  max-h-full h-10  w-10"><FaFacebook className='text-lg'/></span>
                   <span className="item-icons others-icon flex justify-center items-center  max-h-full h-10  w-10"><FaInstagram className='text-lg' /></span>
                   <span className="item-icons others-icon flex justify-center items-center  max-h-full h-10  w-10"><FaSquareXTwitter className='text-lg' /></span>
                </div>
                <div className='text-menu-extra text-white '><p>Cuidando de você e do seu dinheiro para uma vida melhor</p></div>
                <div className="email-chat flex flex-row text-white">
                    <span className='first-icon flex justify-center items-center max-h-full h-10 pr-6 pl-6'><FaSquareEnvelope className='mr-3'/><p>Email</p></span>
                    <span className='others-icon flex justify-center items-center max-h-full h-10 pr-6 pl-6'><FaRegComment className='mr-3' />Chat</span>
                </div>

            </div>
          </div>
          <div className='bg-logo-menu bg-white flex justify-center items-center'>
             <div className='w-[1760px] py-[20px] px-[20px] flex flex-row justify-between items-center'>
               <Logo style={{marginLeft:'20px'}}/>
               <nav className='menu-principal'>
                  <ul className='flex justify-between w-80'>
                    <li className='item active'>Sobre Nós</li>
                    <li className='item '>Features</li>
                    <li className='item '>Fale Conosco</li>
                  </ul>
                </nav>
               <div className='avatar-getarted flex justify-end items-center w-1/4'>
                   <span className="w-10"><FontAwesomeIcon icon={faSearch} className='text-[#464fa3] text-xl'/></span>
                   <span className="w-10"><FontAwesomeIcon icon={faUser} className='text-[#464fa3] text-xl'/></span>
                   <span className="w-10"><FontAwesomeIcon icon={faBagShopping} className='text-[#464fa3] text-xl'/></span>
                   <span ><ButtonArrow45 texto={'Comece Agora'} cor={'#464fa3'} altu={'55px'} larg={'180px'} id={'arrowNav'} /></span>
               </div>
            </div>
          </div>  

        </div>
     );
}

export default Navbar;
