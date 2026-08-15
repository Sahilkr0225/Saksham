import { Router } from 'express';
import { 
  login, 
  refresh, 
  logout, 
  changePassword, 
  me, 
  forgotPassword, 
  resetPassword 
} from '../controllers/authController';
import { validateRequest } from '../middlewares/validate';
import { authenticate } from '../middlewares/auth';
import { 
  loginSchema, 
  changePasswordSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema 
} from '../validators/authValidator';

const router = Router();

// Public routes
router.post('/login', validateRequest(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/forgot-password', validateRequest(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validateRequest(resetPasswordSchema), resetPassword);

// Protected routes (require valid JWT access token)
router.patch('/change-password', authenticate, validateRequest(changePasswordSchema), changePassword);
router.get('/me', authenticate, me);

export default router;
