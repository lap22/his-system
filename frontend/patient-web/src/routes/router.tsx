import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AuthBoundary } from '../components/AuthBoundary'
import { AppLayout } from '../layouts/AppLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { NotFound } from '../pages/NotFound'
import { PatientDashboard } from '../pages/PatientDashboard'
import { PatientProfilesPage } from '../pages/PatientProfilesPage'
import { DoctorsPage } from '../pages/DoctorsPage'
import { MyAppointmentsPage } from '../pages/MyAppointmentsPage'
import { AppointmentDetailsPage } from '../pages/AppointmentDetailsPage'

export const router = createBrowserRouter([
  { element: <AuthBoundary publicPage />, children: [
    { element: <AuthLayout />, children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ] },
  ] },
  { element: <AuthBoundary />, children: [
    { path: '/', element: <AppLayout />, children: [
      { index: true, element: <PatientDashboard /> },
      { path: 'dashboard', element: <Navigate replace to="/" /> },
      { path: 'profiles', element: <PatientProfilesPage /> },
      { path: 'doctors', element: <DoctorsPage /> },
      { path: 'appointments', element: <MyAppointmentsPage /> },
      { path: 'appointments/:id', element: <AppointmentDetailsPage /> },
      { path: '*', element: <NotFound /> },
    ] },
  ] },
])
