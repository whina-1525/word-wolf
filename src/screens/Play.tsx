import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { TimerRing } from '../components/TimerRing'
import { VoteMap } from '../components/VoteMap'
import { useToast } from '../context/ToastContext'
import { call, errorText } from '../lib/api'
import type { ChatMessage, PlayerDoc, Presence, RoomDoc, VoteDoc } from '../lib/types'
import { millisOf } from '../lib/types'

function useCountdown(endsAt: number | null, active: boolean, onZero: () => void) {
  const [now, setNow] = useState(Date.now())
  const onZeroRef = useRef(onZero)
  onZeroRef.current = onZero
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])
  const remain = !active || endsAt == null ? null : Math.max(0, endsAt - now)
  const wasPositive = useRef(false)
  useEffect(() => {
    if (remain == null) return
    if (remain > 0) {
      wasPositive.current = true
      return
    }
    if (wasPositive.current) navigator.vibrate?.(180)
    wasPositive.current = false
    onZeroRef.current()
    const id = window.setInterval(() => onZeroRef.current(), 1200)
    return () => window.clearInterval(id)
  }, [remain === 0, endsAt])
  return remain
}

export function Play({
  roomId,
  room,
  players,
  me,
  hand,
  messages,
  vote,
  presence,
}: {
  roomId: string
  room: RoomDoc
  players: PlayerDoc[]
  me: string
  hand: string | null
  messages: ChatMessage[]
  vote: VoteDoc
  presence: Record<string, Presence>
}) {
  const toast = useToast()
  const alive = players.filter((player) => player.alive)
  const mePlayer = players.find((player) => player.uid === me)
  const living = mePlayer?.alive === true
  const host = room.hostUid === me
  const discussing = room.phase === 'discuss'
  const eliminating = room.phase === 'elimination'
  const remain = useCountdown(discussing ? millisOf(room.discussEndsAt) : eliminating ? millisOf(room.advanceAt) : null, discussing || eliminating, () => {
    const action = discussing ? 'closeDiscussion' : 'advanceRound'
    void call(action, { roomId }).catch(() => undefined)
  })
  const total = room.tie ? 60000 : eliminating ? 7000 : room.discussSeconds * 1000
  const [text, setText] = useState('')
  const [choice, setChoice] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages.length])

  const cast = async (targetUid: string) => {
    setChoice(targetUid)
    try {
      await call('castVote', { roomId, targetUid })
    } catch (error) {
      setChoice('')
      toast(errorText(error))
    }
  }

  const send = async () => {
    const value = text.trim()
    if (!value) return
    setText('')
    try {
      await call('sendChat', { roomId, text: value })
    } catch (error) {
      setText(value)
      toast(errorText(error))
    }
  }

  const waiting = alive.filter((player) => !vote.submitted.includes(player.uid) && !vote.skipped.includes(player.uid))
  const eliminated = players.find((player) => player.uid === vote.eliminatedUid)

  return (
    <div className="play">
      <header className="topbar">
        <div>
          <p className="kicker">{room.phase === 'vote' ? '投票' : room.tie ? '延長' : `話し合い ${room.round}`}</p>
          <h1>{room.phase === 'vote' ? '投票' : living ? 'あなたの言葉' : '観戦中'}</h1>
        </div>
        {discussing && remain != null ? <TimerRing remainMs={remain} totalMs={total} /> : null}
      </header>
      {room.tie && vote.revealed ? (
        <section className="stack">
          <p className="banner">同票でした。選んだ人を公開して、1分延長します。</p>
          <VoteMap players={alive} arrows={vote.arrows} />
        </section>
      ) : null}
      {discussing ? (
        <section className="word-card">
          <span>{living ? 'この言葉のふりをしよう' : 'あなたに配られた言葉'}</span>
          <strong>{hand || '…'}</strong>
        </section>
      ) : null}
      {room.phase === 'vote' && living ? (
        <section className="stack">
          <h2>自分以外のひとりを選ぶ</h2>
          {alive
            .filter((player) => player.uid !== me)
            .map((player) => (
              <button
                key={player.uid}
                type="button"
                className={`vote-choice ${choice === player.uid ? 'picked' : ''}`}
                disabled={vote.submitted.includes(me) || choice !== ''}
                onClick={() => void cast(player.uid)}
              >
                <Avatar {...player} size={44} />
                <strong>{player.name}</strong>
                {choice === player.uid ? <span>投票した</span> : null}
              </button>
            ))}
        </section>
      ) : null}
      {room.phase === 'vote' ? (
        <section className="stack">
          <h2>まだの人</h2>
          {waiting.length === 0 ? <p className="hint">全員の票がそろうと開票します</p> : null}
          {waiting.map((player) => {
            const info = presence[player.uid]
            const awayLongEnough = info?.state === 'offline' && info.at > 0 && Date.now() - info.at >= 10000
            return (
              <article key={player.uid} className="person-row">
                <Avatar {...player} size={40} />
                <strong>{player.uid === me ? `${player.name}（あなた）` : player.name}</strong>
                {host && player.uid !== me && awayLongEnough ? (
                  <button
                    type="button"
                    className="btn tiny ghost"
                    onClick={() => void call('skipVote', { roomId, targetUid: player.uid }).catch((error) => toast(errorText(error)))}
                  >
                    スキップ
                  </button>
                ) : null}
              </article>
            )
          })}
        </section>
      ) : null}
      {eliminating ? (
        <section className="stack">
          <p className="banner">{eliminated?.name ?? 'だれか'}が追放されました</p>
          <VoteMap players={players} arrows={vote.arrows} />
          {remain != null ? <p className="hint">つぎの話し合いまで {Math.ceil(remain / 1000)}秒</p> : null}
        </section>
      ) : null}
      <section className="chat">
        <div className="chat-log" ref={scroller}>
          {messages.length === 0 ? <p className="hint">会話はここに残ります</p> : null}
          {messages.map((message) => (
            <div key={message.id} className={`bubble ${message.uid === me ? 'mine' : ''}`}>
              <Avatar {...message} size={28} />
              <p>
                <small>{message.name}</small>
                {message.text}
              </p>
            </div>
          ))}
        </div>
        {living ? (
          <form
            className="chat-form"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <input value={text} maxLength={200} placeholder="メッセージ" onChange={(event) => setText(event.target.value)} />
            <button type="submit" className="btn tiny">
              送る
            </button>
          </form>
        ) : (
          <p className="hint">観戦中は見るだけです</p>
        )}
      </section>
    </div>
  )
}
