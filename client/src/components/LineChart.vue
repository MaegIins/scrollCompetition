<script setup>
// Courbes multi-séries en SVG fait main : axe Y unique, lignes 2px, crosshair + infobulle.
// `series` = personnes mises en avant (en couleur), `context` = les autres (gris fin, en fond).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { fmt, fmtShort, dayLabel, niceMax, niceTicks } from '../api'

const props = defineProps({
  days: { type: Array, required: true }, // ['YYYY-MM-DD', ...]
  series: { type: Array, required: true }, // [{ id, name, color, values: [min|null] }]
  context: { type: Array, default: () => [] }, // même forme, sans couleur
  height: { type: Number, default: 220 },
})
const emit = defineEmits(['pick'])

const el = ref(null)
const width = ref(320)
let ro
onMounted(() => {
  ro = new ResizeObserver(([e]) => (width.value = e.contentRect.width))
  ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())

const directLabels = computed(() => props.series.length > 0 && props.series.length <= 4)
const M = computed(() => ({ t: 12, r: directLabels.value ? 64 : 12, b: 26, l: 40 }))
const iw = computed(() => Math.max(10, width.value - M.value.l - M.value.r))
const ih = computed(() => props.height - M.value.t - M.value.b)

// Échelle calée sur les personnes mises en avant (le contexte est rogné si besoin)
const yMax = computed(() => {
  const pool = props.series.length ? props.series : props.context
  const m = Math.max(30, ...pool.flatMap((s) => s.values.filter((v) => v != null)))
  return niceMax(m)
})
const yTicks = computed(() => niceTicks(yMax.value))
const x = (i) => M.value.l + (props.days.length < 2 ? iw.value / 2 : (i / (props.days.length - 1)) * iw.value)
const y = (v) => M.value.t + ih.value - (v / yMax.value) * ih.value

// Les jours non saisis cassent la ligne au lieu de tomber à 0
const pathOf = (values) => {
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v == null) return (pen = false)
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    pen = true
  })
  return d
}
const paths = computed(() => props.series.map((s) => ({ ...s, d: pathOf(s.values) })))
const ctxPaths = computed(() => props.context.map((s) => ({ ...s, d: pathOf(s.values) })))

const xLabelEvery = computed(() => Math.ceil(props.days.length / Math.max(2, Math.floor(iw.value / 44))))
const showMarkers = computed(() => props.days.length <= 14)

// Libellés directs en bout de ligne, écartés pour ne pas se chevaucher
const endLabels = computed(() => {
  if (!directLabels.value) return []
  const items = props.series
    .map((s) => {
      const i = s.values.findLastIndex((v) => v != null)
      return i < 0 ? null : { ...s, ty: y(Math.min(s.values[i], yMax.value)) }
    })
    .filter(Boolean)
    .sort((a, b) => a.ty - b.ty)
  for (let k = 1; k < items.length; k++) items[k].ty = Math.max(items[k].ty, items[k - 1].ty + 14)
  return items
})

const hover = ref(null)
function onMove(e) {
  const r = el.value.getBoundingClientRect()
  const px = e.clientX - r.left - M.value.l
  const n = props.days.length
  hover.value = Math.min(n - 1, Math.max(0, Math.round((px / iw.value) * (n - 1))))
}
const tip = computed(() => {
  if (hover.value == null) return null
  const i = hover.value
  const rows = props.series
    .map((s) => ({ ...s, v: s.values[i] }))
    .filter((s) => s.v != null)
    .sort((a, b) => b.v - a.v)
  const left = x(i)
  return { i, rows, left, flip: left > width.value / 2 }
})
const clipId = `clip-${Math.random().toString(36).slice(2)}`
</script>

<template>
  <div
    ref="el"
    class="relative touch-pan-y select-none"
    @pointermove="onMove"
    @pointerdown="onMove"
    @pointerleave="(e) => e.pointerType === 'mouse' && (hover = null)"
  >
    <svg :width="width" :height="height" class="block overflow-visible">
      <defs>
        <clipPath :id="clipId"><rect :x="M.l - 6" :y="M.t - 6" :width="iw + 12" :height="ih + 6" /></clipPath>
      </defs>
      <g class="font-mono" font-size="11">
        <g v-for="t in yTicks" :key="t">
          <line :x1="M.l" :x2="M.l + iw" :y1="y(t)" :y2="y(t)" :stroke="t ? '#e4dfd3' : '#111'" :stroke-width="t ? 1 : 2" />
          <text :x="M.l - 6" :y="y(t) + 4" text-anchor="end" fill="#55524b">{{ fmtShort(t) }}</text>
        </g>
        <template v-for="(d, i) in days" :key="d">
          <text
            v-if="i % xLabelEvery === 0 || i === days.length - 1"
            :x="x(i)" :y="height - 6" text-anchor="middle" fill="#55524b"
          >
            {{ days.length <= 7 ? dayLabel(d) : d.slice(8) + '/' + d.slice(5, 7) }}
          </text>
        </template>
      </g>

      <line v-if="tip" :x1="tip.left" :x2="tip.left" :y1="M.t" :y2="M.t + ih" stroke="#111" stroke-width="1" stroke-dasharray="3 3" />

      <g :clip-path="`url(#${clipId})`">
        <!-- Contexte : les autres, en gris, cliquables pour les mettre en avant -->
        <g v-for="p in ctxPaths" :key="'c' + p.id" class="cursor-pointer" @click="emit('pick', p.id)">
          <path :d="p.d" fill="none" stroke="#cfc8b8" stroke-width="1.5" stroke-linejoin="round" />
          <path :d="p.d" fill="none" stroke="transparent" stroke-width="12"><title>{{ p.name }}</title></path>
        </g>

        <g v-for="p in paths" :key="p.id" class="cursor-pointer" @click="emit('pick', p.id)">
          <path :d="p.d" fill="none" stroke="white" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" />
          <path :d="p.d" fill="none" :stroke="p.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          <path :d="p.d" fill="none" stroke="transparent" stroke-width="12" />
        </g>
        <template v-for="s in series" :key="'m' + s.id">
          <template v-for="(v, i) in s.values" :key="i">
            <circle
              v-if="v != null && (showMarkers || tip?.i === i)"
              :cx="x(i)" :cy="y(Math.min(v, yMax))" :r="tip?.i === i ? 5 : 4"
              :fill="s.color" stroke="white" stroke-width="2" class="pointer-events-none"
            />
          </template>
        </template>
      </g>

      <g v-for="l in endLabels" :key="'l' + l.id" class="font-sans" font-size="12" font-weight="700">
        <text :x="M.l + iw + 8" :y="l.ty + 4" fill="#111">{{ l.name }}</text>
      </g>
    </svg>

    <div
      v-if="tip && tip.rows.length"
      class="pointer-events-none absolute top-0 z-10 min-w-36 border-2 border-ink bg-white px-3 py-2 font-mono text-xs shadow-[3px_3px_0_#111]"
      :style="tip.flip ? { right: `${width - tip.left + 10}px` } : { left: `${tip.left + 10}px` }"
    >
      <div class="mb-1 font-bold capitalize">{{ dayLabel(days[tip.i], true) }}</div>
      <div v-for="r in tip.rows" :key="r.id" class="flex items-center gap-2">
        <span class="h-2.5 w-2.5" :style="{ background: r.color }" />
        <span class="flex-1">{{ r.name }}</span>
        <span v-if="r.v > 1440" class="bg-ink px-1 text-[10px] text-hi uppercase">suspect</span>
        <b class="tabular-nums">{{ fmt(r.v) }}</b>
      </div>
    </div>
  </div>
</template>
