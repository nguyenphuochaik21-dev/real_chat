import { z } from 'zod'

export const FULL_NAME_MAX = 25
export const USERNAME_MAX = 25

export const registrationSchema = z
  .object({
    fullName: z.string().trim().min(1).max(FULL_NAME_MAX),
    username: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{3,25}$/),
    email: z.string().trim().email(),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
