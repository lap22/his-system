import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { useCurrentDoctor } from './useCurrentDoctor'
import { doctorQueueKeys } from './useDoctorQueue'
import { authSession } from '../services/authSession'
import { createQueueConnection } from '../services/realtimeQueue'
import { createQueueRealtimeManager } from '../services/queueRealtimeManager'
import { currentQueueToken, isQueueSessionActive } from '../services/queueRealtimeAuth'

const manager = createQueueRealtimeManager({ create: createQueueConnection, token: currentQueueToken,
  active: isQueueSessionActive, subscribeAuth: authSession.subscribe })

export function useQueueRealtime() {
  const { user, status } = useAuth()
  const doctor = useCurrentDoctor()
  const client = useQueryClient()
  const [attempt, setAttempt] = useState(0)
  const userId = user?.userId
  const role = user?.role
  const doctorId = doctor.isSuccess ? doctor.data.id : undefined
  const generation = authSession.getAccountGeneration()
  useEffect(() => {
    if (!userId || !doctorId || role !== 'Doctor' || status !== 'authenticated') return
    return manager.acquire({ userId, doctorId, generation }, date => {
      void client.invalidateQueries({ queryKey: date ? doctorQueueKeys.date(userId, doctorId, date) : doctorQueueKeys.root(userId, doctorId) })
      void client.invalidateQueries({ queryKey: ['doctorAppointments', userId, doctorId] })
    })
  }, [userId, doctorId, generation, role, status, client, attempt])
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot)
  return { ...state, reconnect: () => setAttempt(value => value + 1) }
}
