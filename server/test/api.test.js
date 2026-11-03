import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from '../app.js'
import { start } from './helpers.js'

let s
beforeEach(async () => (s = await start()))
afterEach(() => s.stop())

// Petit PNG 1×1 valide
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

describe('inscription / connexion', () => {
  test('inscription puis /me', async () => {
    const { token } = await s.register('Bob')
    const me = await s.call('GET', '/me', { token })
    assert.equal(me.status, 200)
    assert.equal(me.body.user.name, 'Bob')
  })

  test('pseudo déjà pris (insensible à la casse)', async () => {
    await s.register('Bob')
    const r = await s.call('POST', '/register', { body: { name: 'bob', pin: '1234' } })
    assert.equal(r.status, 409)
  })

  test('pseudo avec caractères de contrôle refusé (inscription et changement)', async () => {
    assert.equal((await s.call('POST', '/register', { body: { name: 'Bo\nb', pin: '1234' } })).status, 400)
    const { token } = await s.register('Bob')
    assert.equal((await s.call('PATCH', '/me', { token, body: { name: 'Bo\u0000b' } })).status, 400)
  })

  test('validation pseudo et PIN', async () => {
    assert.equal((await s.call('POST', '/register', { body: { name: 'B', pin: '1234' } })).status, 400)
    assert.equal((await s.call('POST', '/register', { body: { name: 'Bob', pin: '12' } })).status, 400)
    assert.equal((await s.call('POST', '/register', { body: { name: 'Bob', pin: 'abcd' } })).status, 400)
  })

  test('connexion OK, mauvais PIN, pseudo inconnu', async () => {
    await s.register('Bob', '1234')
    assert.equal((await s.call('POST', '/login', { body: { name: 'Bob', pin: '1234' } })).status, 200)
    const wrong = await s.call('POST', '/login', { body: { name: 'Bob', pin: '0000' } })
    const unknown = await s.call('POST', '/login', { body: { name: 'Nobody', pin: '0000' } })
    assert.equal(wrong.status, 401)
    assert.equal(unknown.status, 401)
    assert.equal(wrong.body.error, unknown.body.error) // même message : on ne révèle pas quels pseudos existent
  })

  test('blocage après 5 PIN faux, même avec le bon PIN', async () => {
    await s.register('Bob', '1234')
    for (let i = 0; i < 5; i++) assert.equal((await s.call('POST', '/login', { body: { name: 'Bob', pin: '0000' } })).status, 401)
    const locked = await s.call('POST', '/login', { body: { name: 'Bob', pin: '1234' } })
    assert.equal(locked.status, 429)
    assert.match(locked.body.error, /Trop d'essais/)
  })

  test('déconnexion invalide le token', async () => {
    const { token } = await s.register('Bob')
    await s.call('POST', '/logout', { token })
    assert.equal((await s.call('GET', '/me', { token })).status, 401)
  })

  test("code d'invitation requis quand configuré", async () => {
    const s2 = await start({ inviteCode: 'secret' })
    try {
      assert.deepEqual((await s2.call('GET', '/config')).body, { inviteRequired: true })
      assert.equal((await s2.call('POST', '/register', { body: { name: 'Bob', pin: '1234' } })).status, 403)
      assert.equal((await s2.call('POST', '/register', { body: { name: 'Bob', pin: '1234', invite: 'secret' } })).status, 200)
    } finally {
      await s2.stop()
    }
  })
})

describe('robustesse', () => {
  test('requête sans corps → 400 en JSON, pas 500', async () => {
    const r = await s.call('POST', '/login')
    assert.equal(r.status, 401)
    assert.equal(typeof r.body.error, 'string')
  })

  test('JSON mal formé → 400 JSON invalide', async () => {
    const r = await s.call('POST', '/login', { raw: '{oops' })
    assert.equal(r.status, 400)
    assert.equal(r.body.error, 'JSON invalide')
  })

  test('routes protégées sans token → 401', async () => {
    for (const p of ['/me', '/users', '/leaderboard?from=2026-11-01&to=2026-11-03', '/entries/me?from=2026-11-01&to=2026-11-03']) {
      assert.equal((await s.call('GET', p)).status, 401, p)
    }
  })
})

describe('saisies', () => {
  test('saisir, relire, modifier (upsert)', async () => {
    const { token } = await s.register('Bob')
    await s.enter(token, '2026-11-03', { tiktok: 60, reels: 30 })
    await s.enter(token, '2026-11-03', { tiktok: 90, youtube: 10 })
    const r = await s.call('GET', '/entries/me?from=2026-11-03&to=2026-11-03', { token })
    assert.deepEqual(r.body, [{ day: '2026-11-03', tiktok: 90, reels: 0, twitter: 0, youtube: 10 }])
  })

  test('dates invalides et futur refusés, demain toléré (fuseaux)', async () => {
    const { token } = await s.register('Bob')
    assert.equal((await s.enter(token, '2026-02-30', { tiktok: 1 })).status, 400)
    assert.equal((await s.enter(token, '2026-11-10', { tiktok: 1 })).body.error, 'Pas de saisie dans le futur')
    assert.equal((await s.enter(token, '2026-11-04', { tiktok: 1 })).status, 200)
  })

  test('valeurs négatives, non numériques, > 24h par appli refusées', async () => {
    const { token } = await s.register('Bob')
    assert.equal((await s.enter(token, '2026-11-03', { tiktok: -5 })).status, 400)
    assert.equal((await s.enter(token, '2026-11-03', { tiktok: 'abc' })).status, 400)
    assert.equal((await s.enter(token, '2026-11-03', { tiktok: 1441 })).body.error, 'Maximum 24h par appli')
  })

  test('plus de 24h au total accepté (marqué suspect, pas bloqué)', async () => {
    const { token } = await s.register('Bob')
    assert.equal((await s.enter(token, '2026-11-03', { tiktok: 1000, reels: 1000 })).status, 200)
  })
})

describe('classement', () => {
  test('tri par total, détail par appli, jours suspects', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    await s.enter(a.token, '2026-11-03', { tiktok: 30 })
    await s.enter(b.token, '2026-11-03', { reels: 1000, youtube: 500 }) // 25h → suspect
    const r = await s.call('GET', '/leaderboard?from=2026-11-03&to=2026-11-03', { token: a.token })
    assert.deepEqual(r.body.map((x) => [x.name, x.total, x.suspect_days]), [['Bob', 1500, 1], ['Alice', 30, 0]])
    assert.equal(r.body[0].youtube, 500)
  })

  test('victoires : journées passées seulement, ex æquo gagnent tous les deux', async () => {
    const a = await s.register('Alice')
    const b = await s.register('Bob')
    await s.enter(a.token, '2026-11-01', { tiktok: 50 })
    await s.enter(b.token, '2026-11-01', { tiktok: 50 }) // égalité
    await s.enter(a.token, '2026-11-02', { tiktok: 10 })
    await s.enter(b.token, '2026-11-02', { tiktok: 99 })
    await s.enter(a.token, '2026-11-03', { tiktok: 500 }) // aujourd'hui : pas encore une victoire
    const r = await s.call('GET', '/leaderboard?from=2026-11-03&to=2026-11-03&winsBefore=2026-11-03', { token: a.token })
    const wins = Object.fromEntries(r.body.map((x) => [x.name, x.wins]))
    assert.deepEqual(wins, { Alice: 1, Bob: 2 })
  })

  test('une journée à 0 pour tout le monde ne donne de victoire à personne', async () => {
    const a = await s.register('Alice')
    await s.enter(a.token, '2026-11-01', {})
    const r = await s.call('GET', '/leaderboard?from=2026-11-01&to=2026-11-03&winsBefore=2026-11-03', { token: a.token })
    assert.equal(r.body[0].wins, 0)
  })

  test('inactifs depuis 7 jours masqués, sauf moi ; période terminée = participants visibles', async () => {
    const me = await s.register('Moi')
    const active = await s.register('Actif')
    const ghost = await s.register('Fantome')
    await s.enter(active.token, '2026-11-01', { tiktok: 10 })
    await s.enter(ghost.token, '2026-10-15', { tiktok: 10 })
    const now = await s.call('GET', '/leaderboard?from=2000-01-01&to=2026-11-03&activeSince=2026-10-27&ended=0', { token: me.token })
    assert.deepEqual(now.body.map((x) => x.name).sort(), ['Actif', 'Moi'])
    // Le 15 octobre (période terminée) : le fantôme y a participé, il apparaît
    const past = await s.call('GET', '/leaderboard?from=2026-10-15&to=2026-10-15&activeSince=2026-10-08&ended=1', { token: me.token })
    assert.ok(past.body.some((x) => x.name === 'Fantome'))
  })

  test('période invalide refusée', async () => {
    const { token } = await s.register('Bob')
    assert.equal((await s.call('GET', '/leaderboard?from=2026-11-01&to=2026-11-31', { token })).status, 400)
  })

  test('séries journalières pour les graphes', async () => {
    const a = await s.register('Alice')
    await s.enter(a.token, '2026-11-02', { tiktok: 10, twitter: 5 })
    const r = await s.call('GET', '/series?from=2026-11-01&to=2026-11-03', { token: a.token })
    assert.deepEqual(r.body, [{ user_id: a.id, day: '2026-11-02', tiktok: 10, reels: 0, twitter: 5, youtube: 0, total: 15 }])
  })
})

describe('profil', () => {
  test('changer de pseudo (pris / OK)', async () => {
    const { token } = await s.register('Bob')
    await s.register('Alice')
    assert.equal((await s.call('PATCH', '/me', { token, body: { name: 'alice' } })).status, 409)
    assert.equal((await s.call('PATCH', '/me', { token, body: { name: 'Bobby' } })).body.user.name, 'Bobby')
  })

  test('changer de PIN déconnecte les autres appareils', async () => {
    const { token } = await s.register('Bob', '1234')
    const other = (await s.call('POST', '/login', { body: { name: 'Bob', pin: '1234' } })).body.token
    assert.equal((await s.call('PUT', '/me/pin', { token, body: { current: '0000', next: '5555' } })).status, 403)
    assert.equal((await s.call('PUT', '/me/pin', { token, body: { current: '1234', next: '5555' } })).status, 200)
    assert.equal((await s.call('GET', '/me', { token })).status, 200)
    assert.equal((await s.call('GET', '/me', { token: other })).status, 401)
    assert.equal((await s.call('POST', '/login', { body: { name: 'Bob', pin: '5555' } })).status, 200)
  })

  test('photo : envoi, lecture publique en cache, suppression', async () => {
    const { token, id } = await s.register('Bob')
    assert.equal((await s.call('PUT', '/me/avatar', { token, body: { dataUrl: 'javascript:alert(1)' } })).status, 400)
    const up = await s.call('PUT', '/me/avatar', { token, body: { dataUrl: PNG } })
    assert.ok(up.body.avatar_v > 0)
    const img = await s.call('GET', `/avatar/${id}`)
    assert.equal(img.status, 200)
    assert.equal(img.headers.get('content-type'), 'image/png')
    assert.match(img.headers.get('cache-control'), /immutable/)
    await s.call('DELETE', '/me/avatar', { token })
    assert.equal((await s.call('GET', `/avatar/${id}`)).status, 404)
  })
})

describe('saisie automatique', () => {
  const setup = async () => {
    const user = await s.register('Bob')
    const { key } = (await s.call('POST', '/me/api-key', { token: user.token })).body
    return { ...user, key }
  }
  const today = (token) => s.call('GET', '/entries/me?from=2026-11-03&to=2026-11-03', { token }).then((r) => r.body[0])

  test('clé : format, statut, dernière synchro', async () => {
    const { token, key } = await setup()
    assert.match(key, /^sc_[0-9a-f]{40}$/)
    assert.deepEqual((await s.call('GET', '/me/api-key', { token })).body, { hasKey: true, lastAutoAt: null })
    await s.call('POST', '/auto/usage', { token: key, body: { tiktok: 60 } })
    assert.ok((await s.call('GET', '/me/api-key', { token })).body.lastAutoAt)
  })

  test('la clé est stockée hachée', async () => {
    const { key } = await setup()
    const row = s.db.prepare('SELECT api_key_hash FROM users').get()
    assert.notEqual(row.api_key_hash, key)
    assert.equal(row.api_key_hash.length, 64)
  })

  test('Android : secondes → minutes, alias instagram/x, mise à jour partielle', async () => {
    const { token, key } = await setup()
    const r = await s.call('POST', '/auto/usage', { token: key, body: { tiktok: 3725, instagram: 1200, x: 61, youtube: 900 } })
    assert.deepEqual(r.body, { day: '2026-11-03', minutes: { tiktok: 62, reels: 20, twitter: 1, youtube: 15 } })
    await s.call('POST', '/auto/usage', { token: key, body: { youtube: 1800 } })
    assert.deepEqual(await today(token), { day: '2026-11-03', tiktok: 62, reels: 20, twitter: 1, youtube: 30 })
  })

  test('Android : jour par défaut = jour à Paris (pas UTC)', async () => {
    const { key } = await setup()
    s.clock.t = Date.parse('2026-11-03T00:30:00+01:00') // 23h30 UTC le 2
    assert.equal((await s.call('POST', '/auto/usage', { token: key, body: { tiktok: 60 } })).body.day, '2026-11-03')
  })

  test('Android : erreurs (clé invalide, token de session, appli inconnue, valeur folle)', async () => {
    const { token, key } = await setup()
    assert.equal((await s.call('POST', '/auto/usage', { token: 'sc_nope', body: { tiktok: 1 } })).status, 401)
    assert.equal((await s.call('POST', '/auto/usage', { token, body: { tiktok: 1 } })).status, 401)
    assert.equal((await s.call('POST', '/auto/usage', { token: key, body: { snapchat: 1 } })).status, 400)
    assert.equal((await s.call('POST', '/auto/usage', { token: key, body: { tiktok: 90000 } })).status, 400)
    assert.equal((await s.call('POST', '/auto/usage', { token: key, body: { tiktok: 1, day: '2026-12-25' } })).status, 400)
  })

  test('iPhone : ouverture puis fermeture = durée de la session (clé dans l’URL)', async () => {
    const { token, key } = await setup()
    await s.call('POST', `/auto/event?app=tiktok&event=open&key=${key}`)
    s.clock.t += 25 * 60e3
    const r = await s.call('POST', `/auto/event?app=tiktok&event=close&key=${key}`)
    assert.deepEqual(r.body.added, { '2026-11-03': 1500 })
    assert.equal((await today(token)).tiktok, 25)
  })

  test('iPhone : les sessions s’additionnent (secondes cumulées, pas minutes arrondies)', async () => {
    const { token, key } = await setup()
    for (let i = 0; i < 4; i++) {
      await s.call('POST', `/auto/event?app=instagram&event=open&key=${key}`)
      s.clock.t += 40e3 // 40 s : arrondi à 1 min chacune, mais 4 × 40 s = 2 min 40 → 3
      await s.call('POST', `/auto/event?app=instagram&event=close&key=${key}`)
    }
    assert.equal((await today(token)).reels, 3)
  })

  test('iPhone : fermeture sans ouverture ignorée, session > 4h ignorée', async () => {
    const { token, key } = await setup()
    assert.ok((await s.call('POST', `/auto/event?app=x&event=close&key=${key}`)).body.ignored)
    await s.call('POST', `/auto/event?app=x&event=open&key=${key}`)
    s.clock.t += 5 * 3600e3
    assert.equal((await s.call('POST', `/auto/event?app=x&event=close&key=${key}`)).body.ignored, 'session trop longue')
    assert.equal(await today(token), undefined)
  })

  test('iPhone : session à cheval sur minuit répartie sur les deux jours', async () => {
    const { token, key } = await setup()
    s.clock.t = Date.parse('2026-11-02T23:50:00+01:00')
    await s.call('POST', `/auto/event?app=youtube&event=open&key=${key}`)
    s.clock.t = Date.parse('2026-11-03T00:20:00+01:00')
    const r = await s.call('POST', `/auto/event?app=youtube&event=close&key=${key}`)
    assert.deepEqual(r.body.added, { '2026-11-02': 600, '2026-11-03': 1200 })
    const both = (await s.call('GET', '/entries/me?from=2026-11-02&to=2026-11-03', { token })).body
    assert.deepEqual(both.map((e) => [e.day, e.youtube]), [['2026-11-02', 10], ['2026-11-03', 20]])
  })

  test('clé passée deux fois dans l’URL : 401, pas de crash', async () => {
    const { key } = await setup()
    const r = await s.call('POST', `/auto/event?app=tiktok&event=open&key=${key}&key=${key}`)
    assert.equal(r.status, 401)
  })

  test('iPhone : paramètres invalides', async () => {
    const { key } = await setup()
    assert.equal((await s.call('POST', `/auto/event?app=snap&event=open&key=${key}`)).status, 400)
    assert.equal((await s.call('POST', `/auto/event?app=tiktok&event=pause&key=${key}`)).status, 400)
  })

  test('nouvelle clé : l’ancienne ne marche plus ; désactivation', async () => {
    const { token, key } = await setup()
    const { key: key2 } = (await s.call('POST', '/me/api-key', { token })).body
    assert.equal((await s.call('POST', '/auto/usage', { token: key, body: { tiktok: 1 } })).status, 401)
    assert.equal((await s.call('POST', '/auto/usage', { token: key2, body: { tiktok: 1 } })).status, 200)
    await s.call('DELETE', '/me/api-key', { token })
    assert.equal((await s.call('POST', '/auto/usage', { token: key2, body: { tiktok: 1 } })).status, 401)
  })
})

describe('migrations', () => {
  test('ancienne base avec la colonne shorts : renommée en twitter, youtube ajouté, données gardées', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scroll-test-'))
    const file = path.join(dir, 'old.db')
    const old = new DatabaseSync(file)
    old.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pin_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE entries (user_id INTEGER NOT NULL, day TEXT NOT NULL, tiktok INTEGER NOT NULL DEFAULT 0,
        reels INTEGER NOT NULL DEFAULT 0, shorts INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, day));
      INSERT INTO users (name, pin_hash) VALUES ('Vieux', 'x:y');
      INSERT INTO entries (user_id, day, tiktok, shorts) VALUES (1, '2026-10-01', 10, 42);
    `)
    old.close()
    const { db, close } = createApp({ dbPath: file })
    try {
      const cols = db.prepare('PRAGMA table_info(entries)').all().map((c) => c.name)
      assert.ok(cols.includes('twitter') && cols.includes('youtube') && !cols.includes('shorts'))
      assert.deepEqual({ ...db.prepare('SELECT tiktok, twitter, youtube FROM entries').get() }, { tiktok: 10, twitter: 42, youtube: 0 })
      const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
      assert.ok(['avatar', 'avatar_v', 'api_key_hash', 'last_auto_at'].every((c) => ucols.includes(c)))
    } finally {
      close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
