import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { MemoryGame } from '../components/MemoryGame'
import { ProfileForm } from '../components/ProfileForm'
import { Sheet } from '../components/Sheet'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { call, errorText } from '../lib/api'
import { discussLabel } from '../lib/presets'
import type { JoinRequest, PlayerDoc, Presence, RoomDoc, CustomPair } from '../lib/types'

export function Lobby({
  roomId,
  room,
  players,
  pairs,
  joins,
  presence,
}: {
  roomId: string
  room: RoomDoc
  players: PlayerDoc[]
  pairs: CustomPair[]
  joins: JoinRequest[]
  presence: Record<string, Presence>
}) {
  const { profile, clearRoomLocal } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [wordA, setWordA] = useState('')
  const [wordB, setWordB] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const host = profile?.uid === room.hostUid
  const shortfall = Math.max(0, 3 - players.length)

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

  const start = async () => {
    setBusy(true)
    try {
      await call('startGame', { roomId })
      setConfirm(false)
    } catch (error) {
      toast(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const addPair = async () => {
    try {
      await call('addPair', { roomId, a: wordA, b: wordB })
      setWordA('')
      setWordB('')
    } catch (error) {
      toast(errorText(error))
    }
  }

  return (
    <div className="stack grow">
      <header className="topbar">
        <div>
          <p className="kicker">部屋</p>
          <h1>{room.name}</h1>
        </div>
        <button type="button" className="text-btn" disabled={busy} onClick={() => void leave()}>
          出る
        </button>
      </header>
      <button type="button" className="identity" onClick={() => setEditing(true)}>
        {profile ? <Avatar {...profile} size={44} /> : null}
        <span>
          <small>あなたのなまえ</small>
          <strong>{profile?.name}</strong>
        </span>
      </button>
      <section className="info-grid">
        <div>
          <span>合言葉</span>
          <strong>{room.passphrase ?? '—'}</strong>
        </div>
        <div>
          <span>話す時間</span>
          <strong>{discussLabel(room.discussSeconds)}</strong>
        </div>
        <div>
          <span>人数</span>
          <strong>
            {players.length}/{room.capacity}
          </strong>
        </div>
      </section>
      <section className="stack">
        <h2>この部屋の人</h2>
        {players.map((player) => (
          <article key={player.uid} className="person-row">
            <span className={`dot ${presence[player.uid]?.state === 'online' ? 'on' : ''}`} />
            <Avatar {...player} size={48} />
            <div>
              <strong>{player.name}</strong>
              <span>{player.uid === room.hostUid ? 'ホスト' : presence[player.uid]?.state === 'online' ? 'オンライン' : '離席'}</span>
            </div>
          </article>
        ))}
      </section>
      {host && joins.length > 0 ? (
        <section className="stack">
          <h2>参加の申請</h2>
          {joins.map((request) => (
            <article key={request.uid} className="person-row">
              <Avatar {...request} size={44} />
              <strong>{request.name}</strong>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn tiny"
                  onClick={() => void call('respondJoin', { roomId, uid: request.uid, accept: true }).catch((error) => toast(errorText(error)))}
                >
                  承認
                </button>
                <button
                  type="button"
                  className="btn tiny ghost"
                  onClick={() => void call('respondJoin', { roomId, uid: request.uid, accept: false }).catch((error) => toast(errorText(error)))}
                >
                  拒否
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {host ? (
        <section className="stack">
          <h2>この部屋のお題</h2>
          <div className="pair-form">
            <input value={wordA} maxLength={16} placeholder="言葉A" onChange={(event) => setWordA(event.target.value)} />
            <input value={wordB} maxLength={16} placeholder="言葉B" onChange={(event) => setWordB(event.target.value)} />
            <button type="button" className="btn tiny" onClick={() => void addPair()}>
              追加
            </button>
          </div>
          {pairs.map((pair) => (
            <div key={pair.id} className="pair-row">
              <span>
                {pair.a} / {pair.b}
              </span>
              <button type="button" className="text-btn" onClick={() => void call('removePair', { roomId, pairId: pair.id }).catch((error) => toast(errorText(error)))}>
                消す
              </button>
            </div>
          ))}
          {pairs.length === 0 ? <p className="hint">用意した100組に、この部屋だけの組を足せます。</p> : null}
        </section>
      ) : null}
      <MemoryGame />
      <div className="dock">
        {host ? (
          <button type="button" className="btn primary" disabled={shortfall > 0 || busy} onClick={() => setConfirm(true)}>
            {shortfall > 0 ? `あと${shortfall}人` : 'ゲームを開始'}
          </button>
        ) : (
          <p className="wait-note">ホストの開始を待っています</p>
        )}
      </div>
      {confirm ? (
        <Sheet title="このメンバーではじめる？" onClose={() => setConfirm(false)}>
          <div className="stack">
            <p>{players.map((player) => player.name).join('、')}</p>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void start()}>
              {busy ? '配っています' : '開始する'}
            </button>
          </div>
        </Sheet>
      ) : null}
      {editing ? (
        <Sheet title="プロフィール" onClose={() => setEditing(false)}>
          <ProfileForm submitLabel="かえる" onDone={() => setEditing(false)} />
        </Sheet>
      ) : null}
    </div>
  )
}
