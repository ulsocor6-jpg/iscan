import { useEffect, useState } from "react";
import DashboardLayout from "../banking/components/DashboardLayout";

interface NodeHealth {

  node:string;
  type:string;
  status:string;
  metrics:any;
  error:any;
  lastSeen:string;

}


export default function MissionControl(){

  const [health,setHealth] = useState<any>(null);
  const [loading,setLoading] = useState(true);


  async function load(){

    try{

      const res = await fetch(
        "/api/v1/intelligence/health",
        {
          credentials:"include"
        }
      );

      const data = await res.json();

      if(data.success){

        setHealth(data.data);

      }

    }
    catch(err){

      console.error(err);

    }
    finally{

      setLoading(false);

    }

  }


  useEffect(()=>{

    load();

    const timer=setInterval(
      load,
      10000
    );


    return()=>clearInterval(timer);


  },[]);



  return (

    <DashboardLayout>

      <div style={{
        padding:"30px",
        color:"white"
      }}>


        <h1 style={{
          fontSize:26,
          marginBottom:8
        }}>
          🛰️ ISCAN Mission Control
        </h1>


        <p style={{
          color:"#64748b"
        }}>
          Real-time intelligence layer monitoring ISCAN infrastructure
        </p>



        {
          loading ?

          <div>
            Loading intelligence...
          </div>

          :

          <>


          <div style={{
            marginTop:25,
            padding:25,
            background:"#0d1526",
            borderRadius:14,
            border:"1px solid #1d2942"
          }}>


            <h2>
              System Status
            </h2>


            <div style={{
              fontSize:30,
              fontWeight:800,
              color:
                health?.overallStatus==="HEALTHY"
                ?
                "#4ade80"
                :
                "#f87171"
            }}>

              {health?.overallStatus}

            </div>


          </div>




          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",
            gap:18,
            marginTop:25
          }}>


          {
            health?.nodes?.map(
              (node:NodeHealth)=>(


              <div
              key={node.node}
              style={{

                background:"#0d1526",
                border:"1px solid #1d2942",
                borderRadius:14,
                padding:20

              }}>


                <div style={{
                  display:"flex",
                  justifyContent:"space-between"
                }}>

                  <b>
                    {node.node}
                  </b>


                  <span style={{
                    color:
                    node.status==="ONLINE"
                    ?
                    "#4ade80"
                    :
                    "#f87171"
                  }}>

                    ● {node.status}

                  </span>


                </div>



                <div style={{
                  marginTop:12,
                  color:"#94a3b8",
                  fontSize:13
                }}>

                  Type:
                  {" "}
                  {node.type}


                </div>



                <div style={{
                  marginTop:8,
                  color:"#64748b",
                  fontSize:12
                }}>

                  Last seen:

                  {" "}

                  {
                    new Date(
                      node.lastSeen
                    ).toLocaleTimeString()
                  }


                </div>



                {
                  node.error &&
                  <div style={{
                    color:"#f87171",
                    marginTop:10
                  }}>
                    {node.error}
                  </div>
                }



              </div>


              )
            )
          }


          </div>


          </>

        }


      </div>


    </DashboardLayout>

  );


}
