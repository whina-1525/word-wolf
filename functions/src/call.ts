import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https'

export const callableOptions = {
  region: 'asia-northeast1' as const,
  invoker: 'public' as const,
  maxInstances: 10,
}

export function requireUid(req: CallableRequest) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'ログインしていません')
  return req.auth.uid
}

export function dataOf(req: CallableRequest) {
  return (req.data ?? {}) as Record<string, unknown>
}

export function readDocId(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{8,40}$/.test(value)) {
    throw new HttpsError('invalid-argument', `${label}が不正です`)
  }
  return value
}

export function invalid(error: unknown): never {
  throw new HttpsError('invalid-argument', error instanceof Error ? error.message : '入力を確認してください')
}
