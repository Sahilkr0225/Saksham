import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
  phone: z.string().min(1, { message: 'Phone is required' }).optional().nullable()
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, { message: 'Current password is required' }),
  new_password: z.string()
    .min(8, { message: 'New password must be at least 8 characters long' })
    .regex(/[A-Z]/, { message: 'New password must contain at least one uppercase letter' })
    .regex(/[a-z]/, { message: 'New password must contain at least one lowercase letter' })
    .regex(/[0-9]/, { message: 'New password must contain at least one number' })
    .regex(/[^A-Za-z0-9]/, { message: 'New password must contain at least one special character' })
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' })
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }),
  otp: z.string().length(6, { message: 'OTP must be exactly 6 characters' }),
  new_password: z.string()
    .min(8, { message: 'New password must be at least 8 characters long' })
    .regex(/[A-Z]/, { message: 'New password must contain at least one uppercase letter' })
    .regex(/[a-z]/, { message: 'New password must contain at least one lowercase letter' })
    .regex(/[0-9]/, { message: 'New password must contain at least one number' })
    .regex(/[^A-Za-z0-9]/, { message: 'New password must contain at least one special character' })
});
export default {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema
};
