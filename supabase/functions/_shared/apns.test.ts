// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createApnsJwt, sendApns } from './apns'

async function makeKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey }
}

const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0))

describe('createApnsJwt', () => {
  it('ES256 で署名され、公開鍵で検証できる', async () => {
    const { pem, publicKey } = await makeKey()
    const jwt = await createApnsJwt({ keyId: 'KEY123', teamId: 'TEAM456', privateKey: pem }, 1_800_000_000_000)
    const [h, p, s] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({ alg: 'ES256', kid: 'KEY123' })
    expect(JSON.parse(new TextDecoder().decode(fromB64url(p)))).toEqual({ iss: 'TEAM456', iat: 1_800_000_000 })
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${p}`))
    expect(ok).toBe(true)
  })
})

describe('sendApns', () => {
  const config = { keyId: 'k', teamId: 't', privateKey: '', bundleId: 'com.readingpomodoro.app' }

  it('本番の APNs に、宛先アプリと通知の中身を付けて送る', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const result = await sendApns(config, 'JWT', 'abc', { title: 'T', body: 'B', data: { kind: 'feedback' } }, fetchImpl as unknown as typeof fetch)
    expect(result).toBe('sent')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.push.apple.com/3/device/abc')
    expect((init.headers as Record<string, string>)['apns-topic']).toBe('com.readingpomodoro.app')
    expect((init.headers as Record<string, string>).authorization).toBe('bearer JWT')
    expect(JSON.parse(init.body as string)).toEqual({ aps: { alert: { title: 'T', body: 'B' }, sound: 'default' }, kind: 'feedback' })
  })

  it('もう使えないトークンを見分ける', async () => {
    const gone = vi.fn(async () => new Response(null, { status: 410 }))
    expect(await sendApns(config, 'J', 'x', { title: '', body: '' }, gone as unknown as typeof fetch)).toBe('invalid-token')
    const bad = vi.fn(async () => new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 }))
    expect(await sendApns(config, 'J', 'x', { title: '', body: '' }, bad as unknown as typeof fetch)).toBe('invalid-token')
    const other = vi.fn(async () => new Response(JSON.stringify({ reason: 'TooManyRequests' }), { status: 429 }))
    expect(await sendApns(config, 'J', 'x', { title: '', body: '' }, other as unknown as typeof fetch)).toBe('failed')
  })
})
