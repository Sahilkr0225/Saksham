import { z } from 'zod';

export const createAcademicYearSchema = z.object({
  name: z.string().min(2, 'Name is required').max(50),
  start_date: z.string().datetime({ message: 'Invalid start date format (ISO format required)' }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')),
  end_date: z.string().datetime({ message: 'Invalid end date format (ISO format required)' }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')),
  is_current: z.boolean().optional()
});

export const updateAcademicYearSchema = createAcademicYearSchema.partial();

export const createClassSchema = z.object({
  name: z.string().min(1, 'Class name is required').max(50),
  code: z.string().max(20).optional().nullable(),
  display_order: z.number().int().min(0).optional()
});

export const updateClassSchema = createClassSchema.partial();

export const createSectionSchema = z.object({
  class_id: z.string().uuid('Invalid Class UUID'),
  name: z.string().min(1, 'Section name is required').max(50),
  capacity: z.number().int().positive().optional(),
  room_number: z.string().max(20).optional().nullable()
});

export const updateSectionSchema = createSectionSchema.omit({ class_id: true }).partial();

export const SUBJECT_TYPES = ['core', 'elective', 'lab', 'activity'] as const;

export const createSubjectSchema = z.object({
  name: z.string().min(2, 'Subject name is required').max(100),
  code: z.string().min(2, 'Subject code is required').max(20).toUpperCase(),
  type: z.enum(SUBJECT_TYPES, {
    errorMap: () => ({ message: `Subject type must be one of: ${SUBJECT_TYPES.join(', ')}` })
  }).default('core')
});

export const updateSubjectSchema = createSubjectSchema.partial();

export const assignSubjectSchema = z.object({
  class_id: z.string().uuid('Invalid Class UUID'),
  subject_id: z.string().uuid('Invalid Subject UUID'),
  academic_year_id: z.string().uuid('Invalid Academic Year UUID'),
  teacher_id: z.string().uuid('Invalid Teacher UUID').optional().nullable()
});
