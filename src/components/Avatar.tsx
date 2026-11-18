import type { IconType } from '../lib/types'
import { presetById } from '../lib/presets'

export function Avatar({
  iconType,
  iconId,
  photoURL,
  name,
  size = 48,
}: {
  iconType: IconType
  iconId: string
  photoURL?: string | null
  name?: string
  size?: number
}) {
  const preset = presetById(iconId)
  return (
    <span className="avatar" style={{ width: size, height: size, background: preset.bg }} title={name}>
      {iconType === 'photo' && photoURL ? (
        <img src={photoURL} alt={name ? `${name}のアイコン` : ''} />
      ) : (
        <span className="avatar-emoji" style={{ fontSize: Math.round(size * 0.52) }}>
          {preset.emoji}
        </span>
      )}
    </span>
  )
}
