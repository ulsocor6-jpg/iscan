import { useEffect, useState } from "react";
import DashboardLayout from "../banking/components/DashboardLayout";


interface Worker {

  name:string;
  type:string;
  status:string;
  lastSeen:string;
  error?:string|null;

}


interface Runtime {

  uptime:number;
  pid:number;
  nodeVersion:string;

  memory:{
    rss:number;
    heapUsed:number;
    heapTotal:number;
  };

  cpu:{
    load:number[];
  };

  system:{
    hostname:string;
    platform:string;
    cpus:number;
  };

}



function formatBytes(bytes:number){

  if(!bytes) return "0 MB";

  return (
    bytes / 1024 / 1024
  ).toFixed(2)+" MB";

}



function uptime(seconds:number){

  const h=Math.floor(seconds/3600);

  const m=Math.floor(
    seconds%3600/60
  );

  const s=Math.floor(
    seconds%60
  );


  return `${h}h ${m}m ${s}s`;

}



export default function Operator(){


const [runtime,setRuntime]=useState<Runtime|null>(null);

const [workers,setWorkers]=useState<Worker[]>([]);



async function load(){


try{


const runtimeRes =
await fetch(
"/api/v1/operator/runtime",
{
credentials:"include"
}
);


const runtimeData =
await runtimeRes.json();


if(runtimeData.success){

setRuntime(
runtimeData.data
);

}



const workerRes =
await fetch(
"/api/v1/operator/workers",
{
credentials:"include"
}
);



const workerData =
await workerRes.json();



if(workerData.success){

setWorkers(
workerData.data
);

}



}
catch(err){

console.error(err);

}


}



useEffect(()=>{


load();


const timer=setInterval(
load,
5000
);


return()=>clearInterval(timer);


},[]);




async function restart(){


const ok =
confirm(
"Send restart request?"
);


if(!ok)
return;



await fetch(
"/api/v1/operator/restart",
{
method:"POST",
credentials:"include"
}
);


alert(
"Restart request sent"
);


}




return (

<DashboardLayout>

<div
style={{
padding:"30px",
color:"white"
}}
>


<h1>
🖥 ISCAN Operator
</h1>


<p style={{
color:"#64748b"
}}>
Live server operations console
</p>



<div
style={{
display:"grid",
gridTemplateColumns:
"repeat(auto-fit,minmax(230px,1fr))",
gap:18,
marginTop:25
}}
>



{
[
["STATUS","ONLINE"],
["PID",runtime?.pid || "—"],
["NODE",runtime?.nodeVersion || "—"],
["UPTIME",
runtime
?
uptime(runtime.uptime)
:
"loading..."
]

].map(card=>(


<div
key={card[0]}
style={{
background:"#0d1526",
border:"1px solid #1d2942",
borderRadius:14,
padding:20
}}
>


<div style={{
fontSize:12,
color:"#64748b"
}}>
{card[0]}
</div>


<div style={{
fontSize:24,
fontWeight:700,
marginTop:8
}}>
{card[1]}
</div>


</div>


))


}



</div>





<div
style={{
marginTop:25,
background:"#0d1526",
border:"1px solid #1d2942",
borderRadius:14,
padding:25
}}
>


<h2>
⚙ Workers
</h2>



{
workers.map(worker=>(


<div
key={worker.name}
style={{
display:"flex",
justifyContent:"space-between",
padding:"14px 0",
borderBottom:"1px solid #1d2942"
}}
>


<div>

<div style={{
fontWeight:700
}}>
{worker.name}
</div>


<div style={{
fontSize:12,
color:"#64748b"
}}>
{worker.type}
</div>


</div>



<div style={{
color:
worker.status==="ONLINE"
?
"#4ade80"
:
"#f87171",
fontWeight:700
}}>

● {worker.status}

</div>


</div>


))

}


</div>





<div
style={{
marginTop:25,
background:"#0d1526",
border:"1px solid #1d2942",
borderRadius:14,
padding:25
}}
>


<h2>
📊 Resources
</h2>


<p>
RAM:
{" "}
{
runtime
?
formatBytes(
runtime.memory.rss
)
:
"—"
}
</p>


<p>
Heap:
{" "}
{
runtime
?
formatBytes(
runtime.memory.heapUsed
)
:
"—"
}
</p>


<p>
CPU Load:
{" "}
{
runtime
?
runtime.cpu.load.join(", ")
:
"—"
}
</p>


<p>
Machine:
{" "}
{
runtime?.system.hostname
}
</p>


</div>





<button

onClick={restart}

style={{

marginTop:30,

background:"#dc2626",

color:"white",

border:"none",

borderRadius:10,

padding:"14px 25px",

fontWeight:700,

cursor:"pointer"

}}

>

Restart Request

</button>




</div>


</DashboardLayout>

);


}
