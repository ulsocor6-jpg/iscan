import operatorService from "../operator/operatorService.js";


export async function runtime(req,res){

    try{

        res.json({

            success:true,

            data:
            operatorService.getRuntime()

        });


    }
    catch(err){

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

}



export async function workers(req,res){

    try{

        res.json({

            success:true,

            data:
            operatorService.getWorkers()

        });

    }
    catch(err){

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

}



export async function restart(req,res){

    try{

        const result =
            await operatorService.restart();


        res.json({

            success:true,

            data:result

        });


    }
    catch(err){

        res.status(500).json({

            success:false,

            message:err.message

        });

    }

}
