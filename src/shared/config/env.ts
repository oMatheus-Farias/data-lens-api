import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3333'),
  GOOGLE_API_CLOUD_VISION_SECRET: z.string().optional(),
});

export const env = schema.parse(process.env);
