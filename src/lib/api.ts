import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

export async function call<T>(name: string, data?: Record<string, unknown>) {
  const fn = httpsCallable<Record<string, unknown>, T>(functions, name)
  const result = await fn(data ?? {})
  return result.data
}

export function errorText(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    const cleaned = message.replace(/^Firebase:\s*/i, '').replace(/\s*\(functions\/[a-z0-9-]+\)\.?$/i, '')
    if (cleaned && !/^internal$/i.test(cleaned)) return cleaned
  }
  return 'うまくいきませんでした。もう一度ためしてください'
}
