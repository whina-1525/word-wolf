import { randomInt } from 'crypto'
import { FieldValue, Timestamp, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { db, rng, rtdb, sha256 } from './admin'
import { callableOptions, dataOf, invalid, readDocId, requireUid } from './call'
import {
  ELIMINATION_PAUSE_MS,
  HOST_TRANSFER_GRACE_MS,
  MAX_CUSTOM_PAIRS,
  RECENT_PAIR_LIMIT,
  SKIP_GRACE_MS,
  TIE_EXTEND_SECONDS,
  assertCapacity,
  assertDiscussSeconds,
  assignWords,
  cleanChat,
  cleanPassphrase,
  cleanRoomName,
  cleanWord,
  offlineLongEnough,
  pickPair,
  resolveVotes,
  type Arrow,
} from './logic'
import { PAIRS, type Pair } from './pairs'
import { clearCollection, publishShare } from './share'

type Profile = {
  name: string
  iconType: 'preset' | 'photo'
  iconId: string
  photoURL: string | null
}

type Fallen = { uid: string; name: string; round: number }

function emptyVote() {
  return {
    submitted: [] as string[],
    skipped: [] as string[],
    revealed: false,
    arrows: [] as Arrow[],
    counts: {} as Record<string, number>,
    eliminatedUid: null as string | null,
  }
}

function millisOf(value: unknown) {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

function asPairs(value: unknown): Pair[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const pair = item as { id?: unknown; a?: unknown; b?: unknown }
    if (typeof pair.id !== 'string' || typeof pair.a !== 'string' || typeof pair.b !== 'string') return []
    return [{ id: pair.id, a: pair.a, b: pair.b }]
  })
}

function asFallen(value: unknown): Fallen[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as { uid?: unknown; name?: unknown; round?: unknown }
    if (typeof row.uid !== 'string') return []
    return [{ uid: row.uid, name: typeof row.name === 'string' ? row.name : '?', round: Number(row.round ?? 0) }]
  })
}

function asStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function profileOf(user: DocumentSnapshot): Profile {
  return {
    name: String(user.get('name') ?? ''),
    iconType: user.get('iconType') === 'photo' ? 'photo' : 'preset',
    iconId: String(user.get('iconId') ?? 'panda'),
    photoURL: typeof user.get('photoURL') === 'string' ? user.get('photoURL') : null,
  }
}

async function ensureFree(uid: string) {
  const user = await db.doc(`users/${uid}`).get()
  if (!user.exists || !user.get('name')) {
    throw new HttpsError('failed-precondition', 'なまえを決めてから入室してください')
  }
  const current = user.get('currentRoomId')
  if (typeof current === 'string' && current) {
    const room = await db.doc(`rooms/${current}`).get()
    if (room.exists) throw new HttpsError('failed-precondition', 'いまの部屋から出てください')
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
  return user
}

async function presenceOf(roomId: string, uid: string) {
  const snap = await rtdb.ref(`roomPresence/${roomId}/${uid}`).get()
  if (!snap.exists()) return { state: 'offline', at: 0 }
  const value = snap.val() as { state?: string; at?: number } | null
  return {
    state: value?.state === 'online' ? 'online' : 'offline',
    at: typeof value?.at === 'number' ? value.at : 0,
  }
}

async function addMember(roomId: string, uid: string, profile: Profile) {
  const roomRef = db.doc(`rooms/${roomId}`)
  const roomName = await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef)
    if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
    if (roomSnap.get('phase') !== 'lobby' || roomSnap.get('status') !== 'lobby') {
      throw new HttpsError('failed-precondition', 'この部屋は募集をしめきりました')
    }
    const playerUids = asStrings(roomSnap.get('playerUids'))
    if (playerUids.includes(uid)) throw new HttpsError('already-exists', 'すでに入っています')
    if (playerUids.length >= Number(roomSnap.get('capacity') ?? 0)) {
      throw new HttpsError('failed-precondition', '部屋がいっぱいです')
    }
    const userSnap = await tx.get(db.doc(`users/${uid}`))
    const playerSnap = await tx.get(db.doc(`rooms/${roomId}/players/${uid}`))
    const current = userSnap.get('currentRoomId')
    if (playerSnap.exists) throw new HttpsError('already-exists', 'すでに入っています')
    if (typeof current === 'string' && current && current !== roomId) {
      throw new HttpsError('failed-precondition', 'いまの部屋から出てください')
    }
    tx.set(db.doc(`rooms/${roomId}/players/${uid}`), {
      uid,
      ...profile,
      alive: true,
      joinedAt: FieldValue.serverTimestamp(),
    })
    tx.update(roomRef, { playerUids: [...playerUids, uid] })
    tx.set(
      db.doc(`users/${uid}`),
      {
        currentRoomId: roomId,
        currentRoomName: String(roomSnap.get('name') ?? ''),
        currentRoomStatus: 'lobby',
      },
      { merge: true },
    )
    return String(roomSnap.get('name') ?? '')
  })
  await publishShare([uid], { id: roomId, name: roomName, status: 'lobby' })
  return roomName
}

function settleVotes(
  tx: Transaction,
  roomId: string,
  roomSnap: DocumentSnapshot,
  aliveSnaps: DocumentSnapshot[],
  ballotMap: Map<string, string>,
  skipped: string[],
  secretSnap: DocumentSnapshot,
) {
  const roomRef = db.doc(`rooms/${roomId}`)
  const voteRef = db.doc(`rooms/${roomId}/voteState/current`)
  const aliveUids = aliveSnaps.map((snap) => snap.id)
  const ballots = [...ballotMap.entries()].map(([from, to]) => ({ from, to }))
  if (!secretSnap.exists) throw new HttpsError('failed-precondition', 'お題がまだ配られていません')
  const wolfUid = String(secretSnap.get('wolfUid'))
  let resolved: ReturnType<typeof resolveVotes>
  try {
    resolved = resolveVotes({ aliveUids, wolfUid, ballots, skipped })
  } catch (error) {
    invalid(error)
  }
  if (resolved.kind === 'waiting') {
    tx.set(voteRef, {
      submitted: [...ballotMap.keys()],
      skipped,
      revealed: false,
      arrows: [],
      counts: {},
      eliminatedUid: null,
    })
    return { done: false as const }
  }

  for (const uid of aliveUids) tx.delete(db.doc(`rooms/${roomId}/ballotBox/${uid}`))
  if (resolved.kind === 'tie') {
    tx.update(roomRef, {
      phase: 'discuss',
      tie: true,
      discussEndsAt: Timestamp.fromMillis(Date.now() + TIE_EXTEND_SECONDS * 1000),
    })
    tx.set(voteRef, {
      submitted: [],
      skipped: [],
      revealed: true,
      arrows: resolved.arrows,
      counts: resolved.counts,
      eliminatedUid: null,
    })
    return { done: true as const, tie: true as const }
  }

  const eliminated = aliveSnaps.find((snap) => snap.id === resolved.eliminatedUid)
  tx.update(db.doc(`rooms/${roomId}/players/${resolved.eliminatedUid}`), { alive: false })
  const fallen = [
    ...asFallen(roomSnap.get('fallen')),
    { uid: resolved.eliminatedUid, name: String(eliminated?.get('name') ?? '?'), round: Number(roomSnap.get('round') ?? 1) },
  ]
  const publicVote = {
    submitted: ballots.map((ballot) => ballot.from),
    skipped,
    revealed: true,
    arrows: resolved.arrows,
    counts: resolved.counts,
    eliminatedUid: resolved.eliminatedUid,
  }
  if (resolved.winner) {
    tx.update(roomRef, {
      phase: 'result',
      status: 'result',
      tie: false,
      fallen,
      reveal: {
        wolfUid,
        citizenWord: String(secretSnap.get('citizenWord')),
        wolfWord: String(secretSnap.get('wolfWord')),
        winner: resolved.winner,
      },
    })
    tx.set(voteRef, publicVote)
    return { done: true as const, winner: resolved.winner }
  }
  tx.update(roomRef, {
    phase: 'elimination',
    tie: false,
    fallen,
    advanceAt: Timestamp.fromMillis(Date.now() + ELIMINATION_PAUSE_MS),
  })
  tx.set(voteRef, publicVote)
  return { done: true as const }
}

export const createRoom = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const data = dataOf(req)
  let name = ''
  let passphrase = ''
  let discussSeconds = 60
  let capacity = 6
  try {
    name = cleanRoomName(data.name)
    passphrase = cleanPassphrase(data.passphrase)
    discussSeconds = assertDiscussSeconds(data.discussSeconds)
    capacity = assertCapacity(data.capacity)
  } catch (error) {
    invalid(error)
  }
  const user = await ensureFree(me)
  const profile = profileOf(user)
  const roomRef = db.collection('rooms').doc()
  const roomId = roomRef.id
  const hash = sha256(passphrase)
  await db.runTransaction(async (tx) => {
    const passSnap = await tx.get(db.doc(`passphrases/${hash}`))
    const userSnap = await tx.get(db.doc(`users/${me}`))
    if (passSnap.exists) throw new HttpsError('already-exists', 'その合言葉は使われています')
    const current = userSnap.get('currentRoomId')
    if (typeof current === 'string' && current) throw new HttpsError('failed-precondition', 'いまの部屋から出てください')
    tx.set(db.doc(`passphrases/${hash}`), { roomId, createdAt: FieldValue.serverTimestamp() })
    tx.set(roomRef, {
      name,
      hostUid: me,
      capacity,
      discussSeconds,
      status: 'lobby',
      phase: 'lobby',
      round: 0,
      voteRound: 0,
      tie: false,
      fallen: [],
      gameId: 0,
      playerUids: [me],
      passphrase,
      createdAt: FieldValue.serverTimestamp(),
    })
    tx.set(db.doc(`rooms/${roomId}/players/${me}`), {
      uid: me,
      ...profile,
      alive: true,
      joinedAt: FieldValue.serverTimestamp(),
    })
    tx.set(db.doc(`rooms/${roomId}/secret/meta`), {
      passphrase,
      recentPairIds: [],
      customPairs: [],
    })
    tx.set(
      db.doc(`users/${me}`),
      { currentRoomId: roomId, currentRoomName: name, currentRoomStatus: 'lobby' },
      { merge: true },
    )
  })
  await publishShare([me], { id: roomId, name, status: 'lobby' })
  return { roomId }
})

export const joinByPassphrase = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  let passphrase = ''
  try {
    passphrase = cleanPassphrase(dataOf(req).passphrase)
  } catch (error) {
    invalid(error)
  }
  const user = await ensureFree(me)
  const passSnap = await db.doc(`passphrases/${sha256(passphrase)}`).get()
  if (!passSnap.exists) throw new HttpsError('not-found', 'その合言葉の部屋はありません')
  const roomId = String(passSnap.get('roomId') ?? '')
  if (!roomId) throw new HttpsError('not-found', 'その合言葉の部屋はありません')
  await addMember(roomId, me, profileOf(user))
  return { roomId }
})

export const leaveRoom = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const roomId = readDocId(dataOf(req).roomId, '部屋')
  const roomRef = db.doc(`rooms/${roomId}`)
  const outcome = await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef)
    const userRef = db.doc(`users/${me}`)
    if (!roomSnap.exists) {
      await tx.get(userRef)
      tx.set(
        userRef,
        {
          currentRoomId: FieldValue.delete(),
          currentRoomName: FieldValue.delete(),
          currentRoomStatus: FieldValue.delete(),
        },
        { merge: true },
      )
      return { emptied: false }
    }
    const playerUids = asStrings(roomSnap.get('playerUids'))
    const member = playerUids.includes(me)
    if (member && roomSnap.get('status') === 'playing') {
      throw new HttpsError('failed-precondition', 'ゲーム中は退室できません')
    }
    const metaSnap = await tx.get(db.doc(`rooms/${roomId}/secret/meta`))
    await tx.get(userRef)
    await tx.get(db.doc(`rooms/${roomId}/players/${me}`))
    const passphrase = String(metaSnap.get('passphrase') ?? roomSnap.get('passphrase') ?? '')
    const passSnap = passphrase ? await tx.get(db.doc(`passphrases/${sha256(passphrase)}`)) : null
    tx.delete(db.doc(`rooms/${roomId}/players/${me}`))
    tx.delete(db.doc(`rooms/${roomId}/hands/${me}`))
    tx.set(
      userRef,
      {
        currentRoomId: FieldValue.delete(),
        currentRoomName: FieldValue.delete(),
        currentRoomStatus: FieldValue.delete(),
      },
      { merge: true },
    )
    if (!member) return { emptied: false }
    const remaining = playerUids.filter((id) => id !== me)
    if (remaining.length === 0) {
      if (passSnap?.exists) tx.delete(passSnap.ref)
      tx.delete(db.doc(`rooms/${roomId}/secret/deal`))
      tx.delete(db.doc(`rooms/${roomId}/secret/meta`))
      tx.delete(db.doc(`rooms/${roomId}/voteState/current`))
      tx.delete(roomRef)
      return { emptied: true }
    }
    tx.update(roomRef, {
      playerUids: remaining,
      hostUid: roomSnap.get('hostUid') === me ? remaining[0] : roomSnap.get('hostUid'),
    })
    return { emptied: false }
  })
  await publishShare([me], null)
  if (outcome.emptied) {
    await clearCollection(`rooms/${roomId}/players`)
    await clearCollection(`rooms/${roomId}/hands`)
    await clearCollection(`rooms/${roomId}/messages`)
    await clearCollection(`rooms/${roomId}/pairBank`)
    await clearCollection(`rooms/${roomId}/joinRequests`)
    await clearCollection(`rooms/${roomId}/ballotBox`)
  }
  return { ok: true }
})

export const requestJoin = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const roomId = readDocId(dataOf(req).roomId, '部屋')
  const user = await ensureFree(me)
  const roomSnap = await db.doc(`rooms/${roomId}`).get()
  if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
  const playerUids = asStrings(roomSnap.get('playerUids'))
  if (playerUids.includes(me)) throw new HttpsError('already-exists', 'すでに入っています')
  const friendHits = await Promise.all(playerUids.map((id) => db.doc(`users/${me}/friends/${id}`).get()))
  if (!friendHits.some((hit) => hit.exists)) {
    throw new HttpsError('permission-denied', 'フレンドの部屋だけ申請できます')
  }
  const profile = profileOf(user)
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(db.doc(`rooms/${roomId}`))
    const requestRef = db.doc(`rooms/${roomId}/joinRequests/${me}`)
    await tx.get(requestRef)
    if (!fresh.exists || fresh.get('phase') !== 'lobby') {
      throw new HttpsError('failed-precondition', 'この部屋は募集をしめきりました')
    }
    const uids = asStrings(fresh.get('playerUids'))
    if (uids.includes(me)) throw new HttpsError('already-exists', 'すでに入っています')
    if (uids.length >= Number(fresh.get('capacity') ?? 0)) throw new HttpsError('failed-precondition', '部屋がいっぱいです')
    tx.set(requestRef, {
      uid: me,
      ...profile,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    })
  })
  return { ok: true }
})

export const respondJoin = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const data = dataOf(req)
  const roomId = readDocId(data.roomId, '部屋')
  const target = readDocId(data.uid, '相手')
  const accept = data.accept === true
  const roomRef = db.doc(`rooms/${roomId}`)
  const joined = await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef)
    const requestRef = db.doc(`rooms/${roomId}/joinRequests/${target}`)
    const requestSnap = await tx.get(requestRef)
    const userSnap = await tx.get(db.doc(`users/${target}`))
    const playerSnap = await tx.get(db.doc(`rooms/${roomId}/players/${target}`))
    if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
    if (roomSnap.get('hostUid') !== me) throw new HttpsError('permission-denied', '承認できるのはホストだけです')
    if (!requestSnap.exists || requestSnap.get('status') !== 'pending') return false
    const roomName = String(roomSnap.get('name') ?? '')
    if (!accept) {
      tx.update(requestRef, { status: 'rejected' })
      return false
    }
    if (roomSnap.get('phase') !== 'lobby') throw new HttpsError('failed-precondition', 'この部屋は募集をしめきりました')
    const playerUids = asStrings(roomSnap.get('playerUids'))
    if (playerUids.includes(target) || playerSnap.exists) throw new HttpsError('already-exists', 'すでに入っています')
    if (playerUids.length >= Number(roomSnap.get('capacity') ?? 0)) {
      throw new HttpsError('failed-precondition', '部屋がいっぱいです')
    }
    const current = userSnap.get('currentRoomId')
    if (typeof current === 'string' && current && current !== roomId) {
      throw new HttpsError('failed-precondition', 'その人は別の部屋にいます')
    }
    if (!userSnap.exists) throw new HttpsError('not-found', 'その人は見つかりません')
    tx.set(db.doc(`rooms/${roomId}/players/${target}`), {
      uid: target,
      ...profileOf(userSnap),
      alive: true,
      joinedAt: FieldValue.serverTimestamp(),
    })
    tx.update(roomRef, { playerUids: [...playerUids, target] })
    tx.set(
      db.doc(`users/${target}`),
      { currentRoomId: roomId, currentRoomName: roomName, currentRoomStatus: 'lobby' },
      { merge: true },
    )
    tx.update(requestRef, { status: 'approved' })
    return roomName
  })
  if (joined) await publishShare([target], { id: roomId, name: joined, status: 'lobby' })
  return { ok: true }
})

export const addPair = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const data = dataOf(req)
  const roomId = readDocId(data.roomId, '部屋')
  let a = ''
  let b = ''
  try {
    a = cleanWord(data.a)
    b = cleanWord(data.b)
    if (a.normalize('NFKC').toLowerCase() === b.normalize('NFKC').toLowerCase()) {
      throw new Error('2つの言葉は別にしてください')
    }
  } catch (error) {
    invalid(error)
  }
  const id = `c${Date.now().toString(36)}${randomInt(100, 999)}`
  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(db.doc(`rooms/${roomId}`))
    const metaRef = db.doc(`rooms/${roomId}/secret/meta`)
    const metaSnap = await tx.get(metaRef)
    if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
    if (roomSnap.get('hostUid') !== me) throw new HttpsError('permission-denied', 'お題を追加できるのはホストだけです')
    if (roomSnap.get('phase') !== 'lobby') throw new HttpsError('failed-precondition', '募集中だけ追加できます')
    const custom = asPairs(metaSnap.get('customPairs'))
    if (custom.length >= MAX_CUSTOM_PAIRS) throw new HttpsError('failed-precondition', '追加できるお題は20組までです')
    tx.set(
      metaRef,
      {
        passphrase: String(metaSnap.get('passphrase') ?? roomSnap.get('passphrase') ?? ''),
        recentPairIds: asStrings(metaSnap.get('recentPairIds')),
        customPairs: [...custom, { id, a, b }],
      },
      { merge: true },
    )
    tx.set(db.doc(`rooms/${roomId}/pairBank/${id}`), { a, b })
  })
  return { ok: true }
})

export const removePair = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const data = dataOf(req)
  const roomId = readDocId(data.roomId, '部屋')
  const pairId = typeof data.pairId === 'string' ? data.pairId : ''
  if (!/^c[a-z0-9]+$/i.test(pairId)) throw new HttpsError('invalid-argument', 'お題が不正です')
  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(db.doc(`rooms/${roomId}`))
    const metaRef = db.doc(`rooms/${roomId}/secret/meta`)
    const metaSnap = await tx.get(metaRef)
    if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
    if (roomSnap.get('hostUid') !== me) throw new HttpsError('permission-denied', '消せるのはホストだけです')
    if (roomSnap.get('phase') !== 'lobby') throw new HttpsError('failed-precondition', '募集中だけ消せます')
    tx.set(
      metaRef,
      {
        passphrase: String(metaSnap.get('passphrase') ?? roomSnap.get('passphrase') ?? ''),
        recentPairIds: asStrings(metaSnap.get('recentPairIds')),
        customPairs: asPairs(metaSnap.get('customPairs')).filter((pair) => pair.id !== pairId),
      },
      { merge: true },
    )
    tx.delete(db.doc(`rooms/${roomId}/pairBank/${pairId}`))
  })
  return { ok: true }
})

export const startGame = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const roomId = readDocId(dataOf(req).roomId, '部屋')
  const roomRef = db.doc(`rooms/${roomId}`)
  await clearCollection(`rooms/${roomId}/messages`)
  await clearCollection(`rooms/${roomId}/ballotBox`)
  await clearCollection(`rooms/${roomId}/joinRequests`)
  const started = await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(roomRef)
    const metaRef = db.doc(`rooms/${roomId}/secret/meta`)
    const metaSnap = await tx.get(metaRef)
    const voteSnap = await tx.get(db.doc(`rooms/${roomId}/voteState/current`))
    if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
    if (roomSnap.get('hostUid') !== me) throw new HttpsError('permission-denied', '開始できるのはホストだけです')
    if (roomSnap.get('phase') !== 'lobby') throw new HttpsError('failed-precondition', 'すでに始まっています')
    const playerUids = asStrings(roomSnap.get('playerUids'))
    if (playerUids.length < 3) throw new HttpsError('failed-precondition', '3人以上で開始できます')
    if (playerUids.length > Number(roomSnap.get('capacity') ?? 6)) {
      throw new HttpsError('failed-precondition', '定員を超えています')
    }
    const players = []
    for (const uid of playerUids) players.push(await tx.get(db.doc(`rooms/${roomId}/players/${uid}`)))
    const ready = players.filter((player) => player.exists)
    if (ready.length < 3) throw new HttpsError('failed-precondition', '3人以上で開始できます')
    const custom = asPairs(metaSnap.get('customPairs'))
    const recent = asStrings(metaSnap.get('recentPairIds'))
    const deal = assignWords(
      pickPair(PAIRS, custom, recent, rng),
      ready.map((player) => player.id),
      rng,
    )
    const gameId = Number(roomSnap.get('gameId') ?? 0) + 1
    tx.update(roomRef, {
      status: 'playing',
      phase: 'discuss',
      round: 1,
      voteRound: 1,
      tie: false,
      fallen: [],
      gameId,
      discussEndsAt: Timestamp.fromMillis(Date.now() + Number(roomSnap.get('discussSeconds') ?? 60) * 1000),
      advanceAt: FieldValue.delete(),
      reveal: FieldValue.delete(),
      passphrase: FieldValue.delete(),
    })
    tx.set(db.doc(`rooms/${roomId}/secret/deal`), {
      pairId: deal.pairId,
      wolfUid: deal.wolfUid,
      wolfWord: deal.wolfWord,
      citizenWord: deal.citizenWord,
    })
    tx.set(metaRef, {
      passphrase: String(metaSnap.get('passphrase') ?? roomSnap.get('passphrase') ?? ''),
      recentPairIds: [...recent, deal.pairId].slice(-RECENT_PAIR_LIMIT),
      customPairs: custom,
    })
    tx.set(db.doc(`rooms/${roomId}/voteState/current`), emptyVote())
    for (const player of ready) {
      tx.update(player.ref, { alive: true })
      tx.set(db.doc(`rooms/${roomId}/hands/${player.id}`), { word: deal.hands[player.id] })
    }
    void voteSnap
    return { name: String(roomSnap.get('name') ?? ''), uids: ready.map((player) => player.id) }
  })
  const batch = db.batch()
  for (const uid of started.uids) {
    batch.set(db.doc(`users/${uid}`), { currentRoomStatus: 'playing' }, { merge: true })
  }
  await batch.commit()
  await publishShare(started.uids, { id: roomId, name: started.name, status: 'playing' })
  return { ok: true }
})

async function readVoteContext(tx: Transaction, roomId: string) {
  const roomSnap = await tx.get(db.doc(`rooms/${roomId}`))
  if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
  if (roomSnap.get('phase') !== 'vote') throw new HttpsError('failed-precondition', 'いまは投票時間ではありません')
  const playerUids = asStrings(roomSnap.get('playerUids'))
  const players = []
  for (const uid of playerUids) players.push(await tx.get(db.doc(`rooms/${roomId}/players/${uid}`)))
  const voteSnap = await tx.get(db.doc(`rooms/${roomId}/voteState/current`))
  const secretSnap = await tx.get(db.doc(`rooms/${roomId}/secret/deal`))
  const alive = players.filter((player) => player.exists && player.get('alive') === true)
  const ballotMap = new Map<string, string>()
  for (const player of alive) {
    const ballot = await tx.get(db.doc(`rooms/${roomId}/ballotBox/${player.id}`))
    if (ballot.exists && typeof ballot.get('to') === 'string') ballotMap.set(player.id, ballot.get('to'))
  }
  const skipped = asStrings(voteSnap.get('skipped')).filter((uid) => alive.some((player) => player.id === uid))
  return { roomSnap, secretSnap, alive, ballotMap, skipped }
}

export const castVote = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const data = dataOf(req)
  const roomId = readDocId(data.roomId, '部屋')
  const target = readDocId(data.targetUid, '相手')
  if (me === target) throw new HttpsError('invalid-argument', '自分には投票できません')
  return db.runTransaction(async (tx) => {
    const context = await readVoteContext(tx, roomId)
    const mine = context.alive.find((player) => player.id === me)
    const chosen = context.alive.find((player) => player.id === target)
    if (!mine) throw new HttpsError('permission-denied', '投票できるのは残っている人だけです')
    if (!chosen) throw new HttpsError('invalid-argument', 'その人には投票できません')
    context.ballotMap.set(me, target)
    const skipped = context.skipped.filter((uid) => uid !== me)
    tx.set(db.doc(`rooms/${roomId}/ballotBox/${me}`), { to: target })
    return settleVotes(tx, roomId, context.roomSnap, context.alive, context.ballotMap, skipped, context.secretSnap)
  })
})

export const skipVote = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const data = dataOf(req)
  const roomId = readDocId(data.roomId, '部屋')
  const target = readDocId(data.targetUid, '相手')
  if (me === target) throw new HttpsError('invalid-argument', '自分の票はスキップできません')
  const presence = await presenceOf(roomId, target)
  if (presence.state === 'online') throw new HttpsError('failed-precondition', 'その人はまだ席にいます')
  if (!offlineLongEnough(presence.state, presence.at, SKIP_GRACE_MS)) {
    throw new HttpsError('failed-precondition', 'まだ離席したばかりです')
  }
  return db.runTransaction(async (tx) => {
    const context = await readVoteContext(tx, roomId)
    if (context.roomSnap.get('hostUid') !== me) throw new HttpsError('permission-denied', 'スキップできるのはホストだけです')
    if (context.ballotMap.has(target)) throw new HttpsError('failed-precondition', 'その人は投票済みです')
    if (!context.alive.some((player) => player.id === target)) {
      throw new HttpsError('failed-precondition', 'その人は投票できません')
    }
    const skipped = [...new Set([...context.skipped, target])]
    return settleVotes(tx, roomId, context.roomSnap, context.alive, context.ballotMap, skipped, context.secretSnap)
  })
})

export const closeDiscussion = onCall(callableOptions, async (req) => {
  requireUid(req)
  const roomId = readDocId(dataOf(req).roomId, '部屋')
  await db.runTransaction(async (tx) => {
    const roomRef = db.doc(`rooms/${roomId}`)
    const roomSnap = await tx.get(roomRef)
    const voteSnap = await tx.get(db.doc(`rooms/${roomId}/voteState/current`))
    if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
    if (roomSnap.get('phase') !== 'discuss') return
    if (Date.now() < millisOf(roomSnap.get('discussEndsAt'))) {
      throw new HttpsError('failed-precondition', 'まだ時間があります')
    }
    tx.update(roomRef, {
      phase: 'vote',
      tie: false,
      voteRound: Number(roomSnap.get('voteRound') ?? 0) + 1,
    })
    tx.set(db.doc(`rooms/${roomId}/voteState/current`), emptyVote())
    void voteSnap
  })
  return { ok: true }
})

export const advanceRound = onCall(callableOptions, async (req) => {
  requireUid(req)
  const roomId = readDocId(dataOf(req).roomId, '部屋')
  await db.runTransaction(async (tx) => {
    const roomRef = db.doc(`rooms/${roomId}`)
    const roomSnap = await tx.get(roomRef)
    await tx.get(db.doc(`rooms/${roomId}/voteState/current`))
    if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
    if (roomSnap.get('phase') !== 'elimination') return
    if (Date.now() < millisOf(roomSnap.get('advanceAt'))) {
      throw new HttpsError('failed-precondition', 'まだ表示中です')
    }
    tx.update(roomRef, {
      phase: 'discuss',
      round: Number(roomSnap.get('round') ?? 1) + 1,
      tie: false,
      discussEndsAt: Timestamp.fromMillis(Date.now() + Number(roomSnap.get('discussSeconds') ?? 60) * 1000),
      advanceAt: FieldValue.delete(),
    })
    tx.set(db.doc(`rooms/${roomId}/voteState/current`), emptyVote())
  })
  return { ok: true }
})

export const sendChat = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const data = dataOf(req)
  const roomId = readDocId(data.roomId, '部屋')
  let text = ''
  try {
    text = cleanChat(data.text)
  } catch (error) {
    invalid(error)
  }
  await db.runTransaction(async (tx) => {
    const roomSnap = await tx.get(db.doc(`rooms/${roomId}`))
    const playerSnap = await tx.get(db.doc(`rooms/${roomId}/players/${me}`))
    if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
    if (!['discuss', 'vote', 'elimination'].includes(String(roomSnap.get('phase')))) {
      throw new HttpsError('failed-precondition', 'いまはチャットできません')
    }
    if (!playerSnap.exists || playerSnap.get('alive') !== true) {
      throw new HttpsError('permission-denied', '観戦中は見るだけです')
    }
    tx.set(db.collection(`rooms/${roomId}/messages`).doc(), {
      uid: me,
      name: String(playerSnap.get('name') ?? ''),
      iconType: playerSnap.get('iconType') === 'photo' ? 'photo' : 'preset',
      iconId: String(playerSnap.get('iconId') ?? 'panda'),
      photoURL: typeof playerSnap.get('photoURL') === 'string' ? playerSnap.get('photoURL') : null,
      text,
      createdAt: FieldValue.serverTimestamp(),
    })
  })
  return { ok: true }
})

export const rematch = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const roomId = readDocId(dataOf(req).roomId, '部屋')
  await clearCollection(`rooms/${roomId}/messages`)
  await clearCollection(`rooms/${roomId}/ballotBox`)
  const restarted = await db.runTransaction(async (tx) => {
    const roomRef = db.doc(`rooms/${roomId}`)
    const roomSnap = await tx.get(roomRef)
    const metaSnap = await tx.get(db.doc(`rooms/${roomId}/secret/meta`))
    await tx.get(db.doc(`rooms/${roomId}/voteState/current`))
    await tx.get(db.doc(`rooms/${roomId}/secret/deal`))
    if (!roomSnap.exists) throw new HttpsError('not-found', '部屋がありません')
    if (roomSnap.get('hostUid') !== me) throw new HttpsError('permission-denied', 'もう一回できるのはホストだけです')
    if (roomSnap.get('phase') !== 'result') throw new HttpsError('failed-precondition', '試合が終わってからにしてください')
    const playerUids = asStrings(roomSnap.get('playerUids'))
    for (const uid of playerUids) await tx.get(db.doc(`rooms/${roomId}/players/${uid}`))
    const passphrase = String(metaSnap.get('passphrase') ?? '')
    tx.update(roomRef, {
      status: 'lobby',
      phase: 'lobby',
      round: 0,
      voteRound: 0,
      tie: false,
      fallen: [],
      passphrase,
      discussEndsAt: FieldValue.delete(),
      advanceAt: FieldValue.delete(),
      reveal: FieldValue.delete(),
    })
    tx.delete(db.doc(`rooms/${roomId}/secret/deal`))
    tx.set(db.doc(`rooms/${roomId}/voteState/current`), emptyVote())
    for (const uid of playerUids) {
      tx.update(db.doc(`rooms/${roomId}/players/${uid}`), { alive: true })
      tx.delete(db.doc(`rooms/${roomId}/hands/${uid}`))
    }
    return { name: String(roomSnap.get('name') ?? ''), uids: playerUids }
  })
  const batch = db.batch()
  for (const uid of restarted.uids) {
    batch.set(
      db.doc(`users/${uid}`),
      { currentRoomStatus: 'lobby', currentRoomName: restarted.name, currentRoomId: roomId },
      { merge: true },
    )
  }
  await batch.commit()
  await publishShare(restarted.uids, { id: roomId, name: restarted.name, status: 'lobby' })
  return { ok: true }
})

export const transferHost = onCall(callableOptions, async (req) => {
  const me = requireUid(req)
  const roomId = readDocId(dataOf(req).roomId, '部屋')
  const roomSnap = await db.doc(`rooms/${roomId}`).get()
  if (!roomSnap.exists) return { transferred: false }
  const hostUid = String(roomSnap.get('hostUid') ?? '')
  if (!hostUid || hostUid === me) return { transferred: false }
  const hostPresence = await presenceOf(roomId, hostUid)
  if (!offlineLongEnough(hostPresence.state, hostPresence.at, HOST_TRANSFER_GRACE_MS)) return { transferred: false }
  const playerUids = asStrings(roomSnap.get('playerUids')).filter((uid) => uid !== hostUid)
  const online: string[] = []
  for (const uid of playerUids) {
    const presence = await presenceOf(roomId, uid)
    if (presence.state === 'online') online.push(uid)
  }
  const next = online[0] ?? playerUids[0]
  if (!next) return { transferred: false }
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(db.doc(`rooms/${roomId}`))
    if (!fresh.exists) return
    if (fresh.get('hostUid') !== hostUid) return
    tx.update(fresh.ref, { hostUid: next })
  })
  return { transferred: true, hostUid: next }
})
