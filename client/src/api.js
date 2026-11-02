import { ref } from 'vue'

let token = localStorage.getItem('token') || ''
// Appelé quand le serveur répond 401 sur une requête authentifiée (session expirée / révoquée)
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn)

export const setToken = (t) => {
  token = t || ''
  t ? localStorage.setItem('token', t) : localStorage.removeItem('token')
}
export const hasToken = () => !!token

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken('')
      onUnauthorized()
    }
    throw Object.assign(new Error(data.error || 'Erreur serveur'), { status: res.status })
  }
  return data
}

// Dates locales au format YYYY-MM-DD
export const toDay = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const addDays = (day, n) => {
  const [y, m, d] = day.split('-').map(Number)
  return toDay(new Date(y, m - 1, d + n))
}
// « Aujourd'hui » réactif : se met à jour après minuit ou au retour sur l'onglet,
// donc tous les computed qui appellent today() suivent.
const now = ref(toDay(new Date()))
const tick = () => (now.value = toDay(new Date()))
setInterval(tick, 60e3)
document.addEventListener('visibilitychange', tick)
export const today = () => now.value
export const monthBounds = (day) => {
  const [y, m] = day.split('-').map(Number)
  return [toDay(new Date(y, m - 1, 1)), toDay(new Date(y, m, 0))]
}
export const mondayOf = (day) => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return addDays(day, -((date.getDay() + 6) % 7))
}

export const fmt = (min) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`
}
export const prettyDay = (day) => {
  if (day === today()) return "Aujourd'hui"
  if (day === addDays(today(), -1)) return 'Hier'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export const APPS = [
  { key: 'tiktok', label: 'TikTok', color: 'bg-tiktok', text: 'text-tiktok', hex: '#1a9a6c' },
  { key: 'reels', label: 'Reels', color: 'bg-reels', text: 'text-reels', hex: '#e8442e' },
  { key: 'twitter', label: 'Twitter', color: 'bg-twitter', text: 'text-twitter', hex: '#2f5bd8' },
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

export const fmtShort = (min) => {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
export const dayLabel = (day, long = false) => {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return long
    ? date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
    : date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')
}

// Recadre au carré + redimensionne côté client avant envoi
export async function resizeImage(file, size = 192) {
  const img = await createImageBitmap(file)
  const s = Math.min(img.width, img.height)
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // JPEG n'a pas de transparence : fond blanc plutôt que noir
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', 0.85)
}

// Axe Y en minutes : graduations rondes (15 min, 30 min, 1h, 2h…), 5 max
const STEPS = [15, 30, 60, 120, 180, 240, 360, 480, 720]
const stepFor = (m) => STEPS.find((s) => m / s <= 4) ?? 1440
export const niceMax = (m) => Math.ceil(m / stepFor(m)) * stepFor(m)
export const niceTicks = (max) => {
  const step = stepFor(max - 1)
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step)
}

// v-digits : n'accepte que des chiffres (frappe, collage, autocorrection). v-digits="59" plafonne la valeur.
export const vDigits = {
  mounted(el, binding) {
    // Frappe d'un caractère non numérique : bloquée net. Collage : nettoyé dans 'input'.
    el.addEventListener('beforeinput', (e) => {
      if (e.data?.length === 1 && /\D/.test(e.data)) e.preventDefault()
    })
    el.addEventListener('input', () => {
      let v = el.value.replace(/\D/g, '')
      const max = binding.value
      if (max != null && v !== '' && Number(v) > max) v = String(max)
      if (v !== el.value) {
        el.value = v
        el.dispatchEvent(new Event('input')) // resynchronise v-model avec la valeur nettoyée
      }
    })
  },
}
