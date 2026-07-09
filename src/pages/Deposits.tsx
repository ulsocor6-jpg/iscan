import DashboardLayout from "../banking/components/DashboardLayout";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

const CHAINS = [
  {
    key: "RONIN",
    name: "Ronin",
    token: "FLOWER",
    icon: "🗡️",
    color: "#2563eb",
    warning: "Only send FLOWER or supported Ronin assets to this address."
  },
  {
    key: "BASE",
    name: "Base",
    token: "USDC",
    icon: "🔵",
    color: "#0052FF",
    warning: "Only send supported Base assets to this address."
  }
];

export default function Deposits() {

    const [wallet,setWallet] = useState<any>(null);
    const [selected,setSelected] = useState("RONIN");
    const [copied,setCopied] = useState(false);

    useEffect(()=>{
        loadWallet();
    },[]);

    async function loadWallet(){
        const res = await fetch("/api/v1/wallet/list",{
            credentials:"include"
        });

        const json = await res.json();

        setWallet(json);
    }

    const current = wallet?.chainAddresses?.find(
        (c:any)=>c.chain===selected
    );

    async function copy(addr:string){
        await navigator.clipboard.writeText(addr);
        setCopied(true);
        setTimeout(()=>setCopied(false),2000);
    }

    useEffect(()=>{
        if(!current) return;

        QRCode.toCanvas(
            document.getElementById("depositQR") as HTMLCanvasElement,
            current.address,
            {
                width:180
            }
        );
    },[current]);

    return(

<DashboardLayout>

<div className="dashboard">

<h2>Deposit Assets</h2>

<div
style={{
display:"flex",
gap:12,
marginBottom:24
}}
>

{CHAINS.map(chain=>(

<button

key={chain.key}

onClick={()=>setSelected(chain.key)}

style={{

padding:"10px 18px",

background:selected===chain.key
?chain.color
:"#1d2942",

color:"white",

border:"none",

borderRadius:8,

cursor:"pointer"

}}

>

{chain.icon} {chain.name}

</button>

))}

</div>

{current && (

<div

style={{

background:"#0d1526",

padding:24,

borderRadius:12,

maxWidth:520

}}

>

<h3>

Deposit to {selected}

</h3>

<div

style={{

display:"flex",

justifyContent:"center",

marginBottom:20

}}

>

<canvas id="depositQR"/>

</div>

<div

style={{

background:"#121b2f",

padding:12,

borderRadius:8,

marginBottom:12

}}

>

<div

style={{

fontSize:11,

color:"#94a3b8"
  }}
>
  Deposit Address

</div>

<div

style={{

fontFamily:"monospace",

fontSize:12,

wordBreak:"break-all",

color:"#22c55e",

marginTop:6,

marginBottom:12

}}

>

{current.address}

</div>

<button

onClick={()=>copy(current.address)}

style={{

width:"100%",

padding:8,

borderRadius:8,

border:"none",

background:copied
?"#166534"
:"#1d2942",

color:"white"

}}

>

{copied
?"Copied!"
:"Copy"}

</button>

</div>

<div

style={{

background:"#2d1c00",

padding:12,

borderRadius:8,

fontSize:12,

color:"#fbbf24"
  }}
>
  ⚠ {CHAINS.find(c=>c.key===selected)?.warning}

</div>

</div>

)}

</div>

</DashboardLayout>

);

}
