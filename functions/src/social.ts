import { FieldValue } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { db } from './admin'
import { callableOptions, dataOf, invalid, readDocId, requireUid } from './call'
import { onCall } from 'firebase-functions/v2/https'
import { assertPreset } from './presets'
import { cleanName } from './logic'

function readRequestId(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{8,40}_[A-Za-z0-9]{8,40}$/.test(value)) {
    throw new HttpsError('invalid-argument', '申請が不正です')
  }
  return value
}

function validPhoto(url: string, uid: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    return decodeURIComponent(`${parsed.pathname}${parsed.search}`).includes(`icons/${uid}/`)
  } catch {
    return false
  }
}

export const saveProfile = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const data = dataOf(req)
  let name = ''
  try {
    name = cleanName(data.name)
  } catch (error) {
    invalid(error)
  }
  const iconType = data.iconType === 'photo' ? 'photo' : 'preset'
  let iconId = 'panda'
  let photoURL: string | null = null
  if (iconType === 'photo') {
    if (typeof data.photoURL !== 'string' || !validPhoto(data.photoURL, me)) {
      throw new HttpsError('invalid-argument', '写真をもう一度選んでください')
    }
    photoURL = data.photoURL
    iconId = 'photo'
  } else {
    try {
      iconId = assertPreset(data.iconId)
    } catch (error) {
      invalid(error)
    }
  }

  const userRef = db.doc(`users/${me}`)
  await userRef.set(
    {
      name,
      nameLower: name.toLowerCase(),
      iconType,
      iconId,
      photoURL,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  const user = await userRef.get()
  const roomId = user.get('currentRoomId')
  if (typeof roomId === 'string' && roomId) {
    const playerRef = db.doc(`rooms/${roomId}/players/${me}`)
    const player = await playerRef.get()
    if (player.exists) await playerRef.update({ name, iconType, iconId, photoURL })
  }
  return { ok: true }
})

export const sendFriendRequest = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const target = readDocId(dataOf(req).toUid, '相手')
  if (target === me) throw new HttpsError('invalid-argument', '自分は追加できません')
  const targetUser = await db.doc(`users/${target}`).get()
  if (!targetUser.exists || !targetUser.get('name')) {
    throw new HttpsError('not-found', 'そのなまえの人はいません')
  }
  const already = await db.doc(`users/${me}/friends/${target}`).get()
  if (already.exists) throw new HttpsError('already-exists', 'すでにフレンドです')

  const outgoingRef = db.doc(`friendRequests/${me}_${target}`)
  const incomingRef = db.doc(`friendRequests/${target}_${me}`)
  const outgoing = await outgoingRef.get()
  if (outgoing.exists && outgoing.get('status') === 'pending') {
    throw new HttpsError('already-exists', '申請済みです')
  }
  const incoming = await incomingRef.get()
  if (incoming.exists && incoming.get('status') === 'pending') {
    await acceptFriend(target, me, incomingRef)
    return { ok: true, accepted: true }
  }
  await outgoingRef.set({
    fromUid: me,
    toUid: target,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  })
  return { ok: true, accepted: false }
})

export const respondFriend = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const data = dataOf(req)
  const requestId = readRequestId(data.requestId)
  const accept = data.accept === true
  const requestRef = db.doc(`friendRequests/${requestId}`)
  const request = await requestRef.get()
  if (!request.exists) throw new HttpsError('not-found', '申請がありません')
  if (request.get('toUid') !== me) throw new HttpsError('permission-denied', 'この申請には答えられません')
  if (request.get('status') !== 'pending') return { ok: true }
  if (!accept) {
    await requestRef.update({ status: 'rejected' })
    return { ok: true }
  }
  await acceptFriend(String(request.get('fromUid')), me, requestRef)
  return { ok: true }
})

export const removeFriend = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const target = readDocId(dataOf(req).toUid, '相手')
  const batch = db.batch()
  batch.delete(db.doc(`users/${me}/friends/${target}`))
  batch.delete(db.doc(`users/${target}/friends/${me}`))
  await batch.commit()
  return { ok: true }
})

async function acceptFriend(fromUid: string, toUid: string, requestRef: FirebaseFirestore.DocumentReference) {
  const batch = db.batch()
  const now = FieldValue.serverTimestamp()
  batch.set(db.doc(`users/${fromUid}/friends/${toUid}`), { uid: toUid, since: now })
  batch.set(db.doc(`users/${toUid}/friends/${fromUid}`), { uid: fromUid, since: now })
  batch.update(requestRef, { status: 'accepted' })
  await batch.commit()
}
