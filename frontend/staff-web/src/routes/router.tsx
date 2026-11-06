import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AuthBoundary } from '../components/AuthBoundary'
import { AppLayout } from '../layouts/AppLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { LoginPage } from '../pages/LoginPage'
import { DoctorBoundary } from '../components/DoctorBoundary'
import { PortalRouteError } from '../components/PortalRouteError'

import { NotFound } from '../pages/NotFound'
import { StaffLanding } from '../pages/StaffLanding'

const doctorRouteFallback = <div role="status" aria-live="polite">Loading Doctor Portal…</div>

export const router = createBrowserRouter([
  { element: <AuthBoundary publicPage />, children: [
    { element: <AuthLayout />, children: [
      { path: '/login', element: <LoginPage /> },
      
    ] },
  ] },
  { element: <AuthBoundary />, errorElement: <PortalRouteError />, children: [
    { element: <DoctorBoundary />, children: [
      { path: '/doctor', hydrateFallbackElement: doctorRouteFallback, lazy: async () => ({
        Component: (await import('../layouts/DoctorLayout')).DoctorLayout,
      }), children: [
        { index: true, element: <Navigate replace to="dashboard" /> },
        { path: 'dashboard', hydrateFallbackElement: doctorRouteFallback, lazy: async () => ({
          Component: (await import('../pages/DoctorDashboard')).DoctorDashboard,
        }) },
        { path: 'appointments', hydrateFallbackElement: doctorRouteFallback, lazy: async () => ({
          Component: (await import('../pages/DoctorAppointmentsPage')).DoctorAppointmentsPage,
        }) },
        { path: 'appointments/:id', hydrateFallbackElement: doctorRouteFallback, lazy: async () => ({
          Component: (await import('../pages/DoctorAppointmentDetailsPage')).DoctorAppointmentDetailsPage,
        }) },
        { path: 'appointments/:appointmentId/clinical', hydrateFallbackElement: doctorRouteFallback, lazy: async () => ({
          Component: (await import('../pages/ClinicalExaminationPage')).ClinicalExaminationPage,
        }) },
        { path: 'schedule', hydrateFallbackElement: doctorRouteFallback, lazy: async () => ({
          Component: (await import('../pages/DoctorSchedulePage')).DoctorSchedulePage,
        }) },
        { path: 'queue', hydrateFallbackElement: doctorRouteFallback, lazy: async () => ({
          Component: (await import('../pages/DoctorQueuePage')).DoctorQueuePage,
        }) },
      ] },
    ] },
    { path: '/', element: <AppLayout />, children: [
      { index: true, element: <StaffLanding /> },
      { path: 'dashboard', element: <Navigate replace to="/" /> },
      { path: '*', element: <NotFound /> },
    ] },
  ] },
])
