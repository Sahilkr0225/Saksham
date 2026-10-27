import { z } from 'zod';

export const createAlbumSchema = z.object({
  title: z.string().min(3, 'Album title must be at least 3 characters').max(255),
  description: z.string().max(1000).optional().default(''),
  cover_image_url: z.string().optional().default(''),
  is_public: z.boolean().optional().default(true),
  category: z.enum(['events', 'campus', 'sports', 'annual_day', 'achievements', 'other']).optional().default('events')
});

export const updateAlbumSchema = z.object({
  title: z.string().min(3, 'Album title must be at least 3 characters').max(255).optional(),
  description: z.string().max(1000).optional(),
  cover_image_url: z.string().optional(),
  is_public: z.boolean().optional(),
  category: z.enum(['events', 'campus', 'sports', 'annual_day', 'achievements', 'other']).optional()
});

export const uploadMediaSchema = z.object({
  album_id: z.string().uuid('Invalid album ID'),
  title: z.string().max(255).optional().default(''),
  caption: z.string().max(1000).optional().default(''),
  file_name: z.string().min(1, 'File name is required').max(255),
  mime_type: z.string().optional().default('image/jpeg'),
  file_data: z.string().min(10, 'File content cannot be empty')
});
