import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

router.get('/', async (req, res) => {
  const { type } = req.query;
  const filter = type && type !== 'all' ? { type: new RegExp(type, 'i') } : {};
  try {
    const db = mongoose.connection.db;
    const events = await db.collection('events')
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(200)
      .toArray();
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
