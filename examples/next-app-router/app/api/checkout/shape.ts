import { z } from '@nanquim/server';

export const providerSessionSchema = z
  .object({
    id: z.string().min(1),
    brCode: z.string().min(1),
    brCodeBase64: z.string().min(1).optional(),
    amount: z.number().int().positive(),
    expiresAt: z.union([z.string(), z.number()]),
    createdAt: z.union([z.string(), z.number()]).optional(),
    status: z.string().min(1),
  })
  .transform((value) => ({
    id: value.id,
    brCode: value.brCode,
    ...(value.brCodeBase64 === undefined ? {} : { brCodeBase64: value.brCodeBase64 }),
    amount: value.amount,
    expiresAt: value.expiresAt,
    ...(value.createdAt === undefined ? {} : { createdAt: value.createdAt }),
    status: value.status,
  }));

export const providerStatusSchema = z
  .object({
    status: z.string().min(1),
    endToEndId: z.string().min(1).optional(),
    paidAt: z.union([z.string(), z.number()]).optional(),
  })
  .transform((value) => ({
    status: value.status,
    ...(value.endToEndId === undefined ? {} : { endToEndId: value.endToEndId }),
    ...(value.paidAt === undefined ? {} : { paidAt: value.paidAt }),
  }));

export const unwrapProvider = (raw: unknown): unknown =>
  typeof raw === 'object' && raw !== null && 'data' in raw ? (raw as { data: unknown }).data : raw;
