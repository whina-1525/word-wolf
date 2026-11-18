import { initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { getFirestore } from 'firebase-admin/firestore'
import { createHash, randomInt } from 'crypto'

function databaseURL() {
  if (process.env.FIREBASE_DATABASE_URL) return process.env.FIREBASE_DATABASE_URL
  if (process.env.FIREBASE_CONFIG) {
    try {
      const config = JSON.parse(process.env.FIREBASE_CONFIG) as { databaseURL?: string }
      if (config.databaseURL) return config.databaseURL
    } catch {
      /* ignore broken env */
    }
  }
  return 'https://demo-word-wolf-default-rtdb.firebaseio.com'
}

const app = initializeApp({ databaseURL: databaseURL() })

export const db = getFirestore(app)
export const rtdb = getDatabase(app)

export function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function rng() {
  return randomInt(0, 1_000_000) / 1_000_000
}
