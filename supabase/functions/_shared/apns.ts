// Apple Push Notification service（APNs）に通知を送るための小さな部品。
// Deno（Edge Function）と Node（テスト）の両方で動くよう、Web 標準の API（crypto.subtle / fetch）だけを使う。

export interface ApnsConfig {
  keyId: string // Apple Developer の Keys で作った鍵の Key ID
  teamId: string // Apple Developer のチーム ID
  privateKey: string // 鍵ファイル（.p8）の中身
  bundleId: string // アプリのバンドル ID（通知の宛先アプリ）
  sandbox?: boolean // Xcode から直接入れた開発用ビルドに送るときだけ true（TestFlight / App Store は false）
}

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  return Uint8Array.from(atob(body), c => c.charCodeAt(0))
}

/** APNs に名乗るための署名付きトークン（ES256 の JWT）を作る。1時間まで使い回せる */
export async function createApnsJwt(config: Pick<ApnsConfig, 'keyId' | 'teamId' | 'privateKey'>, now = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(config.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  const enc = new TextEncoder()
  const header = base64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: config.keyId })))
  const payload = base64url(enc.encode(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) })))
  const signingInput = `${header}.${payload}`
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)))
  return `${signingInput}.${base64url(signature)}`
}

export interface PushMessage {
  title: string
  body: string
  data?: Record<string, string>
}

export type PushResult = 'sent' | 'invalid-token' | 'failed'

/** 1台の端末に通知を送る。端末側でアプリが消されたなど、もう使えないトークンなら 'invalid-token' を返す */
export async function sendApns(config: ApnsConfig, jwt: string, deviceToken: string, message: PushMessage, fetchImpl: typeof fetch = fetch): Promise<PushResult> {
  const host = config.sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
  const res = await fetchImpl(`https://${host}/3/device/${encodeURIComponent(deviceToken)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
      ...message.data,
    }),
  })
  if (res.ok) return 'sent'
  if (res.status === 410) return 'invalid-token'
  try {
    const { reason } = await res.json() as { reason?: string }
    if (reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic') return 'invalid-token'
  } catch {
    // 本文がなくても失敗として扱う
  }
  return 'failed'
}
