import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { call } from '../lib/api'
import { useRoom } from '../lib/useRoom'
import { Lobby } from './Lobby'
import { Play } from './Play'
import { Result } from './Result'

export function RoomPage() {
  const { roomId = '' } = useParams()
  const { profile, clearRoomLocal } = useAuth()
  const navigate = useNavigate()
  const model = useRoom(roomId, profile?.uid)
  const hostAway = model.room ? model.presence[model.room.hostUid] : undefined

  useEffect(() => {
    if (!model.room || !profile || model.room.hostUid === profile.uid) return
    if (!hostAway || hostAway.state === 'online') return
    const tick = () => {
      void call('transferHost', { roomId }).catch(() => undefined)
    }
    tick()
    const id = window.setInterval(tick, 15000)
    return () => window.clearInterval(id)
  }, [model.room, profile, hostAway?.state, hostAway?.at, roomId])

  useEffect(() => {
    if (model.phase !== 'missing' && model.phase !== 'denied') return
    let live = true
    void call('leaveRoom', { roomId })
      .catch(() => undefined)
      .finally(() => {
        if (!live) return
        clearRoomLocal()
        navigate('/', { replace: true })
      })
    return () => {
      live = false
    }
  }, [model.phase, roomId, clearRoomLocal, navigate])

  if (!profile || model.phase === 'loading') {
    return (
      <main className="screen">
        <p className="hint center-note">部屋をひらいています</p>
      </main>
    )
  }
  if (!model.room || model.phase !== 'ready') {
    return (
      <main className="screen">
        <p className="hint center-note">部屋を出ています</p>
      </main>
    )
  }

  const shared = {
    roomId,
    room: model.room,
    players: model.players,
    me: profile.uid,
    hand: model.hand,
    messages: model.messages,
    vote: model.vote,
    pairs: model.pairs,
    joins: model.joins,
    presence: model.presence,
  }

  return (
    <main className="screen">
      <div className="screen-inner">
        {model.room.phase === 'lobby' ? <Lobby {...shared} /> : null}
        {model.room.phase === 'result' ? <Result {...shared} /> : null}
        {model.room.phase !== 'lobby' && model.room.phase !== 'result' ? <Play {...shared} /> : null}
      </div>
    </main>
  )
}
