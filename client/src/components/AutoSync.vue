<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../api'

const status = ref({ hasKey: false, lastAutoAt: null })
const key = ref('') // affichée une seule fois, juste après la génération
const tab = ref('iphone')
const msg = ref({})
const copied = ref('')

const origin = window.location.origin
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
const k = computed(() => key.value || 'TA_CLÉ')

const IOS_APPS = [
  { app: 'tiktok', label: 'TikTok' },
  { app: 'instagram', label: 'Instagram', note: 'compte dans Reels' },
  { app: 'x', label: 'X (Twitter)' },
  { app: 'youtube', label: 'YouTube' },
]
const eventUrl = (app, event) => `${origin}/api/auto/event?app=${app}&event=${event}&key=${k.value}`
const APK_URL = '/scroll-compet.apk'
const apkAvailable = ref(true)
const setupLink = (key) => `scrollcompet://setup?url=${encodeURIComponent(origin)}&key=${encodeURIComponent(key)}`

const lastSync = computed(() => {
  if (!status.value.lastAutoAt) return null
  const d = new Date(`${status.value.lastAutoAt.replace(' ', 'T')}Z`) // datetime('now') SQLite = UTC
  return d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
})

onMounted(async () => {
  status.value = await api('/me/api-key').catch(() => status.value)
  // L'APK n'existe que si quelqu'un a lancé `npm run build:android`
  apkAvailable.value = await fetch(APK_URL, { method: 'HEAD' })
    .then((r) => r.ok && !String(r.headers.get('content-type')).includes('text/html'))
    .catch(() => false)
})

async function generate() {
  if (status.value.hasKey && !confirm("L'ancienne clé ne marchera plus : il faudra la remplacer dans tes automatisations. Continuer ?")) return
  msg.value = {}
  try {
    key.value = (await api('/me/api-key', { method: 'POST' })).key
    status.value = { hasKey: true, lastAutoAt: null }
  } catch (e) {
    msg.value = { err: e.message }
  }
}

// Ouvre l'appli Android avec l'adresse du site et la clé déjà remplies
async function connectAndroid() {
  if (!key.value) {
    const warning = status.value.hasKey
      ? "Ça va créer une nouvelle clé : l'ancienne arrêtera de marcher (ex. sur un iPhone). Continuer ?"
      : null
    if (warning && !confirm(warning)) return
    try {
      key.value = (await api('/me/api-key', { method: 'POST' })).key
      status.value = { hasKey: true, lastAutoAt: null }
    } catch (e) {
      return (msg.value = { err: e.message })
    }
  }
  window.location.href = setupLink(key.value)
}

async function revoke() {
  if (!confirm('Désactiver la saisie automatique ? Tes automatisations arrêteront de marcher.')) return
  try {
    await api('/me/api-key', { method: 'DELETE' })
    key.value = ''
    status.value = { hasKey: false, lastAutoAt: null }
  } catch (e) {
    msg.value = { err: e.message }
  }
}

// navigator.clipboard n'existe qu'en HTTPS / localhost : repli sur l'ancienne méthode
async function copy(text, id) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text })
    document.body.append(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  copied.value = id
  setTimeout(() => copied.value === id && (copied.value = ''), 1500)
}
</script>

<template>
  <section class="box">
    <div class="border-b-2 border-ink px-4 py-2 font-mono text-xs uppercase">Saisie automatique</div>

    <div class="space-y-3 px-4 py-4">
      <p class="text-sm leading-snug">
        Ton téléphone envoie tes temps tout seul, plus besoin de les taper.
        Il te faut une <b>clé perso</b> à coller dans tes automatisations.
      </p>

      <div class="flex flex-wrap items-center gap-3">
        <button class="btn bg-hi px-4 py-2 font-display text-sm uppercase" @click="generate">
          {{ status.hasKey ? 'Nouvelle clé' : 'Générer ma clé' }}
        </button>
        <button v-if="status.hasKey" class="font-mono text-xs underline underline-offset-4" @click="revoke">désactiver</button>
        <span v-if="status.hasKey" class="font-mono text-xs text-ink/60">
          {{ lastSync ? `dernière synchro : ${lastSync}` : 'jamais synchronisé' }}
        </span>
      </div>

      <div v-if="key" class="border-2 border-ink bg-hi/40 p-3">
        <div class="mb-1 font-mono text-[11px] uppercase">Ta clé — affichée une seule fois</div>
        <div class="flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate bg-white px-2 py-1 font-mono text-xs">{{ key }}</code>
          <button class="btn bg-white px-2 py-1 font-mono text-xs" @click="copy(key, 'key')">
            {{ copied === 'key' ? 'copié ✓' : 'copier' }}
          </button>
        </div>
        <p class="mt-1 font-mono text-[11px]">Les adresses ci-dessous la contiennent déjà. Ne la partage pas.</p>
      </div>
      <p v-else-if="status.hasKey" class="font-mono text-[11px] text-ink/60">
        Clé perdue ? Génère-en une nouvelle pour avoir les adresses pré-remplies.
      </p>

      <p v-if="isLocal" class="bg-ink px-2 py-1 font-mono text-[11px] text-hi">
        Tu es sur « localhost » : ton téléphone ne pourra pas joindre cette adresse. Ouvre l'appli via son adresse
        réseau (ex. http://192.168…:5173) ou une fois en ligne, puis reviens ici.
      </p>
      <p v-if="msg.err" class="bg-alert px-2 py-1 font-mono text-xs text-white">{{ msg.err }}</p>
    </div>

    <div class="flex border-t-2 border-ink font-mono text-xs uppercase">
      <button
        v-for="t in [{ k: 'iphone', l: 'iPhone' }, { k: 'android', l: 'Android' }]"
        :key="t.k"
        class="flex-1 py-2"
        :class="tab === t.k ? 'bg-ink text-white' : 'bg-white'"
        @click="tab = t.k"
      >
        {{ t.l }}
      </button>
    </div>

    <!-- iPhone : Raccourcis -->
    <div v-if="tab === 'iphone'" class="space-y-3 px-4 py-4 text-sm leading-snug">
      <p>Avec l'appli <b>Raccourcis</b> : une automatisation quand l'appli s'ouvre, une quand elle se ferme. Le serveur calcule le temps passé.</p>
      <ol class="list-decimal space-y-1 pl-5">
        <li>Raccourcis › <b>Automatisation</b> › <b>+</b> › <b>App</b>.</li>
        <li>Choisis l'appli, coche <b>Est ouverte</b> seulement, puis <b>Exécuter immédiatement</b>.</li>
        <li><b>Nouveau raccourci vide</b> › ajoute l'action <b>Obtenir le contenu de l'URL</b>.</li>
        <li>Colle l'adresse « ouverte » ci-dessous, déplie l'action et mets <b>Méthode : POST</b>.</li>
        <li>Refais pareil avec <b>Est fermée</b> et l'adresse « fermée ».</li>
      </ol>
      <p class="font-mono text-[11px] text-ink/60">À faire pour les 4 applis, donc 8 automatisations.</p>

      <div v-for="a in IOS_APPS" :key="a.app" class="border-2 border-ink">
        <div class="border-b-2 border-ink bg-paper px-3 py-1 font-bold">
          {{ a.label }} <span v-if="a.note" class="font-mono text-[11px] font-normal">({{ a.note }})</span>
        </div>
        <div v-for="ev in [{ e: 'open', l: 'ouverte' }, { e: 'close', l: 'fermée' }]" :key="ev.e" class="flex items-center gap-2 px-3 py-1.5">
          <span class="w-14 shrink-0 font-mono text-[11px] uppercase">{{ ev.l }}</span>
          <code class="min-w-0 flex-1 truncate font-mono text-[11px]">{{ eventUrl(a.app, ev.e) }}</code>
          <button class="shrink-0 border-2 border-ink px-2 font-mono text-[11px]" @click="copy(eventUrl(a.app, ev.e), a.app + ev.e)">
            {{ copied === a.app + ev.e ? '✓' : 'copier' }}
          </button>
        </div>
      </div>

      <ul class="list-disc space-y-1 pl-5 font-mono text-[11px] text-ink/70">
        <li>Les temps sont approximatifs : si une fermeture est ratée, la session est perdue (et ignorée au-delà de 4h).</li>
        <li>iOS affiche une petite notification à chaque déclenchement, c'est normal.</li>
        <li>Pour une appli suivie comme ça, l'automatique remplace ta saisie manuelle du jour.</li>
      </ul>
    </div>

    <!-- Android : mini appli maison -->
    <div v-else class="space-y-3 px-4 py-4 text-sm leading-snug">
      <p>
        Une petite appli qui lit le temps d'utilisation mesuré par Android et l'envoie ici toutes les 30 min.
        Temps exacts, rien à faire ensuite.
      </p>
      <ol class="list-decimal space-y-3 pl-5">
        <li>
          <b>Télécharge l'appli</b> depuis ce téléphone :
          <a
            v-if="apkAvailable"
            :href="APK_URL"
            download
            class="btn mt-2 block bg-hi py-2 text-center font-display text-sm uppercase"
          >Télécharger Scroll Compet (APK)</a>
          <span v-else class="mt-1 block bg-ink px-2 py-1 font-mono text-[11px] text-hi">
            APK pas encore publiée : lance <code>npm run build:android</code> sur le serveur.
          </span>
        </li>
        <li>
          <b>Installe-la.</b> Android va demander d'autoriser l'installation depuis ton navigateur
          (« sources inconnues ») : accepte, c'est normal pour une appli hors Play Store.
        </li>
        <li>
          <b>Connecte-la</b> : touche ce bouton, l'appli s'ouvre déjà configurée.
          <button class="btn mt-2 block w-full bg-ink py-2 font-display text-sm text-white uppercase" @click="connectAndroid">
            Connecter l'appli
          </button>
        </li>
        <li>Dans l'appli, touche <b>Ouvrir le réglage</b> et active <b>Scroll Compet</b> dans « Accès aux données d'utilisation ».</li>
      </ol>

      <details class="font-mono text-[11px]">
        <summary class="cursor-pointer underline underline-offset-4">Le bouton ne marche pas ? Connexion à la main</summary>
        <p class="mt-2">Dans l'appli, colle l'adresse du site et ta clé :</p>
        <div class="mt-1 flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate bg-paper px-1">{{ origin }}</code>
          <button class="shrink-0 border-2 border-ink px-2" @click="copy(origin, 'origin')">{{ copied === 'origin' ? '✓' : 'copier' }}</button>
        </div>
        <p class="mt-1">Clé : celle affichée en haut juste après « Générer ma clé ».</p>
      </details>

      <ul class="list-disc space-y-1 pl-5 font-mono text-[11px] text-ink/70">
        <li>Instagram compte dans Reels (Android ne sépare pas les Reels).</li>
        <li>Pour ces applis, l'automatique remplace ta saisie manuelle du jour.</li>
      </ul>
    </div>
  </section>
</template>
