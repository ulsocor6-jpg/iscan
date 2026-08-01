import clientHeartbeatService from "./clientHeartbeatService.js";

class ClientHealthController {

    heartbeat(req,res){

        try{

            const result =
                clientHeartbeatService.receive(req.body);

            return res.json(result);

        }catch(err){

            return res.status(400).json({

                success:false,

                error:err.message

            });

        }

    }

}

export default new ClientHealthController();
