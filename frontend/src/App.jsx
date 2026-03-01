import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import SessionPage from './pages/SessionPage'
import DashboardPage from './pages/DashboardPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/session" element={<SessionPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
    </Routes>
  )
}
