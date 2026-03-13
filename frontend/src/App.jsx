import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import SessionPage from './pages/SessionPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import EnglishCoachPage from './pages/EnglishCoachPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/session" element={<SessionPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/english-coach" element={<EnglishCoachPage />} />
    </Routes>
  )
}
