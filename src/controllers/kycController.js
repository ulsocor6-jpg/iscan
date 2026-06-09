import IdentityProfile from '../models/IdentityProfile.js';
import OCRService from '../services/OCRService.js';
import FaceVerificationService from '../services/FaceVerificationService.js';

export const uploadID = async (req, res) => {

  try {

    const extracted =
      await OCRService.extractIDData();

    let profile =
      await IdentityProfile.findOne({
        userId: req.user.id
      });

    if (!profile) {

      profile =
        await IdentityProfile.create({

          userId: req.user.id,

          firstName:
            extracted.firstName,

          lastName:
            extracted.lastName,

          idType:
            extracted.idType,

          idNumber:
            extracted.idNumber

        });

    }

    res.json({
      success: true,
      profile
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'ID upload failed'
    });

  }

};

export const uploadSelfie = async (req, res) => {

  try {

    const profile =
      await IdentityProfile.findOne({
        userId: req.user.id
      });

    if (!profile) {

      return res.status(404).json({
        error: 'Upload ID first'
      });

    }

    const result =
      await FaceVerificationService.compareFaces();

    profile.faceVerified =
      result.matched;

    profile.kycStatus =
      result.matched
        ? 'verified'
        : 'rejected';

    await profile.save();

    res.json({
      success: true,
      result
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'Selfie verification failed'
    });

  }

};

export const getKYCStatus = async (
  req,
  res
) => {

  try {

    const profile =
      await IdentityProfile.findOne({
        userId: req.user.id
      });

    res.json(profile);

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: 'Unable to fetch status'
    });

  }

};
