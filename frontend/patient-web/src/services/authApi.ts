import { authResponseSchema, userSchema } from '../types/auth'
import type { LoginRequest, RegisterRequest, LogoutRequest, LogoutResponse } from '../types/auth'
import { apiClient, authClient } from './apiClient'
export const authApi = {
  async login(request: LoginRequest) {
    return authResponseSchema.parse((await authClient.post('/Auth/login', request)).data)
  },
  async register(request: RegisterRequest) {
    return authResponseSchema.parse((await authClient.post('/Auth/register', request)).data)
  },
  async me() {
    return userSchema.parse((await apiClient.get('/Auth/me')).data)
  },
  async logout(request: LogoutRequest) {
    return (await authClient.post<LogoutResponse>('/Auth/logout', request)).data
  },
}
