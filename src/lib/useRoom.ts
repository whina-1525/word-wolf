import { collection, doc, limit, onSnapshot, orderBy, query, type DocumentData } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { listenPresence, watchRoomPresence } from '../lib/presence'
import {
  EMPTY_VOTE,
  type ChatMessage,
  type CustomPair,
  type IconType,
  type JoinRequest,
  type PlayerDoc,
  type Presence,
  type RoomDoc,
  type VoteDoc,
} from '../lib/types'

function iconType(value: unknown): IconType {
  return value === 'photo' ? 'photo' : 'preset'
}

function mapRoom(data: DocumentData): RoomDoc {
  return {
    name: String(data.name ?? ''),
    hostUid: String(data.hostUid ?? ''),
    capacity: Number(data.capacity ?? 6),
    discussSeconds: Number(data.discussSeconds ?? 60),
    status: data.status === 'playing' || data.status === 'result' ? data.status : 'lobby',
    phase: ['lobby', 'discuss', 'vote', 'elimination', 'result'].includes(data.phase) ? data.phase : 'lobby',
    round: Number(data.round ?? 0),
    voteRound: Number(data.voteRound ?? 0),
    tie: data.tie === true,
    fallen: Array.isArray(data.fallen) ? data.fallen : [],
    gameId: Number(data.gameId ?? 0),
    playerUids: Array.isArray(data.playerUids) ? data.playerUids.map(String) : [],
    passphrase: typeof data.passphrase === 'string' ? data.passphrase : undefined,
    discussEndsAt: data.discussEndsAt,
    advanceAt: data.advanceAt,
    reveal: data.reveal,
  }
}

function mapPlayer(id: string, data: DocumentData): PlayerDoc {
  return {
    uid: id,
    name: String(data.name ?? 'ななし'),
    iconType: iconType(data.iconType),
    iconId: String(data.iconId ?? 'panda'),
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
    alive: data.alive !== false,
    joinedAt: data.joinedAt,
  }
}

function mapVote(data: DocumentData): VoteDoc {
  return {
    submitted: Array.isArray(data.submitted) ? data.submitted.map(String) : [],
    skipped: Array.isArray(data.skipped) ? data.skipped.map(String) : [],
    revealed: data.revealed === true,
    arrows: Array.isArray(data.arrows) ? data.arrows : [],
    counts: data.counts && typeof data.counts === 'object' ? data.counts : {},
    eliminatedUid: typeof data.eliminatedUid === 'string' ? data.eliminatedUid : null,
  }
}

export function useRoom(roomId: string | undefined, uid: string | undefined) {
  const [room, setRoom] = useState<RoomDoc | null>(null)
  const [players, setPlayers] = useState<PlayerDoc[]>([])
  const [hand, setHand] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [vote, setVote] = useState<VoteDoc>(EMPTY_VOTE)
  const [pairs, setPairs] = useState<CustomPair[]>([])
  const [joins, setJoins] = useState<JoinRequest[]>([])
  const [presence, setPresence] = useState<Record<string, Presence>>({})
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing' | 'denied'>('loading')

  useEffect(() => {
    if (!roomId || !uid) return
    setPhase('loading')
    const stops = [
      onSnapshot(
        doc(db, 'rooms', roomId),
        (snap) => {
          if (!snap.exists()) {
            setRoom(null)
            setPhase('missing')
            return
          }
          setRoom(mapRoom(snap.data()))
          setPhase('ready')
        },
        () => setPhase('denied'),
      ),
      onSnapshot(query(collection(db, `rooms/${roomId}/players`), orderBy('joinedAt', 'asc')), (snap) => {
        setPlayers(snap.docs.map((item) => mapPlayer(item.id, item.data())))
      }),
      onSnapshot(doc(db, `rooms/${roomId}/hands/${uid}`), (snap) => {
        setHand(snap.exists() ? String(snap.data().word ?? '') : null)
      }),
      onSnapshot(query(collection(db, `rooms/${roomId}/messages`), orderBy('createdAt', 'asc'), limit(200)), (snap) => {
        setMessages(
          snap.docs.map((item) => {
            const data = item.data()
            return {
              id: item.id,
              uid: String(data.uid ?? ''),
              name: String(data.name ?? ''),
              iconType: iconType(data.iconType),
              iconId: String(data.iconId ?? 'panda'),
              photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
              text: String(data.text ?? ''),
            }
          }),
        )
      }),
      onSnapshot(doc(db, `rooms/${roomId}/voteState/current`), (snap) => {
        setVote(snap.exists() ? mapVote(snap.data()) : EMPTY_VOTE)
      }),
      onSnapshot(collection(db, `rooms/${roomId}/joinRequests`), (snap) => {
        setJoins(
          snap.docs
            .filter((item) => item.data().status === 'pending')
            .map((item) => {
              const data = item.data()
              return {
                uid: item.id,
                name: String(data.name ?? ''),
                iconType: iconType(data.iconType),
                iconId: String(data.iconId ?? 'panda'),
                photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
                status: String(data.status ?? ''),
              }
            }),
        )
      }),
    ]
    return () => stops.forEach((stop) => stop())
  }, [roomId, uid])

  useEffect(() => {
    if (!roomId || room?.status !== 'lobby') {
      setPairs([])
      return
    }
    return onSnapshot(
      collection(db, `rooms/${roomId}/pairBank`),
      (snap) => {
        setPairs(snap.docs.map((item) => ({ id: item.id, a: String(item.data().a ?? ''), b: String(item.data().b ?? '') })))
      },
      () => setPairs([]),
    )
  }, [roomId, room?.status])

  const playerKey = players.map((player) => player.uid).join('|')
  useEffect(() => {
    if (!roomId || !playerKey) return
    const stops = playerKey.split('|').map((id) =>
      listenPresence(`roomPresence/${roomId}/${id}`, (next) => {
        setPresence((current) => ({ ...current, [id]: next }))
      }),
    )
    return () => stops.forEach((stop) => stop())
  }, [roomId, playerKey])

  useEffect(() => {
    if (!roomId || !uid) return
    let stop = () => {}
    let alive = true
    void watchRoomPresence(roomId, uid).then((cleanup) => {
      if (alive) stop = cleanup
      else cleanup()
    })
    return () => {
      alive = false
      stop()
    }
  }, [roomId, uid])

  return { phase, room, players, hand, messages, vote, pairs, joins, presence }
}
