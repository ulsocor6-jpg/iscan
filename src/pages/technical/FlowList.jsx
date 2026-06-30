export default function FlowList({

flows,
selected,
onSelect

}){

return(

<div className="border rounded-lg">

<div className="font-semibold p-3 border-b">

Recent Flows

</div>

{

flows.map(flow=>(

<div

key={flow.flowId}

onClick={()=>onSelect(flow)}

className={`

p-3
cursor-pointer
border-b

${selected?._id===flow._id?"bg-blue-50":""}

`}

>

<div>

{flow.flowId}

</div>

<div className="text-xs text-gray-500">

{flow.source}

</div>

<div>

{flow.status}

</div>

</div>

))

}

</div>

);

}
