import { z } from 'zod';

const schema = z.object({
  PORT: z.string().default('3333'),
});

export const env = schema.parse(process.env);
