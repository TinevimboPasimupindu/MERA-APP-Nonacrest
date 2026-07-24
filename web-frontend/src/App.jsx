import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/auth/Login'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      {/* Role-based dashboard routes will be added here once backend roles exist */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App