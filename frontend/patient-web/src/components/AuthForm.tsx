import { useState } from 'react'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Box, Button, IconButton, InputAdornment, TextField } from '@mui/material'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import Login from '@mui/icons-material/Login'
import { useForm } from 'react-hook-form'
import { loginSchema, registerSchema } from '../types/auth'
import type { LoginRequest, RegisterRequest } from '../types/auth'
import { useLogin, useRegister } from '../hooks/useAuth'
import { authErrorMessage } from '../services/apiClient'

export function AuthForm({ registerAccount = false }: { registerAccount?: boolean }) {
  const login = useLogin()
  const registration = useRegister()
  const mutation = registerAccount ? registration : login
  const [showPassword, setShowPassword] = useState(false)
  const form = useForm<RegisterRequest>({
    resolver: zodResolver(registerAccount ? registerSchema : loginSchema.extend({ confirmPassword: z.string() })),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  })
  const [errorMessage, setErrorMessage] = useState('')
  const submit = form.handleSubmit(async (values) => {
    try {
      if (registerAccount) await registration.mutateAsync(values)
      else {
        const request: LoginRequest = { email: values.email, password: values.password }
        await login.mutateAsync(request)
      }
      form.reset()
    } catch (error) {
      setErrorMessage(authErrorMessage(error))
      form.resetField('password')
      form.resetField('confirmPassword')
    } finally {
      login.reset()
      registration.reset()
    }
  })
  return <Box component="form" noValidate onSubmit={(event) => {
    setErrorMessage('')
    void submit(event)
  }} sx={{ display: 'grid', gap: 2.5 }}>
    <TextField label="Email address" type="email" autoComplete="username" fullWidth {...form.register('email')} error={!!form.formState.errors.email} helperText={form.formState.errors.email?.message} disabled={mutation.isPending} />
    <TextField label="Password" type={showPassword ? 'text' : 'password'} autoComplete={registerAccount ? 'new-password' : 'current-password'} fullWidth {...form.register('password')} error={!!form.formState.errors.password} helperText={form.formState.errors.password?.message} disabled={mutation.isPending}
      slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)} edge="end">{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> } }} />
    {registerAccount && <TextField label="Confirm password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" fullWidth {...form.register('confirmPassword')} error={!!form.formState.errors.confirmPassword} helperText={form.formState.errors.confirmPassword?.message} disabled={mutation.isPending} />}
    {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
    <Button type="submit" variant="contained" startIcon={<Login />} disabled={mutation.isPending || form.formState.isSubmitting}>{mutation.isPending ? 'Please wait...' : registerAccount ? 'Create account' : 'Sign in'}</Button>
  </Box>
}
