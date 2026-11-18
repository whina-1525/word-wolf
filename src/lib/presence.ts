import { onDisconnect, onValue, ref, serverTimestamp, set, type Unsubscribe } from 'firebase/database'
import { rtdb } from './firebase'
import type { Presence } from './types'

const watchers = new Map<string, number>()

export function keepOnline(path: string) {
  const node = ref(rtdb, path)
  const id = (watchers.get(path) ?? 0) + 1
  watchers.set(path, id)
  void (async () => {
    await onDisconnect(node).set({ state: 'offline', at: serverTimestamp() })
    if (watchers.get(path) !== id) return
    await set(node, { state: 'online', at: serverTimestamp() })
  })()
  return () => {
    window.setTimeout(() => {
      if (watchers.get(path) !== id) return
      watchers.delete(path)
      void set(node, { state: 'offline', at: serverTimestamp() })
    }, 400)
  }
}

export function watchMyStatus(uid: string) {
  return Promise.resolve(keepOnline(`status/${uid}`))
}

export function watchRoomPresence(roomId: string, uid: string) {
  return Promise.resolve(keepOnline(`roomPresence/${roomId}/${uid}`))
}

export function listenStatus(uid: string, onChange: (online: boolean) => void): Unsubscribe {
  return onValue(ref(rtdb, `status/${uid}`), (snap) => {
    const value = snap.val() as { state?: string } | null
    onChange(value?.state === 'online')
  })
}

export function listenPresence(path: string, onChange: (presence: Presence) => void): Unsubscribe {
  return onValue(ref(rtdb, path), (snap) => {
    const value = snap.val() as { state?: string; at?: number } | null
    onChange({
      state: value?.state === 'online' ? 'online' : 'offline',
      at: typeof value?.at === 'number' ? value.at : 0,
    })
  })
}
