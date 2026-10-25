import { z } from 'zod';

export const createExamSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  type: z.enum(['unit_test', 'mid_term', 'final', 'quiz', 'quarterly', 'half_yearly', 'annual']),
  academic_year_id: z.string().uuid('Invalid academic year ID'),
  class_id: z.string().uuid('Invalid class ID')
});

export const createExamSubjectSchema = z.object({
  exam_id: z.string().uuid('Invalid exam ID'),
  subject_id: z.string().uuid('Invalid subject ID'),
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  max_marks: z.number().positive('Max marks must be greater than 0').default(100),
  pass_marks: z.number().positive('Pass marks must be greater than 0').default(40)
});

export const enterBulkMarksSchema = z.object({
  exam_subject_id: z.string().uuid('Invalid exam subject ID'),
  marks: z.array(z.object({
    student_id: z.string().uuid('Invalid student ID'),
    marks_obtained: z.number().min(0, 'Marks cannot be negative').optional().nullable(),
    is_absent: z.boolean().optional().default(false),
    remarks: z.string().max(500).optional().nullable()
  })).min(1, 'At least one student mark record is required')
});

export const updateExamStatusSchema = z.object({
  status: z.enum(['draft', 'scheduled', 'ongoing', 'completed', 'published'])
});
