import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from './useAuth'
import { adminDoctorsApi } from '../services/adminDoctorsApi'
import type { CreateDoctorForm, UpdateDoctorForm } from '../types/adminDoctors'
import { adminDepartmentKeys } from './useAdminDepartments'

export const adminDoctorKeys = { root: (userId: string) => ['adminDoctors', userId] as const,
  list: (userId: string) => ['adminDoctors', userId, 'list'] as const,
  detail: (userId: string, id: string) => ['adminDoctors', userId, 'detail', id] as const }
function gateFactory() { let busy = false; return async <T,>(action: () => Promise<T>) => { if (busy) throw Error('A Doctor change is already in progress.'); busy = true; try { return await action() } finally { busy = false } } }
function useAdminScope() { const { user, status } = useAuth(); return { userId: user?.userId ?? '', enabled: status === 'authenticated' && user?.role === 'Admin' } }
export function useAdminDoctors() { const value = useAdminScope(); return useQuery({ queryKey: adminDoctorKeys.list(value.userId), queryFn: ({ signal }) => adminDoctorsApi.list(signal), enabled: value.enabled, staleTime: 30_000, retry: false }) }
export function useAdminDoctor(id: string) { const value = useAdminScope(); return useQuery({ queryKey: adminDoctorKeys.detail(value.userId, id), queryFn: ({ signal }) => adminDoctorsApi.detail(id, signal), enabled: value.enabled && !!id, staleTime: 15_000, retry: false }) }
export function useAdminDoctorMutations() {
  const { user } = useAuth(); const client = useQueryClient(); const [gate] = useState(gateFactory)
  const finish = async () => { const userId = user?.userId ?? ''; await Promise.all([
    client.invalidateQueries({ queryKey: adminDoctorKeys.root(userId) }),
    client.invalidateQueries({ queryKey: adminDepartmentKeys.list(userId) }),
  ]) }
  const create = useMutation({ mutationFn: (values: CreateDoctorForm) => gate(() => adminDoctorsApi.create(values)), onSuccess: finish, retry: false })
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: UpdateDoctorForm }) => gate(() => adminDoctorsApi.update(id, values)), onSuccess: finish, retry: false })
  const status = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => gate(() => adminDoctorsApi.updateStatus(id, isActive)), onSuccess: finish, retry: false })
  return { create, update, status, isPending: create.isPending || update.isPending || status.isPending }
}
