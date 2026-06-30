export default function TimelinePanel({flow}){

return(

<div className="border rounded-lg p-4">

<h2 className="font-bold mb-4">

Timeline

</h2>

{

flow.stages.map(stage=>(

<div

key={stage.name}

className="border-b py-3"

>

<div className="font-semibold">

{stage.name}

</div>

<div>

{stage.status}

</div>

<div className="text-xs text-gray-500">

Started

{stage.startedAt}

</div>

<div className="text-xs text-gray-500">

Finished

{stage.finishedAt}

</div>

</div>

))

}

</div>

);

}
