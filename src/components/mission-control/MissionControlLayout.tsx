import React from "react";
import SystemCanvas from "./SystemCanvas";
import InspectorPanel from "./InspectorPanel";

type Props={
    children:React.ReactNode
}

export default function MissionControlLayout({children}:Props){

return(

<div
style={{
display:"grid",
gridTemplateColumns:"260px 1fr 360px",
height:"100vh",
background:"#0c1018",
color:"white"
}}
>

<div
style={{
borderRight:"1px solid #222"
}}
>

{children}

</div>

<div
style={{
padding:20,
borderRight:"1px solid #222"
}}
>

<SystemCanvas/>

</div>

<div
style={{
padding:20
}}
>

<InspectorPanel/>

</div>

</div>

)

}
