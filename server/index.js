import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
mkdirSync(DATA_DIR, { recursive: true })

const { app } = createApp({
  dbPath: path.join(DATA_DIR, 'scroll.db'),
  inviteCode: process.env.INVITE_CODE || '', // si défini, requis pour s'inscrire
  appTz: process.env.APP_TZ || 'Europe/Paris', // « quel jour on est » quand un téléphone envoie sans date
  distDir: path.join(__dirname, '..', 'client', 'dist'),
})

app.listen(PORT, () => console.log(`🚀 Scroll Competition API sur http://localhost:${PORT}`))
