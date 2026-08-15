import { Router } from 'express';
import {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  reactivateUser
} from '../controllers/userController';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import { createUserSchema, updateUserSchema } from '../validators/userValidator';

const router = Router();

// Create new user (Super Admin & Principal only)
router.post(
  '/',
  authenticate,
  authorize('super_admin', 'principal'),
  validateRequest(createUserSchema),
  createUser
);

// Get paginated list of users (Super Admin, Principal, Office Staff)
router.get(
  '/',
  authenticate,
  authorize('super_admin', 'principal', 'office_staff'),
  getUsers
);

// Get user profile by ID (Authenticated users)
router.get(
  '/:id',
  authenticate,
  getUserById
);

// Update user details (Super Admin & Principal)
router.patch(
  '/:id',
  authenticate,
  authorize('super_admin', 'principal'),
  validateRequest(updateUserSchema),
  updateUser
);

// Deactivate user account (Super Admin & Principal)
router.post(
  '/:id/deactivate',
  authenticate,
  authorize('super_admin', 'principal'),
  deactivateUser
);

// Reactivate user account (Super Admin only)
router.post(
  '/:id/reactivate',
  authenticate,
  authorize('super_admin'),
  reactivateUser
);

export default router;
