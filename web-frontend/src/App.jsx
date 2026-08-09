import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/Toast'
import ProtectedRoute from './components/ProtectedRoute'
import AmbulanceAdminLayout from './layouts/AmbulanceAdminLayout'
import HospitalAdminLayout from './layouts/HospitalAdminLayout'
import MeraAdminLayout from './layouts/MeraAdminLayout'
import Login from './pages/auth/Login'
import TermsAndConditions from './pages/auth/TermsAndConditions'
import Dashboard from './pages/hospital-admin/Dashboard'
import VerificationQueue from './pages/hospital-admin/VerificationQueue'
import VerificationReview from './pages/hospital-admin/VerificationReview'
import IncomingAmbulances from './pages/hospital-admin/IncomingAmbulances'
import IncidentDetail from './pages/hospital-admin/IncidentDetail'
import Patients from './pages/hospital-admin/Patients'
import UpdatePatientRecords from './pages/hospital-admin/UpdatePatientRecords'
import AmbulanceDashboard from './pages/ambulance-admin/Dashboard'
import EmtManagement from './pages/ambulance-admin/EmtManagement'
import MeraDashboard from './pages/mera-admin/Dashboard'
import Institutions from './pages/mera-admin/Institutions'
import Users from './pages/mera-admin/Users'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/terms-and-conditions" element={<TermsAndConditions />} />

          <Route
            path="/hospital-admin"
            element={
              <ProtectedRoute role="hospital_admin">
                <HospitalAdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="verification-queue" element={<VerificationQueue />} />
            <Route path="verification-queue/:id" element={<VerificationReview />} />
            <Route path="incoming" element={<IncomingAmbulances />} />
            <Route path="incoming/:id" element={<IncidentDetail />} />
            <Route path="patients" element={<Patients />} />
            <Route path="patients/:patientId" element={<UpdatePatientRecords />} />
          </Route>

          <Route
            path="/ambulance-admin"
            element={
              <ProtectedRoute role="ambulance_admin">
                <AmbulanceAdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AmbulanceDashboard />} />
            <Route path="emts" element={<EmtManagement />} />
          </Route>

          <Route
            path="/mera-admin"
            element={
              <ProtectedRoute role="mera_admin">
                <MeraAdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<MeraDashboard />} />
            <Route path="institutions" element={<Institutions />} />
            <Route path="users" element={<Users />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App