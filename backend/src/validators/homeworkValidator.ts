import { z } from 'zod';

export const createHomeworkSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().max(2000).optional(),
  class_id: z.string().uuid('Invalid class ID'),
  subject_id: z.string().uuid('Invalid subject ID'),
  section_id: z.string().uuid('Invalid section ID').optional(),
  academic_year_id: z.string().uuid('Invalid academic year ID'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
});

export const submitHomeworkSchema = z.object({
  remarks: z.string().max(1000).optional(),
});

export const updateSubmissionSchema = z.object({
  status: z.enum(['submitted', 'late', 'graded']),
  remarks: z.string().max(1000).optional(),
});

export const updateHomeworkSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().max(2000).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional(),
  status: z.enum(['active', 'archived']).optional(),
});
