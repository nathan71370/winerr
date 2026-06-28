import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const addBottleSchema = z.object({
  // wine fields
  producer: z.string().min(1),
  cuvee: z.preprocess(emptyToUndefined, z.string().optional()),
  vintage: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1800).max(2100).optional()),
  region: z.preprocess(emptyToUndefined, z.string().optional()),
  country: z.preprocess(emptyToUndefined, z.string().optional()),
  color: z.enum(["rouge", "blanc", "rose", "effervescent"]),
  grapes: z.preprocess(emptyToUndefined, z.string().optional()),
  lwinCode: z.preprocess(emptyToUndefined, z.string().optional()),
  // bottle fields
  quantity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  purchasePrice: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

export type AddBottleInput = z.infer<typeof addBottleSchema>;
