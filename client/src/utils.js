// Fonctions pures, sans Vue ni navigateur : testables avec `node --test` (voir test/utils.test.js).

// Applis suivies. Pour en ajouter une : l'ajouter ici + dans APPS côté serveur (server/app.js) + sa couleur (style.css).
export const APPS = [
  { key: 'tiktok', label: 'TikTok', color: 'bg-tiktok', text: 'text-tiktok', hex: '#1aa6a1' },
  { key: 'reels', label: 'Reels', color: 'bg-reels', text: 'text-reels', hex: '#b5329a' },
  { key: 'twitter', label: 'Twitter', color: 'bg-twitter', text: 'text-twitter', hex: '#2f6fe4' },
  { key: 'youtube', label: 'YouTube', color: 'bg-youtube', text: 'text-youtube', hex: '#e8481e' },
]

// Palette des courbes : 12 couleurs ordonnées pour que deux voisines restent distinctes
// (validé daltonisme sur paires adjacentes). Attribuées à la sélection dans Stats.vue,
// on boucle au-delà de 12.
export const PALETTE = [
  '#e8442e', '#2f5bd8', '#e0a800', '#1a9a6c', '#9b3fc7', '#e0609e',
  '#0098b8', '#c0621a', '#5d4fd0', '#7c9a00', '#c2185b', '#3d8fe0',
]
// Couleur de fond des avatars sans photo : pure déco, peut se répéter
export const colorMap = (users) => Object.fromEntries(users.map((u) => [u.id, PALETTE[u.id % PALETTE.length]]))

// --- Dates locales au format YYYY-MM-DD --------------------------------------
export const toDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  return toDay(new Date(y, m - 1, d + n))
}
export const monthBounds = (day) => {
  const [y, m] = day.split('-').map(Number)
  return [toDay(new Date(y, m - 1, 1)), toDay(new Date(y, m, 0))]
}
export const mondayOf = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return addDays(day, -((date.getDay() + 6) % 7))
}

export const dayLabel = (day, long = false) => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return long
    ? date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
    : date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')
}

// --- Formats de durée (minutes) ----------------------------------------------
export const fmt = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}
export const fmtShort = (min) => {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
// Axe Y en minutes : graduations rondes (15 min, 30 min, 1h, 2h…), 5 max
const STEPS = [15, 30, 60, 120, 180, 240, 360, 480, 720]
// Au-delà de 48h : pas en multiples de 24h, toujours au plus 4 intervalles
const stepFor = (m) => STEPS.find((s) => m / s <= 4) ?? Math.ceil(m / 4 / 1440) * 1440
export const niceMax = (m) => Math.ceil(m / stepFor(m)) * stepFor(m)
export const niceTicks = (max) => {
  const step = stepFor(max - 1)
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)
}

// Nettoie une saisie numérique : garde les chiffres, plafonne à max (utilisé par v-digits)
export const sanitizeDigits = (value, max) => {
  let v = String(value ?? '').replace(/\D/g, '')
  if (max != null && v !== '' && Number(v) > max) v = String(max)
  return v
}
