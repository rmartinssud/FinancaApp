import * as Icon from "react-bootstrap-icons";
import ButtonArrow45 from "./buttonarrow45.jsx";


function Cards1({icn,text}) {
    //console.log(fa)
    //const icon1 = "CreditCard2BackFill";
    if(icn === 'CreditCard2Back'){
        const crd1 = "<Icon.CreditCard2Back />"
    else if(icn === 'Airplane'){
        const crd1 = "<Icon.Airplane />"
    }else{
        const crd1 = "<Icon.Alarm />"
    }
    return ( 
        <div className="flex flex-col w-1/3 border items-start">
           <span className="flex flex-row gap-3 items-center p-3">
            {crd1} {text}
            </span>
           <ButtonArrow45 texto={'Saiba Mais'} cor={'#464fa3'} id={'arrowCards'} altu={'55px'} larg={'150px'} />
        </div>
     );
}

export default Cards1;