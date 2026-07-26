import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import HospitalAdminLayout from './layouts/HospitalAdminLayout';

import Login from './pages/auth/Login';
import Dashboard from './pages/hospital-admin/Dashboard';
import VerificationQueue from './pages/hospital-admin/VerificationQueue';
import VerificationReview from './pages/hospital-admin/VerificationReview';
import UpdatePatientRecords from './pages/hospital-admin/UpdatePatientRecords';
import IncomingAmbulances from './pages/hospital-admin/IncomingAmbulances';
import IncidentDetail from './pages/hospital-admin/IncidentDetail';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

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
            <Route path="patients/:patientId" element={<UpdatePatientRecords />} />
            <Route path="incoming" element={<IncomingAmbulances />} />
            <Route path="incoming/:id" element={<IncidentDetail />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
