export const PRESET_IDS = [
  'panda',
  'bear',
  'rabbit',
  'cat',
  'dog',
  'fox',
  'penguin',
  'chick',
  'frog',
  'pig',
  'monkey',
  'tiger',
  'koala',
  'hedgehog',
  'squirrel',
  'whale',
  'octopus',
  'lion',
  'cow',
  'sheep',
  'hamster',
  'duck',
] as const

export type PresetId = (typeof PRESET_IDS)[number]

export function assertPreset(id: unknown): PresetId {
  if (typeof id === 'string' && (PRESET_IDS as readonly string[]).includes(id)) return id as PresetId
  throw new Error('アイコンを選び直してください')
}
