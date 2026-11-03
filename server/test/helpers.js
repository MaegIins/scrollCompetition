import { createApp } from '../app.js'

// Horloge contrôlable : 3 novembre 2026, midi à Paris
export const T0 = Date.parse('2026-11-03T12:00:00+01:00')

/** Démarre une app neuve (base en mémoire) sur un port libre et renvoie de quoi l'appeler. */
export async function start(options = {}) {
  const clock = { t: T0 }
  const { app, db, close } = createApp({ now: () => clock.t, ...options })
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const base = `http://127.0.0.1:${server.address().port}/api`

  /** Appel JSON : renvoie { status, body, headers } */
  const call = async (method, path, { token, body, raw, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
    return { status: res.status, body: json, headers: res.headers }
  }

  /** Inscrit quelqu'un et renvoie son token + id */
  const register = async (name, pin = '1234') => {
    const r = await call('POST', '/register', { body: { name, pin } })
    if (r.status !== 200) throw new Error(`register ${name}: ${JSON.stringify(r.body)}`)
    return { token: r.body.token, id: r.body.user.id }
  }

  /** Saisit des minutes pour un jour */
  const enter = (token, day, vals) => call('PUT', `/entries/${day}`, { token, body: vals })

  const stop = async () => {
    await new Promise((r) => server.close(r))
    close()
  }
  return { call, register, enter, clock, db, stop }
}
