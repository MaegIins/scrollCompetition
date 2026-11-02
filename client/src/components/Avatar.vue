<script setup>
import { computed } from 'vue'

const props = defineProps({
  user: { type: Object, required: true },
  color: { type: String, default: '#8a8578' },
  size: { type: Number, default: 36 },
})
const style = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }))
</script>

<template>
  <img
    v-if="user.avatar_v"
    :src="`/api/avatar/${user.id}?v=${user.avatar_v}`"
    :alt="user.name"
    :style="style"
    class="shrink-0 border-2 border-ink object-cover"
  />
  <span
    v-else
    :style="{ ...style, background: color, fontSize: `${size * 0.45}px` }"
    class="flex shrink-0 items-center justify-center border-2 border-ink font-display text-white uppercase"
  >
    {{ [...user.name][0] }}
  </span>
</template>
