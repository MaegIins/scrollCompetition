<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { api, APPS, fmt, prettyDay, today, addDays } from '../api'

const day = defineModel('day', { required: true })
const emit = defineEmits(['saved'])

// Saisie en heures + minutes, comme affiché dans "Temps d'écran" / "Bien-être numérique"
const form = reactive(Object.fromEntries(APPS.map((a) => [a.key, { h: '', m: '' }])))
const status = ref('')
const saving = ref(false)
const saved = ref(null) // dernière saisie enregistrée pour ce jour (minutes par appli)
const collapsed = ref(false)
const loadFailed = ref(false)
let loadSeq = 0

const minutesOf = (k) => (Number(form[k].h) || 0) * 60 + (Number(form[k].m) || 0)
const total = computed(() => APPS.reduce((s, a) => s + minutesOf(a.key), 0))
const savedTotal = computed(() => (saved.value ? APPS.reduce((s, a) => s + saved.value[a.key], 0) : 0))
const isToday = computed(() => day.value === today())

function fill(row) {
  for (const a of APPS) {
    const v = row?.[a.key] || 0
    form[a.key].h = v >= 60 ? Math.floor(v / 60) : ''
    form[a.key].m = v ? v % 60 : ''
  }
}

async function load() {
  const seq = ++loadSeq
  const d = day.value
  status.value = ''
  loadFailed.value = false
  try {
    const [row] = await api(`/entries/me?from=${d}&to=${d}`)
    if (seq !== loadSeq) return // on a changé de jour entre-temps : réponse périmée
    saved.value = row || null
    collapsed.value = !!row
    fill(row)
  } catch (e) {
    if (seq !== loadSeq) return
    // Sans ça, un formulaire vide pourrait écraser la vraie saisie
    loadFailed.value = true
    saved.value = null
    collapsed.value = false
    status.value = `Impossible de charger ce jour (${e.message}). Recharge la page.`
  }
}
watch(day, load, { immediate: true })

async function save() {
  const tooMuch = APPS.find((a) => minutesOf(a.key) > 1440)
  if (tooMuch) return (status.value = `${tooMuch.label} : 24h maximum par appli.`)
  saving.value = true
  status.value = ''
  const d = day.value
  try {
    const row = await api(`/entries/${d}`, {
      method: 'PUT',
      body: Object.fromEntries(APPS.map((a) => [a.key, minutesOf(a.key)])),
    })
    emit('saved')
    if (d !== day.value) return
    saved.value = row
    collapsed.value = true
  } catch (e) {
    status.value = e.message
  } finally {
    saving.value = false
  }
}

function cancel() {
  fill(saved.value)
  collapsed.value = true
}
</script>

<template>
  <section>
    <div class="mb-3 flex items-center justify-between">
      <h2 class="font-display text-2xl uppercase">Ma saisie</h2>
      <div class="flex items-center gap-1 font-mono text-sm">
        <button class="px-2 text-lg" @click="day = addDays(day, -1)">←</button>
        <span class="min-w-28 text-center capitalize">{{ prettyDay(day) }}</span>
        <button class="px-2 text-lg disabled:opacity-20" :disabled="isToday" @click="day = addDays(day, 1)">→</button>
      </div>
    </div>

    <!-- Version repliée : la saisie est faite, on laisse la place au classement -->
    <div v-if="collapsed && saved" class="box flex items-center gap-4 px-4 py-3">
      <div class="flex-1">
        <div class="font-mono text-xs uppercase">Enregistré ✓</div>
        <div class="flex items-baseline gap-3">
          <span class="font-display text-2xl tabular-nums">{{ fmt(savedTotal) }}</span>
          <span v-if="savedTotal > 1440" class="bg-ink px-1 font-mono text-xs text-hi uppercase">suspect</span>
        </div>
        <div class="mt-1 flex flex-wrap gap-x-3 font-mono text-xs">
          <span v-for="a in APPS" :key="a.key" class="flex items-center gap-1">
            <span class="h-2 w-2" :class="a.color" />{{ a.label }} {{ fmt(saved[a.key]) }}
          </span>
        </div>
      </div>
      <button class="btn bg-white px-4 py-2 font-display text-sm uppercase" @click="collapsed = false">
        Modifier
      </button>
    </div>

    <form v-else class="box" @submit.prevent="save">
      <div
        v-for="a in APPS"
        :key="a.key"
        class="flex items-center gap-3 border-b-2 border-ink px-4 py-3"
      >
        <span class="flex w-20 items-center gap-2 text-lg font-bold">
          <span class="h-3 w-3" :class="a.color" />{{ a.label }}
        </span>
        <div class="ml-auto flex items-baseline gap-1 font-mono">
          <input
            v-model="form[a.key].h"
            v-digits="24"
            type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="0"
            class="field w-14 px-2 py-1 text-right text-lg"
          />
          <span class="mr-2 text-sm">h</span>
          <input
            v-model="form[a.key].m"
            v-digits="59"
            type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="00"
            class="field w-14 px-2 py-1 text-right text-lg"
          />
          <span class="text-sm">min</span>
        </div>
      </div>

      <div class="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <div class="font-mono text-xs uppercase">Total</div>
          <div class="font-display text-3xl tabular-nums">{{ fmt(total) }}</div>
        </div>
        <div class="flex items-center gap-3">
          <button v-if="saved" type="button" class="font-mono text-xs underline underline-offset-4" @click="cancel">
            annuler
          </button>
          <button :disabled="saving || loadFailed" class="btn bg-hi px-5 py-2 font-display uppercase disabled:opacity-50">
            Enregistrer
          </button>
        </div>
      </div>
      <p v-if="total > 1440" class="border-t-2 border-ink bg-ink px-4 py-2 font-mono text-xs text-hi">
        Plus de 24h dans une journée ? Tu vas être marqué SUSPECT aux yeux de tous.
      </p>
      <p v-if="status" class="bg-alert px-4 py-2 font-mono text-sm text-white">{{ status }}</p>

      <p class="border-t-2 border-ink bg-alert px-4 py-3 text-center font-display text-lg leading-tight text-white uppercase">
        T'es une grosse salope si tu triches
      </p>
    </form>
  </section>
</template>
