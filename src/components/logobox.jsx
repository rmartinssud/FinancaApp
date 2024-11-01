import img from '../assets/logo-financas.webp'


function Logo(){
   return(
     <div className='logobox flex '>
        <img src={img} width={160} alt='' />
     </div>
   )
}
export default Logo