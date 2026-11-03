<script setup>
import { ref, onMounted } from 'vue'
import { api, setToken } from '../api'

const emit = defineEmits(['logged'])
const mode = ref('login')
const name = ref('')
const pin = ref('')
const invite = ref('')
const inviteRequired = ref(false)
const error = ref('')
const loading = ref(false)

onMounted(async () => {
  inviteRequired.value = (await api('/config').catch(() => ({}))).inviteRequired
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const { token, user } = await api(`/${mode.value}`, {
      method: 'POST',
      body: { name: name.value, pin: pin.value, invite: invite.value },
    })
    setToken(token)
    emit('logged', user)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="box p-5">
    <div class="mb-5 flex gap-4 font-display text-lg uppercase">
      <button
        v-for="m in [{ k: 'login', l: 'Connexion' }, { k: 'register', l: 'Inscription' }]"
        :key="m.k"
        :class="mode === m.k ? 'bg-hi px-1' : 'text-ink/40'"
        @click="mode = m.k; error = ''"
      >
        {{ m.l }}
      </button>
    </div>

    <form class="space-y-4" @submit.prevent="submit">
      <label class="block">
        <span class="font-mono text-xs uppercase">Pseudo</span>
        <input v-model="name" autocomplete="username" class="field mt-1 w-full px-3 py-2 text-lg" />
      </label>
      <label class="block">
        <span class="font-mono text-xs uppercase">PIN</span>
        <input
          v-model="pin"
          v-digits
          type="password"
          inputmode="numeric"
          maxlength="8"
          autocomplete="current-password"
          class="field mt-1 w-full px-3 py-2 font-mono text-lg tracking-[.4em]"
        />
      </label>
      <label v-if="mode === 'register' && inviteRequired" class="block">
        <span class="font-mono text-xs uppercase">Code d'invitation</span>
        <input v-model="invite" class="field mt-1 w-full px-3 py-2 text-lg" />
      </label>
      <p v-if="error" class="bg-alert px-2 py-1 font-mono text-sm text-white">{{ error }}</p>
      <button :disabled="loading" class="btn w-full bg-ink py-3 font-display text-lg text-white uppercase disabled:opacity-50">
        {{ mode === 'login' ? 'Entrer' : 'Je rejoins' }}
      </button>
    </form>
  </div>
</template>
