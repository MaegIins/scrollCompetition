<script setup>
import { ref, computed, watch } from 'vue'
import { api, APPS, fmt, prettyDay, today, addDays, mondayOf, monthBounds } from '../api'
import Avatar from './Avatar.vue'

const props = defineProps({ day: String, me: Object, colors: Object, refreshKey: Number })

const period = ref('day')
const periods = [
  { k: 'day', l: 'Jour' },
  { k: 'week', l: 'Semaine' },
  { k: 'month', l: 'Mois' },
  { k: 'all', l: 'Tout' },
]
const rows = ref([])
const loading = ref(false)

const range = computed(() => {
  const d = props.day
  if (period.value === 'day') return [d, d]
  if (period.value === 'week') return [mondayOf(d), addDays(mondayOf(d), 6)]
  if (period.value === 'month') return monthBounds(d)
  return ['2000-01-01', today()]
})

const title = computed(() => {
  if (period.value === 'day') return prettyDay(props.day)
  if (period.value === 'week') {
    const [y, m, d] = range.value[0].split('-').map(Number)
    return `Semaine du ${new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
  }
  if (period.value === 'month') {
    const [y, m] = props.day.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }
  return 'Depuis le début'
})

const max = computed(() => Math.max(1, ...rows.value.map((r) => r.total)))
const leader = computed(() => (rows.value[0]?.total > 0 ? rows.value[0] : null))
// Rang « sportif » : les ex æquo partagent le même rang (1, 2, 2, 4…)
const ranks = computed(() => {
  const m = new Map()
  rows.value.forEach((r, i) => m.set(r.id, i && r.total === rows.value[i - 1].total ? m.get(rows.value[i - 1].id) : i + 1))
  return m
})
// Tous les ex æquo en tête sont rois
const kings = computed(() => (leader.value ? rows.value.filter((r) => r.total === leader.value.total) : []))

// Avec beaucoup de monde : top 10, le reste à la demande.
// Si je suis plus bas, je prends la 10e ligne avec mon vrai rang.
const TOP = 10
const expanded = ref(false)
const myIndex = computed(() => rows.value.findIndex((r) => r.id === props.me.id))
const shown = computed(() => {
  if (expanded.value || rows.value.length <= TOP) return rows.value
  if (myIndex.value < TOP) return rows.value.slice(0, TOP)
  return [...rows.value.slice(0, TOP - 1), rows.value[myIndex.value]]
})
const isJump = (r) => !expanded.value && myIndex.value >= TOP && r.id === props.me.id
const hiddenCount = computed(() => rows.value.length - shown.value.length)

let loadSeq = 0
async function load() {
  const seq = ++loadSeq
  loading.value = true
  try {
    // Inactif = rien saisi dans les 7 jours avant la fin de la période (ou aujourd'hui si elle n'est pas finie)
    const ended = range.value[1] < today()
    const activeSince = addDays(ended ? range.value[1] : today(), -7)
    const data = await api(
      `/leaderboard?from=${range.value[0]}&to=${range.value[1]}&activeSince=${activeSince}&ended=${ended ? 1 : 0}&winsBefore=${today()}`
    )
    if (seq === loadSeq) rows.value = data // ignore les réponses arrivées après une plus récente
  } catch {
    // on garde le dernier classement affiché
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
watch([() => range.value.join(), () => props.refreshKey], load, { immediate: true })
</script>

<template>
  <section>
    <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
      <h2 class="font-display text-2xl uppercase">Classement</h2>
      <div class="flex font-mono text-xs uppercase">
        <button
          v-for="p in periods"
          :key="p.k"
          class="border-2 border-ink px-2 py-1 -ml-[2px]"
          :class="period === p.k ? 'bg-ink text-white' : 'bg-white'"
          @click="period = p.k"
        >
          {{ p.l }}
        </button>
      </div>
    </div>

    <div class="box">
      <div class="flex items-baseline justify-between border-b-2 border-ink px-4 py-2 font-mono text-xs uppercase">
        <span class="capitalize">{{ title }}</span>
        <span v-if="leader" class="truncate pl-3">
          {{ kings.length > 1 ? 'Rois' : 'Roi' }} : <b class="bg-hi px-1">{{ kings.map((k) => k.name).join(', ') }}</b>
        </span>
      </div>

      <p v-if="!leader && !loading" class="px-4 py-6 text-center font-mono text-sm">
        Personne n'a rien saisi. Suspect.
      </p>

      <ol>
        <li
          v-for="r in shown"
          :key="r.id"
          class="border-b-2 border-ink px-4 py-3 last:border-b-0"
          :class="[r.id === me.id && 'bg-hi/40', isJump(r) && 'border-t-4 border-t-ink border-double']"
        >
          <div class="mb-2 flex items-center gap-3">
            <span class="w-8 font-display text-2xl tabular-nums" :class="!r.total && 'text-ink/25'">
              {{ r.total ? String(ranks.get(r.id)).padStart(2, '0') : '–' }}
            </span>
            <span class="relative shrink-0">
              <Avatar :user="r" :color="colors[r.id]" :size="ranks.get(r.id) === 1 && r.total ? 44 : 36" />
              <!-- Palmarès : journées gagnées depuis le début -->
              <span
                v-if="r.wins"
                class="absolute -right-2.5 -bottom-2 flex items-center gap-0.5 border-2 border-ink bg-hi px-1 font-mono text-[11px] leading-4 font-bold"
                :title="`${r.wins} victoire${r.wins > 1 ? 's' : ''} depuis le début`"
              >
                <svg viewBox="0 0 12 10" class="h-2.5 w-3" aria-hidden="true">
                  <path d="M1 9h10L12 2 8.5 5 6 0 3.5 5 0 2z" fill="currentColor" />
                </svg>
                {{ r.wins }}
              </span>
            </span>
            <span class="flex min-w-0 flex-1 items-center gap-2">
              <span class="truncate text-xl font-bold">
                {{ r.name }}<span v-if="r.id === me.id" class="font-mono text-xs font-medium"> (toi)</span>
              </span>
              <span
                v-if="r.suspect_days"
                class="shrink-0 -rotate-2 bg-ink px-1 font-mono text-[10px] font-bold text-hi uppercase"
                :title="`${r.suspect_days} journée(s) à plus de 24h de scroll`"
              >
                Suspect{{ period !== 'day' && r.suspect_days > 1 ? ` ×${r.suspect_days}` : '' }}
              </span>
            </span>
            <span class="font-mono text-lg font-bold tabular-nums">{{ fmt(r.total) }}</span>
          </div>
          <div class="ml-11 flex h-3 gap-[2px] border-2 border-ink bg-paper">
            <div
              v-for="a in APPS"
              :key="a.key"
              :class="a.color"
              class="h-full transition-all duration-300"
              :style="{ width: `${(r[a.key] / max) * 100}%` }"
              :title="`${a.label} : ${fmt(r[a.key])}`"
            />
          </div>
        </li>
      </ol>
      <button
        v-if="hiddenCount || expanded && rows.length > TOP"
        class="w-full border-t-2 border-ink py-2 font-mono text-xs uppercase hover:bg-hi"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Réduire' : `Voir les ${hiddenCount} autres` }}
      </button>
    </div>

    <div class="mt-3 flex gap-4 font-mono text-xs">
      <span v-for="a in APPS" :key="a.key" class="flex items-center gap-1">
        <span class="h-3 w-3 border border-ink" :class="a.color" />{{ a.label }}
      </span>
    </div>
  </section>
</template>
