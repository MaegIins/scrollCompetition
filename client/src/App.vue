<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { api, setToken, hasToken, today, colorMap, setUnauthorizedHandler } from './api'
import AuthCard from './components/AuthCard.vue'
import Avatar from './components/Avatar.vue'
import EntryForm from './components/EntryForm.vue'
import Leaderboard from './components/Leaderboard.vue'
import Stats from './components/Stats.vue'
import ProfilePage from './components/ProfilePage.vue'

const me = ref(null)
const ready = ref(false)
const view = ref('home') // 'home' | 'profile'
const day = ref(today())
const refreshKey = ref(0)
const users = ref([])
const colors = computed(() => colorMap(users.value))

// Session expirée ou révoquée (PIN changé ailleurs) : retour à l'écran de connexion
setUnauthorizedHandler(() => {
  me.value = null
  view.value = 'home'
})

// Passage de minuit, l'appli ouverte : on suit le nouveau jour et on recharge
watch(today, (now, before) => {
  if (day.value === before) day.value = now
  refreshKey.value++
})

onMounted(async () => {
  if (hasToken()) me.value = (await api('/me').catch(() => ({}))).user || null
  ready.value = true
})

async function loadUsers() {
  users.value = await api('/users').catch(() => [])
}
watch([() => me.value?.id, refreshKey], () => me.value && loadUsers(), { immediate: true })

function onProfileUpdate(user) {
  me.value = user
  refreshKey.value++
}

function goto(v) {
  view.value = v
  window.scrollTo({ top: 0 })
}

async function logout() {
  await api('/logout', { method: 'POST' }).catch(() => {})
  setToken('')
  me.value = null
  view.value = 'home'
}
</script>

<template>
  <div class="min-h-screen px-4 pb-16">
    <header class="mx-auto max-w-lg border-b-2 border-ink pt-8 pb-3">
      <div class="flex items-end justify-between gap-4">
        <button class="text-left" @click="goto('home')">
          <h1 class="font-display text-4xl leading-[.85] uppercase sm:text-5xl">
            Scroll<br /><span class="bg-hi px-1">Compet</span>
          </h1>
        </button>
        <div v-if="me" class="flex items-end gap-3">
          <div class="text-right font-mono text-xs leading-5">
            <div class="font-bold">{{ me.name }}</div>
            <button class="underline underline-offset-4" @click="goto('profile')">profil</button>
            ·
            <button class="underline underline-offset-4" @click="logout">quitter</button>
          </div>
          <button title="Mon profil" @click="goto('profile')">
            <Avatar :user="me" :color="colors[me.id]" :size="48" />
          </button>
        </div>
      </div>
    </header>
    <p class="mx-auto mb-6 max-w-lg pt-2 font-mono text-xs uppercase">
      Le plus gros scrolleur de la journée gagne. Rien à gagner.
    </p>

    <main v-if="ready" class="mx-auto max-w-lg space-y-8">
      <template v-if="!me">
        <AuthCard @logged="me = $event" />
      </template>
      <ProfilePage
        v-else-if="view === 'profile'"
        :me="me"
        :color="colors[me.id]"
        @update="onProfileUpdate"
        @back="goto('home')"
      />
      <template v-else>
        <EntryForm v-model:day="day" @saved="refreshKey++" />
        <Leaderboard :day="day" :me="me" :colors="colors" :refresh-key="refreshKey" />
        <Stats :users="users" :colors="colors" :me="me" :refresh-key="refreshKey" />
        <p class="font-mono text-[11px] leading-relaxed text-ink/60">
          Tes temps sont dans Réglages › Temps d'écran (iPhone) ou Bien-être numérique (Android).
        </p>
      </template>
    </main>
  </div>
</template>
