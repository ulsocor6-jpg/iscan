import Beneficiary from "../models/Beneficiary.js";

export const addBeneficiary = async (req,res)=>
{
    try
    {
        const beneficiary =
        await Beneficiary.create({
            ...req.body,
            ownerUserId:req.user.id
        });

        res.status(201).json(beneficiary);
    }
    catch(err)
    {
        res.status(500).json({
            error:err.message
        });
    }
};

export const getBeneficiaries =
async(req,res)=>
{
    const beneficiaries =
    await Beneficiary.find({
        ownerUserId:req.user.id
    });

    res.json(beneficiaries);
};
