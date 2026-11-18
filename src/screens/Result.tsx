import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { VoteMap } from '../components/VoteMap'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { call, errorText } from '../lib/api'
import { recordResult } from '../lib/stats'
import type { PlayerDoc, RoomDoc, VoteDoc } from '../lib/types'

export function Result({
  roomId,
  room,
  players,
  me,
  vote,
}: {
  roomId: string
  room: RoomDoc
  players: PlayerDoc[]
  me: string
  vote: VoteDoc
}) {
  const { profile, clearRoomLocal } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const reveal = room.reveal
  const wolf = players.find((player) => player.uid === reveal?.wolfUid)
  const host = room.hostUid === me

  useEffect(() => {
    if (!reveal || !profile) return
    const role = reveal.wolfUid === me ? 'wolf' : 'citizen'
    recordResult(profile.name, `${roomId}:${room.gameId}`, role, reveal.winner === role)
  }, [reveal, profile, me, roomId, room.gameId])

  const leave = async () => {
    setBusy(true)
    try {
      await call('leaveRoom', { roomId })
      clearRoomLocal()
      navigate('/', { replace: true })
    } catch (error) {
      toast(errorText(error))
      setBusy(false)
    }
  }

  const again = async () => {
    setBusy(true)
    try {
      await call('rematch', { roomId })
    } catch (error) {
      toast(errorText(error))
      setBusy(false)
    }
  }

  if (!reveal) return <p className="hint">結果を集計しています</p>

  return (
    <div className="stack">
      <section className={`result-banner ${reveal.winner}`}>
        <p>{reveal.winner === 'citizen' ? '市民の勝ち' : 'ウルフの勝ち'}</p>
        <h1>{reveal.winner === 'citizen' ? 'ウルフを追放した' : 'ウルフと市民が同数になった'}</h1>
        <strong>{reveal.wolfUid === me ? 'あなたはウルフでした' : 'あなたは市民でした'}</strong>
      </section>
      <section className="word-pair">
        <article>
          <span>市民の言葉</span>
          <strong>{reveal.citizenWord}</strong>
        </article>
        <article>
          <span>ウルフの言葉</span>
          <strong>{reveal.wolfWord}</strong>
        </article>
      </section>
      {wolf ? (
        <article className="person-row">
          <Avatar {...wolf} size={52} />
          <div>
            <span>ウルフ</span>
            <strong>{wolf.name}</strong>
          </div>
        </article>
      ) : null}
      {vote.arrows.length > 0 ? <VoteMap players={players} arrows={vote.arrows} /> : null}
      {room.fallen.length > 0 ? (
        <section>
          <h2>追放された人</h2>
          <p>{room.fallen.map((person) => person.name).join(' → ')}</p>
        </section>
      ) : null}
      <div className="dock">
        {host ? (
          <button type="button" className="btn primary" disabled={busy} onClick={() => void again()}>
            もう一回
          </button>
        ) : (
          <p className="wait-note">ホストが次の一戦を始められます</p>
        )}
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void leave()}>
          部屋を出る
        </button>
      </div>
    </div>
  )
}
