import Logo from './logobox.jsx'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBagShopping, faSearch, faUser } from '@fortawesome/free-solid-svg-icons'

import { FaFacebook, FaInstagram, FaSquareXTwitter, FaSquareEnvelope, FaRegComment,FaArrowRight} from "react-icons/fa6";

function Navbar (){
    const handleMouseEnter = () => {
      const btn = document.getElementById('arrow');
      btn.style.transform = "rotate(0)";
      btn.style.transition = "all 0.5s ease";
      //console.log(btn);
    }  
    const handleMouseLeave = () => {
      const btn = document.getElementById('arrow');
      btn.style.transform = "rotate(-45deg)";
      //console.log(btn);
    } 
    return(
        <>
        <div className='navbar-container '>
          <div className='bg-top-menu flex flex-row'>
            <div className='extra-menu flex justify-between items-center w-full p-20'>
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
          <div className='bg-logo-menu'>
            <div className='logo-menu'>
               <Logo />
               <nav className='menu-principal'>
                  <ul className='flex justify-between w-80'>
                    <li className='item active'>Sobre Nós</li>
                    <li className='item '>Features</li>
                    <li className='item '>Fale Conosco</li>
                  </ul>
    
               </nav>
               <div className='avatar-gstarted flex justify-between items-center w-1/4 '>
                   <span><FontAwesomeIcon icon={faSearch} className='text-black'/></span>
                   <span><FontAwesomeIcon icon={faUser} className='text-black'/></span>
                   <span><FontAwesomeIcon icon={faBagShopping} className='text-black'/></span>
                   <button className='btn-top'
                      onMouseEnter={handleMouseEnter}
                      onMouseLeave={handleMouseLeave} style={{display:"flex" }}>Começar Agora &nbsp; <FaArrowRight id='arrow' className='arrow -rotate-45 transform'/>
                   </button>
               </div>
            </div>
          </div>  

        </div>
        </>

    )
}
export default Navbar;