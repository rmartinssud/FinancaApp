import {FaArrowRight} from "react-icons/fa6";

function ButtonArrow45({texto, cor, id,larg, altu}) {
  //console.log(id);  
  const handleMouseEnter = () => {
      
        const btn = document.getElementById(id);
        btn.style.transform = "rotate(0)";
        btn.style.transition = "all 0.3s ease";
                
      }  
      const handleMouseLeave = () => {
        const btn = document.getElementById(id);
        btn.style.transform = "rotate(-45deg)";
        btn.style.transition = "all 0.3s ease";
         
       
      } 
        
    return ( 
        <button className='btn-top flex rounded-[50px] items-center text-white pl-6 font-bold' style={{width:larg, height:altu, backgroundColor:cor}}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave} >{texto} &nbsp; <FaArrowRight id={id} className='arrow -rotate-45 transform font-bold' />
        </button>
     );
}

export default ButtonArrow45;
