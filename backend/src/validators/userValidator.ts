import { z } from 'zod';

export const VALID_ROLES = [
  'super_admin',
  'principal',
  'office_staff',
  'teacher',
  'parent',
  'student'
] as const;

export const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters'),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  phone: z.string().max(20, 'Phone number must not exceed 20 characters').optional().nullable(),
  role: z.enum(VALID_ROLES, {
    errorMap: () => ({ message: `Role must be one of: ${VALID_ROLES.join(', ')}` })
  }),
  avatar_url: z.string().url('Invalid avatar URL format').optional().nullable()
});

export const updateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  phone: z.string().max(20).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional()
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
