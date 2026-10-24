import { z } from 'zod';

// ─── Notice Schemas ──────────────────────────────────────────────────────────

export const createNoticeSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  content: z.string().min(5, 'Content must be at least 5 characters').max(5000),
  type: z.enum(['general', 'academic', 'event', 'urgent']).default('general'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  target_audience: z.enum(['all', 'role', 'class']).default('all'),
  target_role: z.string().max(50).optional(),
  target_class_id: z.string().uuid('Invalid class ID').optional(),
  academic_year_id: z.string().uuid('Invalid academic year ID').optional(),
  published: z.boolean().default(false),
}).refine(
  (data) => data.target_audience !== 'role' || !!data.target_role,
  { message: 'target_role is required when target_audience is "role"', path: ['target_role'] }
).refine(
  (data) => data.target_audience !== 'class' || !!data.target_class_id,
  { message: 'target_class_id is required when target_audience is "class"', path: ['target_class_id'] }
);

export const updateNoticeSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  content: z.string().min(5).max(5000).optional(),
  type: z.enum(['general', 'academic', 'event', 'urgent']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  target_audience: z.enum(['all', 'role', 'class']).optional(),
  target_role: z.string().max(50).nullable().optional(),
  target_class_id: z.string().uuid('Invalid class ID').nullable().optional(),
  published: z.boolean().optional(),
});

// ─── Event Schemas ───────────────────────────────────────────────────────────

export const createEventSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().max(5000).optional(),
  event_type: z.enum(['exam', 'holiday', 'sports_day', 'ptm', 'cultural', 'other']),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  target_audience: z.enum(['all', 'class']).default('all'),
  target_class_id: z.string().uuid('Invalid class ID').optional(),
  academic_year_id: z.string().uuid('Invalid academic year ID').optional(),
}).refine(
  (data) => !data.end_date || data.end_date >= data.start_date,
  { message: 'end_date must be on or after start_date', path: ['end_date'] }
).refine(
  (data) => data.target_audience !== 'class' || !!data.target_class_id,
  { message: 'target_class_id is required when target_audience is "class"', path: ['target_class_id'] }
);

export const updateEventSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  event_type: z.enum(['exam', 'holiday', 'sports_day', 'ptm', 'cultural', 'other']).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').nullable().optional(),
  target_audience: z.enum(['all', 'class']).optional(),
  target_class_id: z.string().uuid('Invalid class ID').nullable().optional(),
});
