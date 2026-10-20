import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3333'),
  TESSERACT_LANG_PATH: z.string().optional(),
});

export const env = schema.parse(process.env);
