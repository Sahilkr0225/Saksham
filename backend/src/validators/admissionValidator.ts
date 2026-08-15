import { z } from 'zod';

export const ADMISSION_STATUSES = ['submitted', 'under_review', 'approved', 'rejected', 'enrolled'] as const;
export const GENDERS = ['male', 'female', 'other'] as const;

export const createAdmissionSchema = z.object({
  applicant_name: z.string().min(2, 'Applicant name is required').max(100),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  gender: z.enum(GENDERS, {
    errorMap: () => ({ message: `Gender must be one of: ${GENDERS.join(', ')}` })
  }),
  applied_class_id: z.string().uuid('Invalid class UUID'),
  academic_year_id: z.string().uuid('Invalid academic year UUID'),
  parent_name: z.string().min(2, 'Parent name is required').max(100),
  parent_email: z.string().email('Invalid parent email address'),
  parent_phone: z.string().min(10, 'Phone number must be at least 10 digits').max(20),
  address: z.string().max(500).optional().nullable(),
  remarks: z.string().max(500).optional().nullable()
});

export const updateAdmissionStatusSchema = z.object({
  status: z.enum(ADMISSION_STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${ADMISSION_STATUSES.join(', ')}` })
  }),
  remarks: z.string().max(500).optional().nullable()
});

export const enrollStudentSchema = z.object({
  current_section_id: z.string().uuid('Invalid section UUID').optional().nullable(),
  roll_number: z.string().max(20).optional().nullable(),
  blood_group: z.string().max(5).optional().nullable(),
  emergency_contact: z.string().max(20).optional().nullable()
});
