import { collection, doc, getDoc, onSnapshot, query, where, type DocumentData } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { listenPresence, listenStatus } from '../lib/presence'
import type { IconType } from '../lib/types'

export type FriendCard = {
  uid: string
  name: string
  iconType: IconType
  iconId: string
  photoURL: string | null
  online: boolean
  room: { roomId: string; roomName: string; status: 'lobby' | 'playing' } | null
}

export type FriendRequestCard = FriendCard & { requestId: string }

function iconType(value: unknown): IconType {
  return value === 'photo' ? 'photo' : 'preset'
}

export function useFriends(uid: string | undefined) {
  const [ids, setIds] = useState<string[]>([])
  const [profiles, setProfiles] = useState<Record<string, Omit<FriendCard, 'online' | 'room' | 'uid'>>>({})
  const [online, setOnline] = useState<Record<string, boolean>>({})
  const [rooms, setRooms] = useState<Record<string, FriendCard['room']>>({})
  const [requests, setRequests] = useState<FriendRequestCard[]>([])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(collection(db, `users/${uid}/friends`), (snap) => {
      setIds(snap.docs.map((item) => item.id))
    })
  }, [uid])

  useEffect(() => {
    const stops = ids.flatMap((id) => [
      onSnapshot(doc(db, 'users', id), (snap) => {
        const data = snap.data()
        if (!data) return
        setProfiles((current) => ({
          ...current,
          [id]: {
            name: String(data.name ?? 'ななし'),
            iconType: iconType(data.iconType),
            iconId: String(data.iconId ?? 'panda'),
            photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
          },
        }))
      }),
      listenStatus(id, (isOnline) => setOnline((current) => ({ ...current, [id]: isOnline }))),
      onSnapshot(
        doc(db, `users/${id}/share/room`),
        (snap) => {
          const data = snap.data() as DocumentData | undefined
          setRooms((current) => ({
            ...current,
            [id]:
              snap.exists() && data && (data.status === 'lobby' || data.status === 'playing')
                ? { roomId: String(data.roomId), roomName: String(data.roomName ?? ''), status: data.status }
                : null,
          }))
        },
        () => setRooms((current) => ({ ...current, [id]: null })),
      ),
    ])
    return () => stops.forEach((stop) => stop())
  }, [ids.join('|')])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(query(collection(db, 'friendRequests'), where('toUid', '==', uid), where('status', '==', 'pending')), (snap) => {
      void Promise.all(
        snap.docs.map(async (item) => {
          const fromUid = String(item.data().fromUid)
          const userSnap = await getDoc(doc(db, 'users', fromUid))
          const data = userSnap.data()
          return {
            requestId: item.id,
            uid: fromUid,
            name: String(data?.name ?? 'ななし'),
            iconType: iconType(data?.iconType),
            iconId: String(data?.iconId ?? 'panda'),
            photoURL: typeof data?.photoURL === 'string' ? data.photoURL : null,
            online: false,
            room: null,
          } satisfies FriendRequestCard
        }),
      ).then(setRequests)
    })
  }, [uid])

  const friends: FriendCard[] = ids
    .filter((id) => profiles[id])
    .map((id) => ({
      uid: id,
      ...profiles[id],
      online: online[id] === true,
      room: rooms[id] ?? null,
    }))

  return { friends, requests }
}

export function listenRoomPresence(roomId: string, playerIds: string[], onChange: (uid: string, presence: { state: 'online' | 'offline'; at: number }) => void) {
  return playerIds.map((id) => listenPresence(`roomPresence/${roomId}/${id}`, (presence) => onChange(id, presence)))
}
