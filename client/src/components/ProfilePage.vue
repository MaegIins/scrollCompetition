<script setup>
import { ref } from 'vue'
import { api, resizeImage } from '../api'
import Avatar from './Avatar.vue'
import AutoSync from './AutoSync.vue'

const props = defineProps({ me: Object, color: String })
const emit = defineEmits(['update', 'back'])

const fileInput = ref(null)
const avatarMsg = ref({})
const name = ref(props.me.name)
const nameMsg = ref({})
const pin = ref({ current: '', next: '', confirm: '' })
const pinMsg = ref({})

async function onAvatar(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  avatarMsg.value = {}
  try {
    const { avatar_v } = await api('/me/avatar', { method: 'PUT', body: { dataUrl: await resizeImage(file) } })
    emit('update', { ...props.me, avatar_v })
    avatarMsg.value = { ok: 'Photo mise à jour' }
  } catch (err) {
    avatarMsg.value = { err: err.message || 'Image illisible' }
  }
}

async function removeAvatar() {
  avatarMsg.value = {}
  try {
    await api('/me/avatar', { method: 'DELETE' })
    emit('update', { ...props.me, avatar_v: 0 })
    avatarMsg.value = { ok: 'Photo supprimée' }
  } catch (e) {
    avatarMsg.value = { err: e.message }
  }
}

async function saveName() {
  nameMsg.value = {}
  try {
    const { user } = await api('/me', { method: 'PATCH', body: { name: name.value } })
    emit('update', { ...props.me, name: user.name })
    nameMsg.value = { ok: 'Pseudo changé' }
  } catch (e) {
    nameMsg.value = { err: e.message }
  }
}

async function savePin() {
  pinMsg.value = {}
  if (pin.value.next !== pin.value.confirm) return (pinMsg.value = { err: 'Les deux PIN ne correspondent pas' })
  try {
    await api('/me/pin', { method: 'PUT', body: { current: pin.value.current, next: pin.value.next } })
    pin.value = { current: '', next: '', confirm: '' }
    pinMsg.value = { ok: 'PIN changé. Tes autres appareils sont déconnectés.' }
  } catch (e) {
    pinMsg.value = { err: e.message }
  }
}
</script>

<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <h2 class="font-display text-2xl uppercase">Mon profil</h2>
      <button class="font-mono text-xs underline underline-offset-4" @click="emit('back')">← retour</button>
    </div>

    <section class="box">
      <div class="border-b-2 border-ink px-4 py-2 font-mono text-xs uppercase">Photo</div>
      <div class="flex items-center gap-4 px-4 py-4">
        <Avatar :user="me" :color="color" :size="88" />
        <div class="flex flex-col items-start gap-2">
          <button class="btn bg-hi px-4 py-2 font-display text-sm uppercase" @click="fileInput.click()">
            Changer la photo
          </button>
          <button v-if="me.avatar_v" class="font-mono text-xs underline underline-offset-4" @click="removeAvatar">
            supprimer
          </button>
          <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onAvatar" />
        </div>
      </div>
      <p v-if="avatarMsg.ok" class="border-t-2 border-ink px-4 py-2 font-mono text-xs">{{ avatarMsg.ok }} ✓</p>
      <p v-if="avatarMsg.err" class="bg-alert px-4 py-2 font-mono text-xs text-white">{{ avatarMsg.err }}</p>
    </section>

    <form class="box" @submit.prevent="saveName">
      <div class="border-b-2 border-ink px-4 py-2 font-mono text-xs uppercase">Pseudo</div>
      <div class="flex gap-3 px-4 py-4">
        <input v-model="name" maxlength="20" autocomplete="username" class="field min-w-0 flex-1 px-3 py-2 text-lg" />
        <button
          :disabled="name.trim() === me.name"
          class="btn bg-ink px-4 font-display text-sm text-white uppercase disabled:opacity-30"
        >
          OK
        </button>
      </div>
      <p v-if="nameMsg.ok" class="border-t-2 border-ink px-4 py-2 font-mono text-xs">{{ nameMsg.ok }} ✓</p>
      <p v-if="nameMsg.err" class="bg-alert px-4 py-2 font-mono text-xs text-white">{{ nameMsg.err }}</p>
    </form>

    <form class="box" @submit.prevent="savePin">
      <div class="border-b-2 border-ink px-4 py-2 font-mono text-xs uppercase">Changer de PIN</div>
      <div class="space-y-3 px-4 py-4">
        <label v-for="f in [{ k: 'current', l: 'PIN actuel', ac: 'current-password' }, { k: 'next', l: 'Nouveau PIN', ac: 'new-password' }, { k: 'confirm', l: 'Confirme', ac: 'new-password' }]" :key="f.k" class="flex items-center gap-3">
          <span class="w-28 font-mono text-xs uppercase">{{ f.l }}</span>
          <input
            v-model="pin[f.k]"
            v-digits
            type="password" inputmode="numeric" maxlength="8" :autocomplete="f.ac"
            class="field min-w-0 flex-1 px-3 py-2 font-mono text-lg tracking-[.4em]"
          />
        </label>
        <button
          :disabled="!pin.current || !pin.next"
          class="btn w-full bg-ink py-2 font-display text-sm text-white uppercase disabled:opacity-30"
        >
          Changer le PIN
        </button>
      </div>
      <p v-if="pinMsg.ok" class="border-t-2 border-ink px-4 py-2 font-mono text-xs">{{ pinMsg.ok }} ✓</p>
      <p v-if="pinMsg.err" class="bg-alert px-4 py-2 font-mono text-xs text-white">{{ pinMsg.err }}</p>
    </form>

    <AutoSync />
  </div>
</template>
