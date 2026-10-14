import { z } from 'zod'

export const userSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  role: z.enum(['Patient', 'Doctor', 'Admin']),
})
export const authResponseSchema = userSchema.extend({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: z.iso.datetime(),
})
export type CurrentUserResponse = z.infer<typeof userSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>
export type UserRole = CurrentUserResponse['role']
export interface LoginRequest { email: string; password: string }
export interface RegisterRequest extends LoginRequest { confirmPassword: string }
export interface RefreshTokenRequest { refreshToken: string }
export type LogoutRequest = RefreshTokenRequest
export interface LogoutResponse { message: string }

export const loginSchema = z.object({
  email: z.string().trim().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.'),
})
export const registerSchema = loginSchema.extend({
  password: z.string().min(8, 'Use at least 8 characters.'),
  confirmPassword: z.string().min(1, 'Confirm your password.'),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords must match.',
})
