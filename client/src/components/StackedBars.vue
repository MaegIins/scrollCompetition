<script setup>
// Barres empilées par jour (une barre = un jour, un segment = une appli).
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { fmt, fmtShort, dayLabel, niceMax, niceTicks } from '../api'

const props = defineProps({
  days: { type: Array, required: true },
  segments: { type: Array, required: true }, // [{ key, label, hex }]
  rows: { type: Object, required: true }, // { 'YYYY-MM-DD': { tiktok, reels, twitter } }
  height: { type: Number, default: 200 },
})

const el = ref(null)
const width = ref(320)
let ro
onMounted(() => {
  ro = new ResizeObserver(([e]) => (width.value = e.contentRect.width))
  ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())

const M = { t: 12, r: 8, b: 26, l: 40 }
const GAP = 2
const iw = computed(() => Math.max(10, width.value - M.l - M.r))
const ih = computed(() => props.height - M.t - M.b)
const band = computed(() => iw.value / props.days.length)
const bw = computed(() => Math.min(28, band.value * 0.65))

const totalOf = (d) => props.segments.reduce((s, g) => s + (props.rows[d]?.[g.key] || 0), 0)
const yMax = computed(() => {
  const m = Math.max(30, ...props.days.map(totalOf))
  return niceMax(m)
})
const yTicks = computed(() => niceTicks(yMax.value))
const y = (v) => M.t + ih.value - (v / yMax.value) * ih.value
const cx = (i) => M.l + band.value * (i + 0.5)

// Segments empilés, 2px d'écart entre eux, coins arrondis 4px seulement en haut de la barre
const bars = computed(() =>
  props.days.map((d, i) => {
    let acc = 0
    const segs = props.segments
      .map((g) => ({ g, v: props.rows[d]?.[g.key] || 0 }))
      .filter((s) => s.v > 0)
    const x0 = cx(i) - bw.value / 2
    const w = bw.value
    const out = segs.map((s, k) => {
      const isTop = k === segs.length - 1
      const bottom = y(acc)
      acc += s.v
      const top = Math.min(bottom - 1, y(acc) + (isTop ? 0 : GAP))
      const r = isTop ? Math.min(4, bottom - top, w / 2) : 0
      const path = `M${x0},${bottom}V${top + r}q0,${-r} ${r},${-r}h${w - 2 * r}q${r},0 ${r},${r}V${bottom}Z`
      return { key: s.g.key, hex: s.g.hex, path }
    })
    return { d, i, segs: out, total: acc }
  })
)

const xLabelEvery = computed(() => Math.ceil(props.days.length / Math.max(2, Math.floor(iw.value / 44))))
const hover = ref(null)
</script>

<template>
  <div ref="el" class="relative select-none" @pointerleave="(e) => e.pointerType === 'mouse' && (hover = null)">
    <svg :width="width" :height="height" class="block">
      <g class="font-mono" font-size="11">
        <g v-for="t in yTicks" :key="t">
          <line v-if="t" :x1="M.l" :x2="M.l + iw" :y1="y(t)" :y2="y(t)" stroke="#e4dfd3" />
          <text :x="M.l - 6" :y="y(t) + 4" text-anchor="end" fill="#55524b">{{ fmtShort(t) }}</text>
        </g>
        <template v-for="(d, i) in days" :key="d">
          <text
            v-if="i % xLabelEvery === 0 || i === days.length - 1"
            :x="cx(i)" :y="height - 6" text-anchor="middle" fill="#55524b"
          >
            {{ days.length <= 7 ? dayLabel(d) : d.slice(8) + '/' + d.slice(5, 7) }}
          </text>
        </template>
      </g>

      <g v-for="b in bars" :key="b.d" :opacity="hover == null || hover === b.i ? 1 : 0.45">
        <path v-for="s in b.segs" :key="s.key" :d="s.path" :fill="s.hex" />
      </g>
      <line :x1="M.l" :x2="M.l + iw" :y1="y(0)" :y2="y(0)" stroke="#111" stroke-width="2" />

      <!-- Zones de survol : toute la colonne, plus large que la barre -->
      <rect
        v-for="b in bars" :key="'h' + b.d"
        :x="M.l + band * b.i" :y="M.t" :width="band" :height="ih" fill="transparent"
        @pointerenter="hover = b.i" @click="hover = b.i"
      />
    </svg>

    <div
      v-if="hover != null"
      class="pointer-events-none absolute top-0 z-10 min-w-32 border-2 border-ink bg-white px-3 py-2 font-mono text-xs shadow-[3px_3px_0_#111]"
      :style="cx(hover) > width / 2 ? { right: `${width - cx(hover) + bw / 2 + 6}px` } : { left: `${cx(hover) + bw / 2 + 6}px` }"
    >
      <div class="mb-1 font-bold capitalize">{{ dayLabel(days[hover], true) }}</div>
      <template v-if="bars[hover].total">
        <div v-for="g in segments" :key="g.key" class="flex items-center gap-2">
          <span class="h-2.5 w-2.5" :style="{ background: g.hex }" />
          <span class="flex-1">{{ g.label }}</span>
          <span class="tabular-nums">{{ fmt(rows[days[hover]]?.[g.key] || 0) }}</span>
        </div>
        <div class="mt-1 flex border-t border-ink pt-1 font-bold">
          <span class="flex-1">Total</span><span class="tabular-nums">{{ fmt(bars[hover].total) }}</span>
        </div>
      </template>
      <div v-else class="text-ink/60">Rien saisi</div>
    </div>
  </div>
</template>
