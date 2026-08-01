import nodeRegistrationService from "./nodeRegistrationService.js";

class NodeRegistrationController {

    register(req, res) {

        try {

            const result =
                nodeRegistrationService.register(req.body);

            return res.json(result);

        } catch (err) {

            return res.status(400).json({

                success:false,

                error:err.message

            });

        }

    }

}

export default new NodeRegistrationController();
