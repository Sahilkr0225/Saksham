import { z } from 'zod';

export const createPageSchema = z.object({
  slug: z.string().min(2, 'Slug must be at least 2 characters').max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  content_json: z.record(z.any()).optional().default({}),
  is_published: z.boolean().optional().default(true)
});

export const updatePageSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255).optional(),
  content_json: z.record(z.any()).optional(),
  is_published: z.boolean().optional()
});

export const submitInquirySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  email: z.string().email('Valid email address required'),
  phone: z.string().max(50).optional().default(''),
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(255),
  message: z.string().min(5, 'Message must be at least 5 characters').max(3000)
});

export const updateInquiryStatusSchema = z.object({
  status: z.enum(['new', 'contacted', 'resolved', 'archived']),
  notes: z.string().max(2000).optional().default('')
});
