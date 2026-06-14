export const getDepositStatus = async (req, res) => {
  try {
    const { depositId } = req.params;
    return res.json({ success: true, data: { depositId, status: 'pending' } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
