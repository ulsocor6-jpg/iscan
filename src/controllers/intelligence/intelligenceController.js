import intelligenceCore from "../../intelligence/intelligenceCore.js";

export async function getSystemHealth(req,res){

    try{

        const snapshot =
            intelligenceCore.getHealth();

        res.json({

            success:true,

            data:snapshot

        });

    }catch(err){

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

}
