import { z } from 'zod';

export const updateSettingsSchema = z.object({
  school_name: z.string().min(1).max(255).optional(),
  affiliation_number: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  website: z.string().max(255).optional(),
  logo_url: z.string().optional(),
  motto: z.string().max(255).optional(),
  currency: z.string().min(1).max(10).optional(),
  period_duration_minutes: z.number().int().min(15).max(180).optional(),
  attendance_cutoff_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format').optional(),
  working_days: z.array(z.string()).optional(),
  grading_scale: z.array(z.object({
    grade: z.string(),
    min: z.number()
  })).optional()
});

export const promoteStudentsSchema = z.object({
  source_class_id: z.string().uuid({ message: 'Invalid source class ID' }),
  target_class_id: z.string().uuid({ message: 'Invalid target class ID' }),
  target_section_id: z.string().uuid({ message: 'Invalid target section ID' }).optional(),
  student_ids: z.array(z.string().uuid()).optional()
});
