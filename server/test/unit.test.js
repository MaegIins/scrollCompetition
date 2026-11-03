import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDay, checkName, dayInTz, nextMidnight, splitByDay } from '../app.js'

const TZ = 'Europe/Paris'
const at = (s) => Date.parse(s)

test('isDay accepte les vraies dates YYYY-MM-DD', () => {
  assert.ok(isDay('2026-11-03'))
  assert.ok(isDay('2024-02-29')) // bissextile
})

test('isDay rejette les dates impossibles ou mal formées', () => {
  for (const s of ['2026-13-01', '2026-02-30', '2025-02-29', '2026-1-3', '03/11/2026', '', null, undefined, 20261103]) {
    assert.equal(isDay(s), false, String(s))
  }
})

test('checkName : 2 à 20 caractères', () => {
  assert.equal(checkName('Al'), null)
  assert.equal(checkName('x'.repeat(20)), null)
  assert.ok(checkName('A'))
  assert.ok(checkName('x'.repeat(21)))
  assert.ok(checkName('Bo\nb'))
  assert.ok(checkName('Bo\tb'))
  assert.equal(checkName('Léa 🔥'), null)
})

test('dayInTz donne le jour local du fuseau, pas le jour UTC', () => {
  // 23h30 UTC le 2 novembre = 0h30 le 3 à Paris
  assert.equal(dayInTz(at('2026-11-02T23:30:00Z'), TZ), '2026-11-03')
  assert.equal(dayInTz(at('2026-11-02T23:30:00Z'), 'UTC'), '2026-11-02')
})

test('nextMidnight tombe pile sur minuit heure de Paris (hiver et été)', () => {
  assert.equal(new Date(nextMidnight(at('2026-11-03T15:00:00+01:00'), TZ)).toISOString(), '2026-11-03T23:00:00.000Z')
  assert.equal(new Date(nextMidnight(at('2026-07-14T09:00:00+02:00'), TZ)).toISOString(), '2026-07-14T22:00:00.000Z')
})

test('splitByDay : session dans la journée', () => {
  assert.deepEqual(splitByDay(at('2026-11-03T10:00:00+01:00'), at('2026-11-03T10:30:00+01:00'), TZ), { '2026-11-03': 1800 })
})

test('splitByDay : session à cheval sur minuit', () => {
  assert.deepEqual(splitByDay(at('2026-11-02T23:50:00+01:00'), at('2026-11-03T00:15:00+01:00'), TZ), {
    '2026-11-02': 600,
    '2026-11-03': 900,
  })
})

test('splitByDay : nuit du passage à l’heure d’hiver (4h réelles)', () => {
  assert.deepEqual(splitByDay(at('2026-10-24T23:00:00+02:00'), at('2026-10-25T02:00:00+01:00'), TZ), {
    '2026-10-24': 3600,
    '2026-10-25': 10800,
  })
})

test('splitByDay : session vide', () => {
  const t = at('2026-11-03T10:00:00+01:00')
  assert.deepEqual(splitByDay(t, t, TZ), {})
})
