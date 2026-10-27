import { z } from 'zod';

export const uploadDocumentSchema = z.object({
  entity_type: z.enum(['student', 'teacher', 'admission', 'general']),
  entity_id: z.string().uuid({ message: 'Invalid entity ID' }),
  document_type: z.enum([
    'birth_certificate',
    'transfer_certificate',
    'mark_sheet',
    'id_proof',
    'qualification',
    'resume',
    'other'
  ]),
  title: z.string().min(1, 'Title is required').max(255, 'Title cannot exceed 255 characters'),
  file_name: z.string().min(1, 'File name is required').max(255, 'File name cannot exceed 255 characters'),
  file_data: z.string().min(1, 'File content (base64) is required'),
  mime_type: z.string().max(100).optional().default('application/octet-stream')
});

export const verifyDocumentSchema = z.object({
  status: z.enum(['verified', 'rejected'], {
    errorMap: () => ({ message: "Status must be either 'verified' or 'rejected'" })
  }),
  remarks: z.string().max(500, 'Remarks cannot exceed 500 characters').optional()
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  document_type: z.enum([
    'birth_certificate',
    'transfer_certificate',
    'mark_sheet',
    'id_proof',
    'qualification',
    'resume',
    'other'
  ]).optional()
});
