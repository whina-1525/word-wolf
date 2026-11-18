import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { call, errorText } from '../lib/api'
import { auth, storage } from '../lib/firebase'
import { squareImage } from '../lib/image'
import { PRESETS } from '../lib/presets'
import { carryStats } from '../lib/stats'
import type { IconType } from '../lib/types'
import { Avatar } from './Avatar'

export function ProfileForm({
  submitLabel,
  onDone,
}: {
  submitLabel: string
  onDone: () => void
}) {
  const { profile, user } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [iconId, setIconId] = useState(profile?.iconType === 'photo' ? 'panda' : profile?.iconId ?? 'panda')
  const [iconType, setIconType] = useState<IconType>(profile?.iconType ?? 'preset')
  const [photoURL, setPhotoURL] = useState<string | null>(profile?.photoURL ?? null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(profile?.iconType === 'photo' ? profile.photoURL : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const choosePhoto = (next: File | null) => {
    if (!next) return
    setFile(next)
    setIconType('photo')
    setPreview(URL.createObjectURL(next))
  }

  const save = async () => {
    const trimmed = name.trim()
    if ([...trimmed].length < 1 || [...trimmed].length > 10) {
      setError('なまえは1〜10文字です')
      return
    }
    setBusy(true)
    setError('')
    try {
      let nextPhoto = photoURL
      const uid = user?.uid ?? auth.currentUser?.uid
      if (iconType === 'photo' && file && uid) {
        const blob = await squareImage(file)
        const storageRef = ref(storage, `icons/${uid}/avatar.jpg`)
        await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' })
        nextPhoto = await getDownloadURL(storageRef)
        setPhotoURL(nextPhoto)
      }
      await call('saveProfile', {
        name: trimmed,
        iconType,
        iconId: iconType === 'photo' ? 'photo' : iconId,
        photoURL: iconType === 'photo' ? nextPhoto : null,
      })
      if (profile?.name) carryStats(profile.name, trimmed)
      onDone()
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="profile-preview">
        <Avatar
          iconType={iconType}
          iconId={iconId}
          photoURL={iconType === 'photo' ? preview : null}
          name={name}
          size={84}
        />
      </div>
      <label className="field">
        <span>なまえ</span>
        <input value={name} maxLength={10} placeholder="10文字まで" onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="icon-grid" role="listbox" aria-label="アイコン">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`icon-choice ${iconType === 'preset' && iconId === preset.id ? 'selected' : ''}`}
            style={{ background: preset.bg }}
            onClick={() => {
              setIconType('preset')
              setIconId(preset.id)
            }}
            aria-label={preset.label}
            aria-selected={iconType === 'preset' && iconId === preset.id}
          >
            {preset.emoji}
          </button>
        ))}
      </div>
      <label className="btn ghost file-btn">
        アルバムから選ぶ
        <input
          type="file"
          accept="image/*"
          onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>
        {busy ? '保存しています' : submitLabel}
      </button>
    </div>
  )
}
