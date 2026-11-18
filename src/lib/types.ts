export type IconType = 'preset' | 'photo'
export type Phase = 'lobby' | 'discuss' | 'vote' | 'elimination' | 'result'
export type RoomStatus = 'lobby' | 'playing' | 'result'
export type Winner = 'citizen' | 'wolf'

export type Stamp = { toMillis: () => number }

export type Profile = {
  uid: string
  name: string
  nameLower?: string
  iconType: IconType
  iconId: string
  photoURL: string | null
  currentRoomId?: string
}

export type RoomDoc = {
  name: string
  hostUid: string
  capacity: number
  discussSeconds: number
  status: RoomStatus
  phase: Phase
  round: number
  voteRound: number
  tie: boolean
  fallen: { uid: string; name: string; round: number }[]
  gameId: number
  playerUids: string[]
  passphrase?: string
  discussEndsAt?: Stamp
  advanceAt?: Stamp
  reveal?: {
    wolfUid: string
    citizenWord: string
    wolfWord: string
    winner: Winner
  }
}

export type PlayerDoc = {
  uid: string
  name: string
  iconType: IconType
  iconId: string
  photoURL: string | null
  alive: boolean
  joinedAt?: Stamp
}

export type VoteDoc = {
  submitted: string[]
  skipped: string[]
  revealed: boolean
  arrows: { from: string; to: string }[]
  counts: Record<string, number>
  eliminatedUid: string | null
}

export type ChatMessage = {
  id: string
  uid: string
  name: string
  iconType: IconType
  iconId: string
  photoURL: string | null
  text: string
}

export type CustomPair = { id: string; a: string; b: string }

export type JoinRequest = {
  uid: string
  name: string
  iconType: IconType
  iconId: string
  photoURL: string | null
  status: string
}

export type Presence = { state: 'online' | 'offline'; at: number }

export const EMPTY_VOTE: VoteDoc = {
  submitted: [],
  skipped: [],
  revealed: false,
  arrows: [],
  counts: {},
  eliminatedUid: null,
}

export function millisOf(value: Stamp | undefined) {
  return value?.toMillis?.() ?? null
}
