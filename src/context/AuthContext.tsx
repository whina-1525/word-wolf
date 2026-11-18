import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { auth, db } from '../lib/firebase'
import { watchMyStatus } from '../lib/presence'
import type { IconType, Profile } from '../lib/types'

type AuthValue = {
  user: User | null
  profile: Profile | null
  loading: boolean
  authError: string
  clearRoomLocal: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const blockRoom = useRef<string | null>(null)

  useEffect(() => {
    let profileStop = () => {}
    let presenceStop = () => {}
    const stop = onAuthStateChanged(auth, (next) => {
      profileStop()
      presenceStop()
      if (!next) {
        setUser(null)
        setProfile(null)
        signInAnonymously(auth).catch((error: unknown) => {
          setAuthError(error instanceof Error ? error.message : '接続できませんでした')
          setLoading(false)
        })
        return
      }
      setUser(next)
      setAuthError('')
      void watchMyStatus(next.uid).then((stopPresence) => {
        presenceStop = stopPresence
      })
      profileStop = onSnapshot(
        doc(db, 'users', next.uid),
        (snap) => {
          const data = snap.data()
          if (!snap.exists() || typeof data?.name !== 'string' || !data.name) {
            setProfile(null)
          } else {
            let currentRoomId = typeof data.currentRoomId === 'string' ? data.currentRoomId : undefined
            if (blockRoom.current && currentRoomId === blockRoom.current) currentRoomId = undefined
            else blockRoom.current = null
            setProfile({
              uid: next.uid,
              name: data.name,
              nameLower: typeof data.nameLower === 'string' ? data.nameLower : undefined,
              iconType: data.iconType === 'photo' ? 'photo' : 'preset',
              iconId: typeof data.iconId === 'string' ? data.iconId : 'panda',
              photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
              currentRoomId,
            })
          }
          setLoading(false)
        },
        () => setLoading(false),
      )
    })
    return () => {
      stop()
      profileStop()
      presenceStop()
    }
  }, [])

  const clearRoomLocal = () => {
    setProfile((current) => {
      if (current?.currentRoomId) blockRoom.current = current.currentRoomId
      return current ? { ...current, currentRoomId: undefined } : current
    })
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, authError, clearRoomLocal }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('auth')
  return value
}

export function useIconType(value: string | undefined): IconType {
  return value === 'photo' ? 'photo' : 'preset'
}
