<script setup>
import { ref, computed, watch } from 'vue'
import { api, APPS, PALETTE, fmt, today, addDays, dayLabel } from '../api'
import Avatar from './Avatar.vue'
import LineChart from './LineChart.vue'
import StackedBars from './StackedBars.vue'

const props = defineProps({ users: Array, colors: Object, me: Object, refreshKey: Number })

const span = ref(7)
const showTable = ref(false)
const entries = ref([])
const search = ref('')

const days = computed(() => Array.from({ length: span.value }, (_, i) => addDays(today(), i - span.value + 1)))

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  const data = await api(`/series?from=${days.value[0]}&to=${days.value.at(-1)}`).catch(() => null)
  if (seq === loadSeq && data) entries.value = data
}
watch([span, () => props.refreshKey], load, { immediate: true })

const byUser = computed(() => {
  const m = {}
  for (const e of entries.value) (m[e.user_id] ??= {})[e.day] = e
  return m
})

// Toutes les personnes ayant saisi sur la période, triées par total décroissant
const participants = computed(() =>
  props.users
    .filter((u) => byUser.value[u.id])
    .map((u) => {
      const values = days.value.map((d) => byUser.value[u.id][d]?.total ?? null)
      return { ...u, values, sum: values.reduce((s, v) => s + (v || 0), 0) }
    })
    .sort((a, b) => b.sum - a.sum)
)

// --- Sélection --------------------------------------------------------------
// auto   : toi + le top, jusqu'à 4 courbes
// custom : 1re touche = isoler la personne, touches suivantes = ajouter / retirer
// Une couleur est attribuée à l'ajout et ne bouge plus tant que la personne reste affichée.
const AUTO_COUNT = 4
const STORE = 'scroll-stats-selection'
const saved = (() => {
  try { return JSON.parse(localStorage.getItem(STORE)) || {} } catch { return {} }
})()
const mode = ref(saved.mode === 'custom' ? 'custom' : 'auto')
const picked = ref(Array.isArray(saved.picked) ? saved.picked : [])
const slots = ref(saved.slots || {})
watch([mode, picked, slots], () => {
  try { localStorage.setItem(STORE, JSON.stringify({ mode: mode.value, picked: picked.value, slots: slots.value })) } catch {}
}, { deep: true })

const autoIds = computed(() => {
  const ids = participants.value.map((p) => p.id)
  const mine = ids.includes(props.me.id) ? [props.me.id] : []
  return [...mine, ...ids.filter((id) => id !== props.me.id)].slice(0, AUTO_COUNT)
})
const present = computed(() => new Set(participants.value.map((p) => p.id)))
const selectedIds = computed(() =>
  mode.value === 'auto' ? autoIds.value : picked.value.filter((id) => present.value.has(id))
)
const colorOf = (id) =>
  PALETTE[(mode.value === 'auto' ? autoIds.value.indexOf(id) : slots.value[id] ?? 0) % PALETTE.length]

const freeSlot = (taken) => {
  let s = 0
  while (taken.has(s)) s++
  return s
}

function pick(id) {
  if (mode.value === 'auto') {
    mode.value = 'custom'
    picked.value = [id]
    slots.value = { [id]: 0 }
    return
  }
  if (picked.value.includes(id)) {
    picked.value = picked.value.filter((x) => x !== id)
    const { [id]: _, ...rest } = slots.value
    slots.value = rest
    return
  }
  // Les places des personnes sélectionnées mais absentes de la période restent réservées
  const slot = freeSlot(new Set(picked.value.map((x) => slots.value[x])))
  picked.value = [...picked.value, id]
  slots.value = { ...slots.value, [id]: slot }
}
function reset() {
  mode.value = 'auto'
  picked.value = []
  slots.value = {}
}
// Tout le monde : on garde les couleurs déjà attribuées, les nouveaux prennent les places libres
function selectAll() {
  const keep = mode.value === 'custom' ? { ...slots.value } : Object.fromEntries(autoIds.value.map((id, i) => [id, i]))
  const taken = new Set(Object.values(keep))
  for (const p of participants.value) {
    if (keep[p.id] != null) continue
    keep[p.id] = freeSlot(taken)
    taken.add(keep[p.id])
  }
  mode.value = 'custom'
  slots.value = keep
  picked.value = participants.value.map((p) => p.id)
}
function selectNone() {
  mode.value = 'custom'
  picked.value = []
  slots.value = {}
}

const selSet = computed(() => new Set(selectedIds.value))
const series = computed(() =>
  selectedIds.value
    .map((id) => participants.value.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ ...p, color: colorOf(p.id) }))
)
const context = computed(() => participants.value.filter((p) => !selSet.value.has(p.id)))

const chips = computed(() => {
  const q = search.value.trim().toLowerCase()
  return participants.value.filter((p) => !q || p.name.toLowerCase().includes(q))
})

// Détail par appli : la personne isolée, sinon moi
const detailUser = computed(() =>
  mode.value === 'custom' && series.value.length === 1 ? series.value[0] : props.me
)
const detailRows = computed(() => byUser.value[detailUser.value.id] || {})
</script>

<template>
  <section>
    <div class="mb-3 flex items-end justify-between gap-2">
      <h2 class="font-display text-2xl uppercase">Stats</h2>
      <div class="flex font-mono text-xs uppercase">
        <button
          v-for="n in [7, 30]"
          :key="n"
          class="-ml-[2px] border-2 border-ink px-2 py-1"
          :class="span === n ? 'bg-ink text-white' : 'bg-white'"
          @click="span = n"
        >
          {{ n }} jours
        </button>
        <button
          class="ml-2 border-2 border-ink px-2 py-1"
          :class="showTable ? 'bg-ink text-white' : 'bg-white'"
          @click="showTable = !showTable"
        >
          Tableau
        </button>
      </div>
    </div>

    <div class="box mb-6">
      <div class="flex items-baseline justify-between border-b-2 border-ink px-4 py-2 font-mono text-xs uppercase">
        <span>La course · temps total par jour</span>
      </div>
      <div class="px-2 pt-3 pb-1">
        <p v-if="!participants.length" class="py-8 text-center font-mono text-sm">Pas encore de données.</p>
        <LineChart v-else :days="days" :series="series" :context="context" @pick="pick" />
      </div>

      <!-- Légende interactive -->
      <div v-if="participants.length" class="border-t-2 border-ink px-4 py-3">
        <div class="mb-2 flex items-center justify-between gap-3 font-mono text-[11px] text-ink/60">
          <span>
            {{ mode === 'auto' ? 'Touche quelqu\'un pour ne voir que lui' : 'Touche pour ajouter / retirer' }}
          </span>
          <input
            v-if="participants.length > 8"
            v-model="search"
            placeholder="chercher…"
            class="field w-28 px-2 py-0.5 text-xs"
          />
        </div>
        <div class="mb-3 flex flex-wrap gap-2 font-mono text-[11px] uppercase">
          <button class="border-2 border-ink bg-white px-2 py-0.5 active:bg-hi" @click="selectAll">Tout le monde</button>
          <button class="border-2 border-ink bg-white px-2 py-0.5 active:bg-hi" @click="selectNone">Personne</button>
          <button
            class="border-2 border-ink px-2 py-0.5"
            :class="mode === 'auto' ? 'bg-ink text-white' : 'bg-white active:bg-hi'"
            @click="reset"
          >
            Moi + top 3
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in chips"
            :key="p.id"
            class="flex items-center gap-1.5 border-2 py-0.5 pr-2 pl-0.5 text-sm font-bold transition"
            :class="selSet.has(p.id) ? 'border-ink bg-white' : 'border-dashed border-ink/30 text-ink/45'"
            :style="selSet.has(p.id) ? { boxShadow: `inset 0 -3px 0 ${colorOf(p.id)}` } : {}"
            @click="pick(p.id)"
          >
            <Avatar
              :user="p" :color="colors[p.id]" :size="22"
              :class="!selSet.has(p.id) && 'opacity-40 grayscale'"
            />
            {{ p.name }}
          </button>
          <span v-if="!chips.length" class="font-mono text-xs">Personne.</span>
        </div>
      </div>

      <div v-if="showTable && series.length" class="overflow-x-auto border-t-2 border-ink">
        <table class="w-full font-mono text-xs">
          <thead>
            <tr class="border-b-2 border-ink">
              <th class="px-3 py-1 text-left">Jour</th>
              <th v-for="s in series" :key="s.id" class="px-3 py-1 text-right">{{ s.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, i) in days" :key="d" class="border-b border-ink/15">
              <td class="px-3 py-1 capitalize">{{ dayLabel(d, true) }}</td>
              <td v-for="s in series" :key="s.id" class="px-3 py-1 text-right tabular-nums">
                {{ s.values[i] == null ? '–' : fmt(s.values[i]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="box">
      <div class="flex items-center gap-2 border-b-2 border-ink px-4 py-2 font-mono text-xs uppercase">
        <template v-if="detailUser.id === me.id">Mon détail · par appli</template>
        <template v-else>
          <Avatar :user="detailUser" :color="colors[detailUser.id]" :size="18" />
          Détail de {{ detailUser.name }} · par appli
        </template>
      </div>
      <div class="px-2 pt-3 pb-1">
        <StackedBars :days="days" :segments="APPS" :rows="detailRows" />
      </div>
      <div class="flex gap-4 border-t-2 border-ink px-4 py-2 text-sm font-bold">
        <span v-for="a in APPS" :key="a.key" class="flex items-center gap-2">
          <span class="h-3 w-3" :style="{ background: a.hex }" />{{ a.label }}
        </span>
      </div>
    </div>
  </section>
</template>
