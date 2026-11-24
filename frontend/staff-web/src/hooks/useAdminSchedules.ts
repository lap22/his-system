import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from './useAuth'
import { adminSchedulesApi } from '../services/adminSchedulesApi'
import type { ScheduleForm } from '../types/adminSchedules'

export const adminScheduleKeys = { root: (userId: string, doctorId: string) => ['adminSchedules', userId, doctorId] as const,
  list: (userId: string, doctorId: string) => ['adminSchedules', userId, doctorId, 'list'] as const,
  detail: (userId: string, doctorId: string, id: string) => ['adminSchedules', userId, doctorId, 'detail', id] as const }
function gateFactory() { let busy = false; return async <T,>(action: () => Promise<T>) => { if (busy) throw Error('A schedule change is already in progress.'); busy = true; try { return await action() } finally { busy = false } } }
function useScope() { const { user, status } = useAuth(); return { userId: user?.userId ?? '', enabled: status === 'authenticated' && user?.role === 'Admin' } }
export function useAdminSchedules(doctorId: string) { const scope = useScope(); return useQuery({ queryKey: adminScheduleKeys.list(scope.userId, doctorId), queryFn: ({ signal }) => adminSchedulesApi.list(doctorId, signal), enabled: scope.enabled && !!doctorId, staleTime: 30_000, retry: false }) }
export function useAdminSchedule(doctorId: string, id: string) { const scope = useScope(); return useQuery({ queryKey: adminScheduleKeys.detail(scope.userId, doctorId, id), queryFn: ({ signal }) => adminSchedulesApi.detail(id, doctorId, signal), enabled: scope.enabled && !!doctorId && !!id, staleTime: 15_000, retry: false }) }
export function useAdminScheduleMutations(doctorId: string) {
  const { user } = useAuth(); const client = useQueryClient(); const [gate] = useState(gateFactory)
  const finish = async () => { await Promise.all([client.invalidateQueries({ queryKey: adminScheduleKeys.root(user?.userId ?? '', doctorId) }), client.invalidateQueries({ queryKey: ['doctorSchedules'] }), client.invalidateQueries({ queryKey: ['doctorAvailability', doctorId] })]) }
  const create = useMutation({ mutationFn: (values: ScheduleForm) => gate(() => adminSchedulesApi.create(doctorId, values)), onSuccess: finish, retry: false })
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: ScheduleForm }) => gate(() => adminSchedulesApi.update(id, doctorId, values)), onSuccess: finish, retry: false })
  const status = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => gate(() => adminSchedulesApi.updateStatus(id, doctorId, isActive)), onSuccess: finish, retry: false })
  return { create, update, status, isPending: create.isPending || update.isPending || status.isPending }
}
