import express from 'express';

import {
  addBank,
  getBanks,
  deleteBank
} from '../controllers/bankController.js';

import { requireAuth } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.post(
  '/add',
  requireAuth,
  addBank
);

router.get(
  '/list',
  requireAuth,
  getBanks
);

router.delete(
  '/:id',
  requireAuth,
  deleteBank
);

export default router;
