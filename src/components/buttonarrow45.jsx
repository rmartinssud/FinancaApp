import {FaArrowRight} from "react-icons/fa6";

/*const { innerWidth: width} = window;
console.log(`Largura da tela ${innerWidth}`);
if (innerWidth <= 768 ){
  alert('chegou no tamanho');
}*/

function ButtonArrow45({texto, cor, id,larg, altu}) {
  //    console.log(id);  
      const exibe = false;    
      //console.log(exibe); 

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
        <button className='btn-top flex rounded-[50px] items-center justify-around text-white px-5 font-bold' style={{width:larg, height:altu, backgroundColor:cor}}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave} >{exibe?null:texto} <FaArrowRight id={id} className='arrow -rotate-45 transform font-bold' />
        </button>
     );
}

export default ButtonArrow45;
