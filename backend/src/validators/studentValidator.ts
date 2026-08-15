import { z } from 'zod';

export const STUDENT_STATUSES = ['active', 'transferred', 'graduated', 'suspended'] as const;
export const STUDENT_GENDERS = ['male', 'female', 'other'] as const;

export const updateStudentSchema = z.object({
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD').optional(),
  gender: z.enum(STUDENT_GENDERS, {
    errorMap: () => ({ message: `Gender must be one of: ${STUDENT_GENDERS.join(', ')}` })
  }).optional(),
  roll_number: z.string().max(20).optional().nullable(),
  blood_group: z.string().max(5).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  emergency_contact: z.string().min(10, 'Emergency contact must be at least 10 digits').max(20).optional().nullable()
});

export const updateStudentStatusSchema = z.object({
  status: z.enum(STUDENT_STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${STUDENT_STATUSES.join(', ')}` })
  }),
  remarks: z.string().max(500).optional().nullable()
});

export const assignStudentSectionSchema = z.object({
  class_id: z.string().uuid('Invalid Class UUID'),
  section_id: z.string().uuid('Invalid Section UUID').optional().nullable(),
  roll_number: z.string().max(20).optional().nullable()
});
