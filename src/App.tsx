import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Friends } from './screens/Friends'
import { Home } from './screens/Home'
import { Onboarding } from './screens/Onboarding'
import { RoomPage } from './screens/Room'
import { Logo } from './components/Logo'

function Splash({ message }: { message?: string }) {
  return (
    <main className="screen splash">
      <Logo />
      <p>{message || 'ワードウルフ'}</p>
    </main>
  )
}

function Gate() {
  const { user, profile, loading, authError } = useAuth()
  const location = useLocation()
  if (authError) return <Splash message="サーバーに接続できません。エミュレータが起動しているか確認してください。" />
  if (loading || !user) return <Splash />
  if (profile?.currentRoomId && !location.pathname.startsWith(`/room/${profile.currentRoomId}`)) {
    return <Navigate to={`/room/${profile.currentRoomId}`} replace />
  }
  return (
    <Routes>
      <Route path="/start" element={profile ? <Navigate to="/" replace /> : <Onboarding />} />
      <Route path="/" element={profile ? <Home /> : <Navigate to="/start" replace />} />
      <Route path="/friends" element={profile ? <Friends /> : <Navigate to="/start" replace />} />
      <Route path="/room/:roomId" element={profile ? <RoomPage /> : <Navigate to="/start" replace />} />
      <Route path="*" element={<Navigate to="/" replace /> } />
    </Routes>
  )
}

export function App() {
  return <Gate />
}
