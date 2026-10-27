import { z } from 'zod';

export const createNotificationSchema = z.object({
  userId: z.string().uuid({ message: 'Invalid target user ID' }).optional(),
  role: z.enum(['super_admin', 'principal', 'office_staff', 'teacher', 'parent', 'student']).optional(),
  title: z.string().min(1, 'Title is required').max(255, 'Title cannot exceed 255 characters'),
  message: z.string().min(1, 'Message is required').max(1000, 'Message cannot exceed 1000 characters'),
  type: z.enum(['system', 'notice', 'fee', 'attendance', 'homework', 'exam', 'admission', 'document']).default('system'),
  link: z.string().max(255, 'Link cannot exceed 255 characters').optional(),
  metadata: z.record(z.any()).optional()
}).refine((data) => data.userId || data.role, {
  message: 'Either userId or role must be provided',
  path: ['userId']
});
