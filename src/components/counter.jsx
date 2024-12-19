import CountUp from 'react-countup';


export default function Counter(){

    return(
        <>
           
            <CountUp
            start={0}
            end={2030}
            duration={2.75}
            separator=""
            decimals={0}
            decimal=","
            prefix=""
            suffix=""
            onEnd={() => console.log('Ended! 👏')}
            onStart={() => console.log('Started! 💨')}
            >
            {({ countUpRef, start}) => (
                <div className='flex w-[1280px] mx-auto bg-slate-200 justify-center p-10'>
                  <span ref={countUpRef} className='p-2'/>
                  <button className="bg-teal-300 rounded-lg px-6" onClick={start} >Contar</button>
                </div>
            )}
           
            </CountUp>
            
        </>
    )
}

