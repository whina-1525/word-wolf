import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { ProfileForm } from '../components/ProfileForm'
import { usingEmulator } from '../lib/firebase'

export function Onboarding() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (ready) navigate('/', { replace: true })
  }, [ready, navigate])
  return (
    <main className="screen">
      <div className="screen-inner intro">
        <Logo />
        <div>
          <p className="kicker">家族ではなす</p>
          <h1>ワードウルフ</h1>
          <p className="lede">にたことばで、なかまをみやぶれ。</p>
        </div>
        <ProfileForm submitLabel="はじめる" onDone={() => setReady(true)} />
        {usingEmulator ? <p className="hint">開発用サーバーにつながっています</p> : null}
      </div>
    </main>
  )
}
