import { FieldValue } from 'firebase-admin/firestore'
import { db } from './admin'

export async function publishShare(
  uids: string[],
  room: { id: string; name: string; status: 'lobby' | 'playing' } | null,
) {
  const unique = [...new Set(uids)]
  if (unique.length === 0) return
  const batch = db.batch()
  for (const uid of unique) {
    const ref = db.doc(`users/${uid}/share/room`)
    if (!room) batch.delete(ref)
    else batch.set(ref, { roomId: room.id, roomName: room.name, status: room.status })
  }
  await batch.commit()
}

export async function clearRoomPointer(uid: string) {
  await db.doc(`users/${uid}`).set(
    {
      currentRoomId: FieldValue.delete(),
      currentRoomName: FieldValue.delete(),
      currentRoomStatus: FieldValue.delete(),
    },
    { merge: true },
  )
  await publishShare([uid], null)
}

export async function clearCollection(path: string) {
  while (true) {
    const snap = await db.collection(path).limit(400).get()
    if (snap.empty) return
    const batch = db.batch()
    snap.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
    if (snap.size < 400) return
  }
}
