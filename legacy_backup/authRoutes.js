import express from 'express';
import { register, verify, login, logout } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/verify', verify);

export default router;
