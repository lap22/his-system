import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from './useAuth'
import { adminDepartmentsApi } from '../services/adminDepartmentsApi'
import type { DepartmentForm } from '../types/adminDepartments'

export const adminDepartmentKeys = {
  list: (userId: string) => ['adminDepartments', userId, 'list'] as const,
}

function createMutationGate() {
  let locked = false
  return async <T,>(action: () => Promise<T>) => {
    if (locked) throw new Error('A department change is already in progress.')
    locked = true
    try { return await action() } finally { locked = false }
  }
}

export function useAdminDepartments() {
  const { user, status } = useAuth()
  return useQuery({
    queryKey: adminDepartmentKeys.list(user?.userId ?? ''),
    queryFn: ({ signal }) => adminDepartmentsApi.list(signal),
    enabled: status === 'authenticated' && user?.role === 'Admin',
    staleTime: 30_000,
    retry: false,
  })
}

export function useAdminDepartmentMutations() {
  const { user } = useAuth()
  const client = useQueryClient()
  const [gate] = useState(createMutationGate)
  const finish = async () => client.invalidateQueries({ queryKey: adminDepartmentKeys.list(user?.userId ?? '') })
  const create = useMutation({ mutationFn: (values: DepartmentForm) => gate(() => adminDepartmentsApi.create(values)), onSuccess: finish, retry: false })
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: DepartmentForm }) => gate(() => adminDepartmentsApi.update(id, values)), onSuccess: finish, retry: false })
  const status = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => gate(() => adminDepartmentsApi.updateStatus(id, isActive)), onSuccess: finish, retry: false })
  return { create, update, status, isPending: create.isPending || update.isPending || status.isPending }
}
