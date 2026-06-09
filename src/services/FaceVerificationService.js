class FaceVerificationService {

  async compareFaces(
    idImage,
    selfieImage
  ) {

    return {
      matched: true,
      confidence: 0.98
    };

  }

}

export default new FaceVerificationService();
