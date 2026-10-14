import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AuthBoundary } from '../components/AuthBoundary'
import { AppLayout } from '../layouts/AppLayout'
import { AuthLayout } from '../layouts/AuthLayout'
import { LoginPage } from '../pages/LoginPage'
import { RegisterPage } from '../pages/RegisterPage'
import { NotFound } from '../pages/NotFound'
import { PatientDashboard } from '../pages/PatientDashboard'

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
      { path: '*', element: <NotFound /> },
    ] },
  ] },
])
