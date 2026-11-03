import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  APPS, PALETTE, colorMap, toDay, addDays, monthBounds, mondayOf, dayLabel,
  fmt, fmtShort, niceMax, niceTicks, sanitizeDigits,
} from '../src/utils.js'

test('APPS : clés alignées sur le serveur, couleurs uniques', () => {
  assert.deepEqual(APPS.map((a) => a.key), ['tiktok', 'reels', 'twitter', 'youtube'])
  assert.equal(new Set(APPS.map((a) => a.hex)).size, APPS.length)
})

test('toDay / addDays : dates locales, passages de mois et d’année', () => {
  assert.equal(toDay(new Date(2026, 10, 3)), '2026-11-03')
  assert.equal(addDays('2026-11-30', 1), '2026-12-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addDays('2024-03-01', -1), '2024-02-29')
})

test('addDays ne saute pas de jour au changement d’heure', () => {
  assert.equal(addDays('2026-10-24', 1), '2026-10-25')
  assert.equal(addDays('2026-10-25', 1), '2026-10-26')
  assert.equal(addDays('2026-03-28', 1), '2026-03-29')
})

test('monthBounds : vrai dernier jour du mois (pas de 31 novembre)', () => {
  assert.deepEqual(monthBounds('2026-11-15'), ['2026-11-01', '2026-11-30'])
  assert.deepEqual(monthBounds('2026-02-10'), ['2026-02-01', '2026-02-28'])
  assert.deepEqual(monthBounds('2024-02-10'), ['2024-02-01', '2024-02-29'])
  assert.deepEqual(monthBounds('2026-12-31'), ['2026-12-01', '2026-12-31'])
})

test('mondayOf : lundi de la semaine (le dimanche appartient à la semaine qui finit)', () => {
  assert.equal(mondayOf('2026-11-02'), '2026-11-02') // lundi
  assert.equal(mondayOf('2026-11-05'), '2026-11-02') // jeudi
  assert.equal(mondayOf('2026-11-08'), '2026-11-02') // dimanche
  assert.equal(mondayOf('2027-01-01'), '2026-12-28') // à cheval sur l'année
})

test('dayLabel : libellés courts en français sans point', () => {
  assert.equal(dayLabel('2026-11-02'), 'lun')
  assert.equal(dayLabel('2026-11-02', true), 'lun 2 nov')
})

test('fmt / fmtShort', () => {
  assert.equal(fmt(0), '0 min')
  assert.equal(fmt(45), '45 min')
  assert.equal(fmt(60), '1h00')
  assert.equal(fmt(125), '2h05')
  assert.equal(fmt(1800), '30h00')
  assert.equal(fmtShort(15), '15m')
  assert.equal(fmtShort(60), '1h')
  assert.equal(fmtShort(90), '1h30')
})

test('niceMax / niceTicks : graduations rondes, au plus 5, qui couvrent la valeur (1 min → 400h)', () => {
  const round = [15, 30, 60, 120, 180, 240, 360, 480, 720]
  for (let m = 1; m <= 24000; m++) {
    const max = niceMax(m)
    const ticks = niceTicks(max)
    assert.ok(max >= m, `max ${max} < ${m}`)
    assert.equal(ticks[0], 0)
    assert.equal(ticks.at(-1), max, `dernière graduation ≠ max pour ${m}`)
    assert.ok(ticks.length >= 2 && ticks.length <= 5, `${ticks.length} graduations pour ${m}`)
    assert.ok(round.includes(ticks[1]) || ticks[1] % 1440 === 0, `pas non rond ${ticks[1]} pour ${m}`)
  }
})

test('sanitizeDigits : chiffres seulement, plafond', () => {
  assert.equal(sanitizeDigits('a1b2'), '12')
  assert.equal(sanitizeDigits('1h30'), '130')
  assert.equal(sanitizeDigits('99', 59), '59')
  assert.equal(sanitizeDigits('', 59), '')
  assert.equal(sanitizeDigits(null), '')
  assert.equal(sanitizeDigits('0042'), '0042')
})

test('colorMap : une couleur de la palette par personne', () => {
  const m = colorMap([{ id: 1 }, { id: 13 }, { id: 2 }])
  assert.ok(Object.values(m).every((c) => PALETTE.includes(c)))
  assert.equal(m[1], m[13]) // la palette boucle : pure déco, ok
})
