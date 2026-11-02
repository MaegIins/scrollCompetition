import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const INVITE_CODE = process.env.INVITE_CODE || '' // si défini, requis pour s'inscrire
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const APPS = ['tiktok', 'reels', 'twitter']
const MAX_MINUTES = 24 * 60

mkdirSync(DATA_DIR, { recursive: true })
const db = new DatabaseSync(path.join(DATA_DIR, 'scroll.db'))
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pin_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS entries (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    tiktok INTEGER NOT NULL DEFAULT 0,
    reels INTEGER NOT NULL DEFAULT 0,
    twitter INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, day)
  );
`)
// Migration : Shorts remplacé par Twitter
const entryCols = db.prepare('PRAGMA table_info(entries)').all().map((c) => c.name)
if (entryCols.includes('shorts')) db.exec('ALTER TABLE entries RENAME COLUMN shorts TO twitter')
// Migration : photo de profil (data URL) + version pour le cache navigateur
const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
if (!cols.includes('avatar')) db.exec('ALTER TABLE users ADD COLUMN avatar TEXT')
if (!cols.includes('avatar_v')) db.exec('ALTER TABLE users ADD COLUMN avatar_v INTEGER NOT NULL DEFAULT 0')

// --- helpers ---------------------------------------------------------------
const hashPin = (pin) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`
}
const checkPin = (pin, stored) => {
  const [salt, hash] = stored.split(':')
  const a = Buffer.from(hash, 'hex')
  const b = scryptSync(pin, salt, 32)
  return a.length === b.length && timingSafeEqual(a, b)
}
const newSession = (userId) => {
  const token = randomBytes(24).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId)
  return token
}
// YYYY-MM-DD et date réelle (rejette 2026-13-45, 2026-02-30…)
const isDay = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
// Dernier jour saisissable : demain en UTC, pour laisser de la marge aux fuseaux horaires
const maxEntryDay = () => new Date(Date.now() + 36 * 3600e3).toISOString().slice(0, 10)
const checkName = (name) =>
  name.length < 2 || name.length > 20 ? 'Pseudo entre 2 et 20 caractères' : null
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg })
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '')

// Anti-bruteforce du PIN : après 5 échecs, blocage croissant (30 s, 1 min, 2 min… max 15 min)
const attempts = new Map() // clé -> { fails, until, last }
const lockedFor = (key) => {
  const a = attempts.get(key)
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 1000) : 0
}
const recordFail = (key) => {
  const a = attempts.get(key) || { fails: 0, until: 0 }
  a.fails++
  a.last = Date.now()
  if (a.fails >= 5) a.until = Date.now() + Math.min(15 * 60e3, 30e3 * 2 ** (a.fails - 5))
  attempts.set(key, a)
}
const lockedMsg = (s) => `Trop d'essais, réessaie dans ${s > 60 ? `${Math.ceil(s / 60)} min` : `${s} s`}`
setInterval(() => {
  for (const [k, a] of attempts) if (Date.now() - a.last > 3600e3) attempts.delete(k)
}, 600e3).unref()
// Hash factice : la connexion prend le même temps que le pseudo existe ou non
const DUMMY_HASH = hashPin('0000')

const auth = (req, res, next) => {
  const token = bearer(req)
  const user = token
    ? db.prepare('SELECT u.id, u.name, u.avatar_v FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token)
    : null
  if (!user) return bad(res, 'Non connecté', 401)
  req.user = user
  next()
}

// --- app -------------------------------------------------------------------
const app = express()
app.use(express.json({ limit: '400kb' }))
app.use((req, _res, next) => {
  req.body ??= {} // requête sans corps JSON
  next()
})

app.get('/api/config', (_req, res) => res.json({ inviteRequired: !!INVITE_CODE }))

app.post('/api/register', (req, res) => {
  const name = String(req.body.name || '').trim()
  const pin = String(req.body.pin || '')
  if (INVITE_CODE && req.body.invite !== INVITE_CODE) return bad(res, "Code d'invitation invalide", 403)
  if (checkName(name)) return bad(res, checkName(name))
  if (!/^\d{4,8}$/.test(pin)) return bad(res, 'Le PIN doit faire 4 à 8 chiffres')
  if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(name)) return bad(res, 'Pseudo déjà pris', 409)
  const { lastInsertRowid } = db.prepare('INSERT INTO users (name, pin_hash) VALUES (?, ?)').run(name, hashPin(pin))
  const id = Number(lastInsertRowid)
  res.json({ token: newSession(id), user: { id, name, avatar_v: 0 } })
})

app.post('/api/login', (req, res) => {
  const name = String(req.body.name || '').trim()
  const key = `login:${name.toLowerCase()}`
  const wait = lockedFor(key)
  if (wait) return bad(res, lockedMsg(wait), 429)
  const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name)
  const ok = checkPin(String(req.body.pin || ''), user?.pin_hash ?? DUMMY_HASH)
  if (!user || !ok) {
    recordFail(key)
    return bad(res, 'Pseudo ou PIN incorrect', 401)
  }
  attempts.delete(key)
  res.json({ token: newSession(user.id), user: { id: user.id, name: user.name, avatar_v: user.avatar_v } })
})

app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(bearer(req))
  res.json({ ok: true })
})

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }))

// Photo de profil : le client envoie une image déjà redimensionnée (data URL)
app.put('/api/me/avatar', auth, (req, res) => {
  const dataUrl = String(req.body.dataUrl || '')
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return bad(res, 'Image invalide')
  if (dataUrl.length > 300_000) return bad(res, 'Image trop lourde')
  const v = Date.now()
  db.prepare('UPDATE users SET avatar = ?, avatar_v = ? WHERE id = ?').run(dataUrl, v, req.user.id)
  res.json({ avatar_v: v })
})
app.delete('/api/me/avatar', auth, (req, res) => {
  db.prepare('UPDATE users SET avatar = NULL, avatar_v = 0 WHERE id = ?').run(req.user.id)
  res.json({ avatar_v: 0 })
})
// Public (une balise <img> n'envoie pas de token) ; URL versionnée => cache long
app.get('/api/avatar/:id', (req, res) => {
  const row = db.prepare('SELECT avatar FROM users WHERE id = ?').get(Number(req.params.id))
  const m = row?.avatar?.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!m) return res.status(404).end()
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type(m[1]).send(Buffer.from(m[2], 'base64'))
})

// Profil : pseudo + PIN
app.patch('/api/me', auth, (req, res) => {
  const name = String(req.body.name || '').trim()
  const err = checkName(name)
  if (err) return bad(res, err)
  if (db.prepare('SELECT 1 FROM users WHERE name = ? AND id != ?').get(name, req.user.id)) return bad(res, 'Pseudo déjà pris', 409)
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id)
  res.json({ user: { ...req.user, name } })
})

app.put('/api/me/pin', auth, (req, res) => {
  const key = `pin:${req.user.id}`
  const wait = lockedFor(key)
  if (wait) return bad(res, lockedMsg(wait), 429)
  const { pin_hash } = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(req.user.id)
  if (!checkPin(String(req.body.current || ''), pin_hash)) {
    recordFail(key)
    return bad(res, 'PIN actuel incorrect', 403)
  }
  attempts.delete(key)
  const next = String(req.body.next || '')
  if (!/^\d{4,8}$/.test(next)) return bad(res, 'Le PIN doit faire 4 à 8 chiffres')
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hashPin(next), req.user.id)
  // Déconnecte les autres appareils, garde la session courante
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, bearer(req))
  res.json({ ok: true })
})

app.get('/api/users', auth, (_req, res) => {
  res.json(db.prepare('SELECT id, name, avatar_v FROM users ORDER BY id').all())
})

// Saisie / modification du temps d'une journée (en minutes)
app.put('/api/entries/:day', auth, (req, res) => {
  const { day } = req.params
  if (!isDay(day)) return bad(res, 'Date invalide')
  if (day > maxEntryDay()) return bad(res, 'Pas de saisie dans le futur')
  const vals = {}
  for (const a of APPS) {
    const v = Math.round(Number(req.body[a] ?? 0))
    if (!Number.isFinite(v) || v < 0) return bad(res, `Valeur invalide pour ${a}`)
    if (v > MAX_MINUTES) return bad(res, 'Maximum 24h par appli')
    vals[a] = v
  }
  db.prepare(`
    INSERT INTO entries (user_id, day, tiktok, reels, twitter) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (user_id, day) DO UPDATE SET
      tiktok = excluded.tiktok, reels = excluded.reels, twitter = excluded.twitter, updated_at = datetime('now')
  `).run(req.user.id, day, vals.tiktok, vals.reels, vals.twitter)
  res.json({ day, ...vals })
})

// Mes saisies sur une période
app.get('/api/entries/me', auth, (req, res) => {
  const { from, to } = req.query
  if (!isDay(from) || !isDay(to)) return bad(res, 'Période invalide')
  const rows = db.prepare(
    'SELECT day, tiktok, reels, twitter FROM entries WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day'
  ).all(req.user.id, from, to)
  res.json(rows)
})

// Classement sur une période (from = to pour une journée)
app.get('/api/leaderboard', auth, (req, res) => {
  const { from, to, activeSince } = req.query
  if (!isDay(from) || !isDay(to)) return bad(res, 'Période invalide')
  if (activeSince && !isDay(activeSince)) return bad(res, 'Date invalide')

  const ranking = db.prepare(`
    SELECT u.id, u.name, u.avatar_v,
      COALESCE(SUM(e.tiktok), 0) AS tiktok,
      COALESCE(SUM(e.reels), 0) AS reels,
      COALESCE(SUM(e.twitter), 0) AS twitter,
      COALESCE(SUM(e.tiktok + e.reels + e.twitter), 0) AS total,
      COUNT(e.day) AS days,
      COUNT(CASE WHEN e.tiktok + e.reels + e.twitter > ${MAX_MINUTES} THEN 1 END) AS suspect_days,
      (SELECT MAX(day) FROM entries WHERE user_id = u.id AND day <= ?) AS last_day
    FROM users u
    LEFT JOIN entries e ON e.user_id = u.id AND e.day BETWEEN ? AND ?
    GROUP BY u.id
    ORDER BY total DESC, u.name
  `).all(to, from, to)

  // Palmarès : journées gagnées depuis le début, journée en cours exclue (winsBefore = aujourd'hui côté client)
  const winsBefore = isDay(req.query.winsBefore) ? req.query.winsBefore : '9999-12-31'
  const wins = db.prepare(`
    WITH totals AS (
      SELECT user_id, day, tiktok + reels + twitter AS t FROM entries WHERE day < ?
    ), best AS (
      SELECT day, MAX(t) AS m FROM totals GROUP BY day HAVING m > 0
    )
    SELECT t.user_id, COUNT(*) AS wins FROM totals t JOIN best b ON b.day = t.day AND b.m = t.t GROUP BY t.user_id
  `).all(winsBefore)
  const winMap = Object.fromEntries(wins.map((w) => [w.user_id, w.wins]))

  // On masque les inactifs (rien saisi depuis activeSince), sauf soi-même.
  // Pour une période terminée (ended=1), ceux qui y ont participé restent affichés.
  const ended = req.query.ended === '1'
  const visible = ranking.filter(
    (r) =>
      !activeSince || r.id === req.user.id || (ended && r.days > 0) || (r.last_day && r.last_day >= activeSince)
  )
  res.json(visible.map(({ last_day, ...r }) => ({ ...r, wins: winMap[r.id] || 0 })))
})

// Totaux journaliers de chacun sur une période (pour les graphes)
app.get('/api/series', auth, (req, res) => {
  const { from, to } = req.query
  if (!isDay(from) || !isDay(to)) return bad(res, 'Période invalide')
  res.json(db.prepare(`
    SELECT user_id, day, tiktok, reels, twitter, tiktok + reels + twitter AS total
    FROM entries WHERE day BETWEEN ? AND ? ORDER BY day
  `).all(from, to))
})

// En prod : sert le front buildé
const dist = path.join(__dirname, '..', 'client', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// Erreurs non prévues (JSON mal formé, contrainte SQL…) : toujours une réponse JSON
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return bad(res, 'JSON invalide')
  if (err.type === 'entity.too.large') return bad(res, 'Requête trop lourde', 413)
  if (String(err.code).startsWith('ERR_SQLITE') && /UNIQUE/.test(err.message)) return bad(res, 'Pseudo déjà pris', 409)
  console.error(err)
  bad(res, 'Erreur serveur', 500)
})

app.listen(PORT, () => console.log(`🚀 Scroll Competition API sur http://localhost:${PORT}`))
