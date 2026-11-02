import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { vDigits } from './api'

createApp(App).directive('digits', vDigits).mount('#app')
