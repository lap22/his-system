import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AuthBoundary } from '../components/AuthBoundary'
import { AppLayout } from '../layouts/AppLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { LoginPage } from '../pages/LoginPage'

import { NotFound } from '../pages/NotFound'
import { StaffDashboard } from '../pages/StaffDashboard'

export const router = createBrowserRouter([
  { element: <AuthBoundary publicPage />, children: [
    { element: <AuthLayout />, children: [
      { path: '/login', element: <LoginPage /> },
      
    ] },
  ] },
  { element: <AuthBoundary />, children: [
    { path: '/', element: <AppLayout />, children: [
      { index: true, element: <StaffDashboard /> },
      { path: 'dashboard', element: <Navigate replace to="/" /> },
      { path: '*', element: <NotFound /> },
    ] },
  ] },
])
