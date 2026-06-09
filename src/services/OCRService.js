class OCRService {

  async extractIDData(imageFile) {

    return {
      firstName: 'Demo',
      lastName: 'User',
      idNumber: 'ISCAN-DEMO-001',
      idType: 'National ID'
    };

  }

}

export default new OCRService();
