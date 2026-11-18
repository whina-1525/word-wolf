import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { call, errorText } from '../lib/api'
import { db } from '../lib/firebase'
import type { IconType } from '../lib/types'
import { useFriends } from '../lib/useFriends'

type Hit = {
  uid: string
  name: string
  iconType: IconType
  iconId: string
  photoURL: string | null
}

export function Friends() {
  const { profile } = useAuth()
  const toast = useToast()
  const { friends, requests } = useFriends(profile?.uid)
  const [text, setText] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)

  const search = async () => {
    const name = text.trim()
    if (!name || !profile) return
    setBusy(true)
    setSearched(true)
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('nameLower', '==', name.toLowerCase()), limit(8)))
      setHits(
        snap.docs
          .filter((item) => item.id !== profile.uid)
          .map((item) => ({
            uid: item.id,
            name: String(item.data().name ?? name),
            iconType: item.data().iconType === 'photo' ? 'photo' : 'preset',
            iconId: String(item.data().iconId ?? 'panda'),
            photoURL: typeof item.data().photoURL === 'string' ? item.data().photoURL : null,
          })),
      )
    } catch (error) {
      toast(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const request = async (uid: string) => {
    try {
      const result = await call<{ accepted?: boolean }>('sendFriendRequest', { toUid: uid })
      toast(result.accepted ? 'フレンドになりました' : '申請を送りました')
    } catch (error) {
      toast(errorText(error))
    }
  }

  const respond = async (requestId: string, accept: boolean) => {
    try {
      await call('respondFriend', { requestId, accept })
    } catch (error) {
      toast(errorText(error))
    }
  }

  const remove = async (uid: string) => {
    try {
      await call('removeFriend', { toUid: uid })
    } catch (error) {
      toast(errorText(error))
    }
  }

  return (
    <main className="screen">
      <div className="screen-inner">
        <header className="topbar">
          <Link className="btn tiny" to="/">
            ホーム
          </Link>
          <h1>フレンド</h1>
        </header>
        <form
          className="search-row"
          onSubmit={(event) => {
            event.preventDefault()
            void search()
          }}
        >
          <input value={text} maxLength={10} placeholder="相手のなまえ" onChange={(event) => setText(event.target.value)} />
          <button type="submit" className="btn tiny" disabled={busy}>
            さがす
          </button>
        </form>
        {searched && !busy && hits.length === 0 ? <p className="hint">そのなまえの人はいません</p> : null}
        {hits.map((hit) => {
          const friend = friends.some((item) => item.uid === hit.uid)
          return (
            <article key={hit.uid} className="person-row">
              <Avatar {...hit} size={48} />
              <strong>{hit.name}</strong>
              {friend ? (
                <span className="pill">フレンド</span>
              ) : (
                <button type="button" className="btn tiny" onClick={() => void request(hit.uid)}>
                  申請する
                </button>
              )}
            </article>
          )
        })}
        {requests.length > 0 ? <h2>届いた申請</h2> : null}
        {requests.map((requestCard) => (
          <article key={requestCard.requestId} className="person-row">
            <Avatar {...requestCard} size={48} />
            <strong>{requestCard.name}</strong>
            <div className="row-actions">
              <button type="button" className="btn tiny" onClick={() => void respond(requestCard.requestId, true)}>
                承認
              </button>
              <button type="button" className="btn tiny ghost" onClick={() => void respond(requestCard.requestId, false)}>
                拒否
              </button>
            </div>
          </article>
        ))}
        <h2>なかま</h2>
        {friends.length === 0 ? <p className="hint">まだフレンドはいません</p> : null}
        {friends.map((friend) => (
          <article key={friend.uid} className="person-row">
            <span className={`dot ${friend.online ? 'on' : ''}`} />
            <Avatar {...friend} size={48} />
            <div>
              <strong>{friend.name}</strong>
              <span>{friend.online ? 'オンライン' : 'オフライン'}</span>
            </div>
            <button type="button" className="text-btn" onClick={() => void remove(friend.uid)}>
              解除
            </button>
          </article>
        ))}
      </div>
    </main>
  )
}
