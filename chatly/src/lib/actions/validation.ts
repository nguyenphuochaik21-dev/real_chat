import 'server-only'

import { z } from 'zod'

export const uuidSchema = z.string().uuid()
export const messageContentSchema = z.string().trim().min(1).max(10_000)
export const shortTextSchema = z.string().trim().min(1).max(100)

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error('Invalid request data')
  return result.data
}
