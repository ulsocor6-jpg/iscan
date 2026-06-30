const stages = [

"Watcher",

"Parser",

"Dedup",

"Verifier",

"Matcher",

"Ledger",

"Wallet",

"Dashboard"

];

export default function PipelineGraph({flow}){

return(

<div className="border rounded-lg p-4">

<h2 className="font-bold mb-4">

Pipeline

</h2>

<div className="flex items-center justify-between">

{

stages.map(stage=>{

const data = flow.stages.find(s=>s.name===stage);

const color =

!data
?

"bg-gray-300"

:

data.status==="completed"

?

"bg-green-500"

:

data.status==="failed"

?

"bg-red-500"

:

"bg-yellow-500";

return(

<div

key={stage}

className="flex flex-col items-center"

>

<div

className={`

w-12
h-12
rounded-full

${color}

`}

/>

<div className="text-xs mt-2">

{stage}

</div>

</div>

);

})

}

</div>

</div>

);

}
