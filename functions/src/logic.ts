import { BANNED_FRAGMENTS, type Pair } from './pairs'

export const DISCUSS_CHOICES = [30, 45, 60, 90, 120, 180] as const
export const TIE_EXTEND_SECONDS = 60
export const ELIMINATION_PAUSE_MS = 7000
export const HOST_TRANSFER_GRACE_MS = 20000
export const SKIP_GRACE_MS = 10000
export const RECENT_PAIR_LIMIT = 20
export const MAX_CUSTOM_PAIRS = 20
export const MAX_NAME = 10
export const MAX_ROOM_NAME = 20
export const MIN_PASSPHRASE = 2
export const MAX_PASSPHRASE = 20
export const MAX_WORD = 16
export const MAX_CHAT = 200
export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 6

export type Ballot = { from: string; to: string }
export type Arrow = { from: string; to: string }
export type Winner = 'citizen' | 'wolf'

export type ResolveInput = {
  aliveUids: string[]
  wolfUid: string
  ballots: Ballot[]
  skipped: string[]
}

export type ResolveResult =
  | { kind: 'waiting' }
  | { kind: 'tie'; arrows: Arrow[]; counts: Record<string, number> }
  | {
      kind: 'eliminate'
      eliminatedUid: string
      arrows: Arrow[]
      counts: Record<string, number>
      winner: Winner | null
      aliveAfter: string[]
    }

export function pickPair(builtin: Pair[], custom: Pair[], recent: string[], rng: () => number): Pair {
  const all = [...builtin, ...custom]
  if (all.length === 0) throw new Error('お題がありません')
  const fresh = all.filter((pair) => !recent.includes(pair.id))
  const pool = fresh.length > 0 ? fresh : all
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length))
  return pool[index]
}

export function assignWords(pair: Pair, playerUids: string[], rng: () => number) {
  if (playerUids.length === 0) throw new Error('プレイヤーがいません')
  const wolfIsA = rng() < 0.5
  const wolfWord = wolfIsA ? pair.a : pair.b
  const citizenWord = wolfIsA ? pair.b : pair.a
  const wolfIndex = Math.min(playerUids.length - 1, Math.floor(rng() * playerUids.length))
  const wolfUid = playerUids[wolfIndex]
  const hands: Record<string, string> = {}
  for (const uid of playerUids) hands[uid] = uid === wolfUid ? wolfWord : citizenWord
  return { pairId: pair.id, wolfUid, wolfWord, citizenWord, hands }
}

export function resolveVotes(input: ResolveInput): ResolveResult {
  const alive = new Set(input.aliveUids)
  const skipped = new Set(input.skipped.filter((uid) => alive.has(uid)))
  const mustVote = input.aliveUids.filter((uid) => !skipped.has(uid))
  const ballots = input.ballots.filter((ballot) => mustVote.includes(ballot.from) && alive.has(ballot.from))
  const byVoter = new Map<string, string>()
  for (const ballot of ballots) byVoter.set(ballot.from, ballot.to)
  if (mustVote.some((uid) => !byVoter.has(uid))) return { kind: 'waiting' }

  for (const [from, to] of byVoter) {
    if (from === to) throw new Error('自分には投票できません')
    if (!alive.has(to)) throw new Error('その人には投票できません')
  }

  const counts: Record<string, number> = {}
  for (const uid of input.aliveUids) counts[uid] = 0
  for (const to of byVoter.values()) counts[to] = (counts[to] ?? 0) + 1
  const arrows = [...byVoter.entries()].map(([from, to]) => ({ from, to }))
  const max = Math.max(0, ...Object.values(counts))
  const leaders = Object.entries(counts)
    .filter(([, count]) => count === max)
    .map(([uid]) => uid)

  if (leaders.length !== 1) return { kind: 'tie', arrows, counts }

  const eliminatedUid = leaders[0]
  const aliveAfter = input.aliveUids.filter((uid) => uid !== eliminatedUid)
  const wolfAlive = aliveAfter.includes(input.wolfUid)
  const citizens = aliveAfter.filter((uid) => uid !== input.wolfUid).length
  let winner: Winner | null = null
  if (!wolfAlive) winner = 'citizen'
  else if (citizens === 0 || citizens === 1) winner = 'wolf'
  return { kind: 'eliminate', eliminatedUid, arrows, counts, winner, aliveAfter }
}

export function containsBanned(word: string): boolean {
  const folded = word.normalize('NFKC').toLowerCase()
  return BANNED_FRAGMENTS.some((fragment) => folded.includes(fragment.toLowerCase()))
}

export function cleanWord(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('言葉を入力してください')
  const word = raw.trim().replace(/\s+/g, ' ')
  const length = [...word].length
  if (length < 1 || length > MAX_WORD) throw new Error(`言葉は1〜${MAX_WORD}文字です`)
  if (containsBanned(word)) throw new Error('この言葉は使えません')
  return word
}

export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('なまえを入力してください')
  const name = raw.trim().replace(/\s+/g, ' ')
  const length = [...name].length
  if (length < 1 || length > MAX_NAME) throw new Error('なまえは1〜10文字です')
  if (/[\u0000-\u001f]/.test(name)) throw new Error('使えない文字があります')
  return name
}

export function cleanRoomName(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('部屋の名前を入力してください')
  const name = raw.trim().replace(/\s+/g, ' ')
  const length = [...name].length
  if (length < 1 || length > MAX_ROOM_NAME) throw new Error('部屋の名前は1〜20文字です')
  return name
}

export function cleanPassphrase(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('合言葉を入力してください')
  const passphrase = raw.trim()
  const length = [...passphrase].length
  if (length < MIN_PASSPHRASE || length > MAX_PASSPHRASE) {
    throw new Error('合言葉は2〜20文字です')
  }
  if (/\s/.test(passphrase)) throw new Error('合言葉に空白は使えません')
  return passphrase
}

export function cleanChat(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('メッセージを入力してください')
  const text = raw.trim()
  const length = [...text].length
  if (length < 1 || length > MAX_CHAT) throw new Error(`メッセージは1〜${MAX_CHAT}文字です`)
  return text
}

export function assertDiscussSeconds(value: unknown): number {
  const seconds = Number(value)
  if (!(DISCUSS_CHOICES as readonly number[]).includes(seconds)) {
    throw new Error('話す時間を選び直してください')
  }
  return seconds
}

export function assertCapacity(value: unknown): number {
  const capacity = Number(value)
  if (!Number.isInteger(capacity) || capacity < MIN_PLAYERS || capacity > MAX_PLAYERS) {
    throw new Error('定員は3〜6人です')
  }
  return capacity
}

export function offlineLongEnough(state: string, at: number, waitMs: number, now = Date.now()): boolean {
  if (state === 'online') return false
  return now - at >= waitMs
}
