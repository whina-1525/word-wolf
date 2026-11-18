export type Preset = { id: string; emoji: string; bg: string; label: string }

export const PRESETS: Preset[] = [
  { id: 'panda', emoji: '🐼', bg: '#e7f6ea', label: 'パンダ' },
  { id: 'bear', emoji: '🐻', bg: '#f6eadc', label: 'くま' },
  { id: 'rabbit', emoji: '🐰', bg: '#fde8ef', label: 'うさぎ' },
  { id: 'cat', emoji: '🐱', bg: '#fff1d6', label: 'ねこ' },
  { id: 'dog', emoji: '🐶', bg: '#f7ead7', label: 'いぬ' },
  { id: 'fox', emoji: '🦊', bg: '#ffe6d4', label: 'きつね' },
  { id: 'penguin', emoji: '🐧', bg: '#e5eef8', label: 'ペンギン' },
  { id: 'chick', emoji: '🐤', bg: '#fff4cc', label: 'ひよこ' },
  { id: 'frog', emoji: '🐸', bg: '#e5f6df', label: 'かえる' },
  { id: 'pig', emoji: '🐷', bg: '#fde4ea', label: 'ぶた' },
  { id: 'monkey', emoji: '🐵', bg: '#f6ead2', label: 'さる' },
  { id: 'tiger', emoji: '🐯', bg: '#ffe7c8', label: 'とら' },
  { id: 'koala', emoji: '🐨', bg: '#edf2e4', label: 'コアラ' },
  { id: 'hedgehog', emoji: '🦔', bg: '#f4e6d4', label: 'はりねずみ' },
  { id: 'squirrel', emoji: '🐿️', bg: '#f8e7d2', label: 'りす' },
  { id: 'whale', emoji: '🐳', bg: '#e3f3fb', label: 'くじら' },
  { id: 'octopus', emoji: '🐙', bg: '#fde8e4', label: 'たこ' },
  { id: 'lion', emoji: '🦁', bg: '#ffe8c2', label: 'らいおん' },
  { id: 'cow', emoji: '🐮', bg: '#f4f0e4', label: 'うし' },
  { id: 'sheep', emoji: '🐑', bg: '#f4f1ea', label: 'ひつじ' },
  { id: 'hamster', emoji: '🐹', bg: '#ffe9d8', label: 'ハムスター' },
  { id: 'duck', emoji: '🦆', bg: '#e5f4ea', label: 'あひる' },
]

export function presetById(id: string) {
  return PRESETS.find((preset) => preset.id === id) ?? PRESETS[0]
}

export const DISCUSS_CHOICES = [
  { seconds: 30, label: '30秒' },
  { seconds: 45, label: '45秒' },
  { seconds: 60, label: '1分' },
  { seconds: 90, label: '1分30秒' },
  { seconds: 120, label: '2分' },
  { seconds: 180, label: '3分' },
]

export function discussLabel(seconds: number) {
  return DISCUSS_CHOICES.find((choice) => choice.seconds === seconds)?.label ?? `${seconds}秒`
}
