<script setup>
// Bandeau affiché uniquement dans l'appli Android tant que la synchro auto n'est pas prête.
// Dans un navigateur (iPhone compris), ce composant ne rend rien.
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { api, nativeApp, connectAndroidApp } from '../api'

const state = ref('ready') // 'ready' | 'no-key' | 'no-permission'
const error = ref('')
const busy = ref(false)

const refresh = () => {
  if (!nativeApp) return
  state.value = !nativeApp.hasKey() ? 'no-key' : !nativeApp.isConnected() ? 'no-permission' : 'ready'
}
onMounted(() => {
  refresh()
  window.addEventListener('scrollapp-change', refresh) // envoyé par l'appli après configuration
})
onBeforeUnmount(() => window.removeEventListener('scrollapp-change', refresh))

async function activate() {
  error.value = ''
  busy.value = true
  try {
    const { hasKey } = await api('/me/api-key')
    await connectAndroidApp({ hasKey })
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="nativeApp && state !== 'ready'" class="box bg-hi p-4">
    <template v-if="state === 'no-key'">
      <p class="font-display text-lg leading-tight uppercase">Plus besoin de taper tes temps</p>
      <p class="mt-1 text-sm">L'appli peut envoyer ton temps TikTok, Instagram, X et YouTube toute seule.</p>
      <button
        :disabled="busy"
        class="btn mt-3 w-full bg-ink py-2 font-display text-sm text-white uppercase disabled:opacity-50"
        @click="activate"
      >
        Activer la synchro auto
      </button>
    </template>
    <template v-else>
      <p class="font-display text-lg leading-tight uppercase">Encore une étape</p>
      <p class="mt-1 text-sm">Android doit autoriser l'appli à lire ton temps d'utilisation.</p>
      <button class="btn mt-3 w-full bg-ink py-2 font-display text-sm text-white uppercase" @click="nativeApp.openSync()">
        Donner l'autorisation
      </button>
    </template>
    <p v-if="error" class="mt-2 bg-alert px-2 py-1 font-mono text-xs text-white">{{ error }}</p>
  </div>
</template>
