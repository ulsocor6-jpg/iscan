import { useState } from "react";

export default function StageTabs({flow}){

const [tab,setTab] = useState(0);

const stage = flow.stages[tab];

return(

<div className="border rounded-lg">

<div className="flex border-b">

{

flow.stages.map((s,index)=>(

<button

key={s.name}

onClick={()=>setTab(index)}

className="px-5 py-3"

>

{s.name}

</button>

))

}

</div>

<div className="p-5">

<pre className="overflow-auto text-sm">

{

JSON.stringify(stage,null,2)

}

</pre>

</div>

</div>

);

}
