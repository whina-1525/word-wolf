import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Logo } from '../components/Logo'
import { ProfileForm } from '../components/ProfileForm'
import { Sheet } from '../components/Sheet'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { call, errorText } from '../lib/api'
import { usingEmulator } from '../lib/firebase'
import { DISCUSS_CHOICES } from '../lib/presets'
import { statsFor, winRate } from '../lib/stats'
import { useFriends } from '../lib/useFriends'

export function Home() {
  const { profile } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { friends, requests } = useFriends(profile?.uid)
  const [mode, setMode] = useState<'create' | 'join' | 'profile' | null>(null)
  const [roomName, setRoomName] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [seconds, setSeconds] = useState(60)
  const [capacity, setCapacity] = useState(6)
  const [busy, setBusy] = useState(false)
  const stats = statsFor(profile?.name ?? '')
  const rate = winRate(stats)
  const wins = stats.citizenWins + stats.wolfWins

  const rooms = useMemo(() => {
    const seen = new Set<string>()
    return friends.flatMap((friend) => {
      if (!friend.room || seen.has(friend.room.roomId)) return []
      seen.add(friend.room.roomId)
      const people = friends.filter((item) => item.room?.roomId === friend.room?.roomId)
      return [{ ...friend.room, people }]
    })
  }, [friends])

  const submitCreate = async () => {
    setBusy(true)
    try {
      const result = await call<{ roomId: string }>('createRoom', {
        name: roomName,
        passphrase,
        discussSeconds: seconds,
        capacity,
      })
      navigate(`/room/${result.roomId}`)
    } catch (error) {
      toast(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const submitJoin = async () => {
    setBusy(true)
    try {
      const result = await call<{ roomId: string }>('joinByPassphrase', { passphrase })
      navigate(`/room/${result.roomId}`)
    } catch (error) {
      toast(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const askJoin = async (roomId: string) => {
    try {
      await call('requestJoin', { roomId })
      toast('参加を申請しました')
    } catch (error) {
      toast(errorText(error))
    }
  }

  if (!profile) return null

  return (
    <main className="screen">
      <div className="screen-inner">
        <header className="topbar">
          <button type="button" className="identity" onClick={() => setMode('profile')}>
            <Avatar {...profile} size={48} />
            <span>
              <small>なまえ</small>
              <strong>{profile.name}</strong>
            </span>
          </button>
          <Link className="btn tiny" to="/friends">
            フレンド{requests.length > 0 ? ` ${requests.length}` : ''}
          </Link>
        </header>
        <section className="hero">
          <Logo size={56} />
          <div>
            <p className="kicker">家族ではなす</p>
            <h1>ワードウルフ</h1>
          </div>
        </section>
        <section className="stats">
          <div>
            <strong>{rate == null ? '—' : `${rate}%`}</strong>
            <span>勝率</span>
          </div>
          <div>
            <strong>{wins}</strong>
            <span>勝った回数</span>
          </div>
          <div>
            <strong>{stats.games}</strong>
            <span>試合</span>
          </div>
          <p>
            市民の勝ち {stats.citizenWins}　ウルフの勝ち {stats.wolfWins}
          </p>
        </section>
        <button type="button" className="btn primary" onClick={() => setMode('create')}>
          部屋をつくる
        </button>
        <button type="button" className="btn ghost" onClick={() => setMode('join')}>
          合言葉で入る
        </button>
        <section className="stack">
          <h2>フレンドの部屋</h2>
          {rooms.length === 0 ? <p className="hint">開いている部屋はまだありません</p> : null}
          {rooms.map((room) => (
            <article key={room.roomId} className="room-card">
              <div className="people">
                {room.people.map((person) => (
                  <Avatar key={person.uid} {...person} size={36} />
                ))}
                <div>
                  <strong>{room.status === 'lobby' ? room.roomName : 'プレイ中'}</strong>
                  <span>{room.people.map((person) => person.name).join('、')}</span>
                </div>
              </div>
              {room.status === 'lobby' ? (
                <button type="button" className="btn tiny" onClick={() => void askJoin(room.roomId)}>
                  参加を申請
                </button>
              ) : (
                <span className="pill">プレイ中</span>
              )}
            </article>
          ))}
        </section>
        {usingEmulator ? <p className="hint">開発用サーバー</p> : null}
      </div>
      {mode === 'create' ? (
        <Sheet title="部屋をつくる" onClose={() => setMode(null)}>
          <div className="stack">
            <label className="field">
              <span>部屋の名前</span>
              <input value={roomName} maxLength={20} onChange={(event) => setRoomName(event.target.value)} placeholder="リビング" />
            </label>
            <label className="field">
              <span>合言葉</span>
              <input value={passphrase} maxLength={20} onChange={(event) => setPassphrase(event.target.value)} placeholder="家族だけが知る言葉" />
            </label>
            <div className="field">
              <span>投票までの時間</span>
              <div className="chips">
                {DISCUSS_CHOICES.map((choice) => (
                  <button
                    key={choice.seconds}
                    type="button"
                    className={`chip ${seconds === choice.seconds ? 'selected' : ''}`}
                    onClick={() => setSeconds(choice.seconds)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>定員</span>
              <div className="chips">
                {[3, 4, 5, 6].map((count) => (
                  <button key={count} type="button" className={`chip ${capacity === count ? 'selected' : ''}`} onClick={() => setCapacity(count)}>
                    {count}人
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void submitCreate()}>
              {busy ? 'つくっています' : 'この部屋をつくる'}
            </button>
          </div>
        </Sheet>
      ) : null}
      {mode === 'join' ? (
        <Sheet title="合言葉で入る" onClose={() => setMode(null)}>
          <div className="stack">
            <label className="field">
              <span>合言葉</span>
              <input value={passphrase} maxLength={20} onChange={(event) => setPassphrase(event.target.value)} />
            </label>
            <p className="hint">入ってから、部屋の名前が見えます。</p>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void submitJoin()}>
              {busy ? '入っています' : '入る'}
            </button>
          </div>
        </Sheet>
      ) : null}
      {mode === 'profile' ? (
        <Sheet title="プロフィール" onClose={() => setMode(null)}>
          <ProfileForm submitLabel="かえる" onDone={() => setMode(null)} />
        </Sheet>
      ) : null}
    </main>
  )
}
