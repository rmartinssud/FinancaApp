import {FaArrowRight} from "react-icons/fa6";

function ButtonArrow45({texto, cor, id,larg, altu}) {
    const handleMouseEnter = () => {
        const btn = document.querySelectorAll(".arrow");
        for(let i of btn) {
            i.style.transform = "rotate(0)";
            i.style.transition = "all 0.5s ease";
        }    
        //console.log(btn[1].style.transform = "rotate(0)")
        /*btn.style.transform = "rotate(0)";
        btn.style.transition = "all 0.5s ease";*/
        //console.log(btn);
      }  
      const handleMouseLeave = () => {
        const btn = document.querySelectorAll(".arrow");
       for(let i of btn) {
           i.style.transform = "rotate(-45deg)";
           i.style.transition = "all 0.5s ease";
        } 
        //console.log(btn);
      } 
    return ( 
        <button className='btn-top mt-6 -ml-14' style={{width:larg, height:altu, backgroundColor:cor}}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave} >{texto} &nbsp; <FaArrowRight id={id} className='arrow -rotate-45 transform'/>
        </button>
     );
}

export default ButtonArrow45;
