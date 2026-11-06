import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { StaffDashboard } from './StaffDashboard'

export function StaffLanding() {
  const { user } = useAuth()
  return user?.role === 'Doctor' ? <Navigate replace to="/doctor/dashboard" /> : <StaffDashboard />
}
