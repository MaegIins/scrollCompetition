import { ref } from 'vue'
import { toDay, addDays, sanitizeDigits } from './utils.js'

export * from './utils.js'

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

// « Aujourd'hui » réactif : se met à jour après minuit ou au retour sur l'onglet,
// donc tous les computed qui appellent today() suivent.
const now = ref(toDay(new Date()))
const tick = () => (now.value = toDay(new Date()))
setInterval(tick, 60e3)
document.addEventListener('visibilitychange', tick)
export const today = () => now.value
export const prettyDay = (day) => {
  if (day === today()) return "Aujourd'hui"
  if (day === addDays(today(), -1)) return 'Hier'
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
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

// v-digits : n'accepte que des chiffres (frappe, collage, autocorrection). v-digits="59" plafonne la valeur.
export const vDigits = {
  mounted(el, binding) {
    // Frappe d'un caractère non numérique : bloquée net. Collage : nettoyé dans 'input'.
    el.addEventListener('beforeinput', (e) => {
      if (e.data?.length === 1 && /\D/.test(e.data)) e.preventDefault()
    })
    el.addEventListener('input', () => {
      const v = sanitizeDigits(el.value, binding.value)
      if (v !== el.value) {
        el.value = v
        el.dispatchEvent(new Event('input')) // resynchronise v-model avec la valeur nettoyée
      }
    })
  },
}
