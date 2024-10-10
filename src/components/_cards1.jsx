import * as Icon from "react-bootstrap-icons";
import ButtonArrow45 from "./buttonarrow45.jsx";


function Cards1({icn,text}) {

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