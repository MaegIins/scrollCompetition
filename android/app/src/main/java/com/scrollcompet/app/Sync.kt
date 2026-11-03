package com.scrollcompet.app

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.LocalTime
import java.util.concurrent.TimeUnit

/** Réglages enregistrés sur le téléphone (adresse du serveur + clé perso). */
class Config(ctx: Context) {
    private val prefs = ctx.getSharedPreferences("scroll", Context.MODE_PRIVATE)
    var serverUrl: String
        get() = prefs.getString("url", "") ?: ""
        set(v) = prefs.edit().putString("url", v.trim().trimEnd('/')).apply()
    var apiKey: String
        get() = prefs.getString("key", "") ?: ""
        set(v) = prefs.edit().putString("key", v.trim()).apply()
    var lastSync: String
        get() = prefs.getString("last", "") ?: ""
        set(v) = prefs.edit().putString("last", v).apply()
    val isConfigured get() = serverUrl.startsWith("http") && apiKey.startsWith("sc_")
}

object Sync {
    private const val WORK = "scroll-sync"

    /** Synchro toutes les 30 min quand il y a du réseau. Idempotent : ne recrée pas la tâche si elle existe. */
    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(30, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /**
     * Envoie les totaux du jour (et de la veille juste après minuit, pour ne pas perdre
     * les dernières minutes de la journée). Renvoie un message lisible. Bloquant : hors thread UI.
     */
    fun run(ctx: Context): Result<String> = runCatching {
        val cfg = Config(ctx)
        check(cfg.isConfigured) { "Appli pas connectée au site" }
        check(Usage.hasPermission(ctx)) { "Accès aux données d'utilisation désactivé" }

        val today = LocalDate.now()
        val days = if (LocalTime.now().hour < 2) listOf(today.minusDays(1), today) else listOf(today)
        var summary = ""
        for (day in days) {
            val secs = Usage.secondsFor(ctx, day)
            post(cfg, day, secs)
            summary = secs.entries.joinToString(" · ") { "${LABELS[it.key]?.substringBefore(' ')} ${fmt(it.value)}" }
        }
        val msg = "OK à ${LocalTime.now().toString().take(5)} — $summary"
        cfg.lastSync = msg
        msg
    }.onFailure { Config(ctx).lastSync = "Échec : ${it.message}" }

    private fun post(cfg: Config, day: LocalDate, secs: Map<String, Long>) {
        val body = JSONObject().put("day", day.toString())
        secs.forEach { (k, v) -> body.put(k, v) }
        val conn = URL("${cfg.serverUrl}/api/auto/usage").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 15_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer ${cfg.apiKey}")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            if (code !in 200..299) {
                val err = conn.errorStream?.bufferedReader()?.readText().orEmpty()
                val msg = runCatching { JSONObject(err).getString("error") }.getOrDefault("HTTP $code")
                error(msg)
            }
        } finally {
            conn.disconnect()
        }
    }

    fun fmt(sec: Long): String {
        val m = sec / 60
        return if (m >= 60) "${m / 60}h${(m % 60).toString().padStart(2, '0')}" else "$m min"
    }
}

class SyncWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val r = Sync.run(applicationContext)
        return when {
            r.isSuccess -> Result.success()
            r.exceptionOrNull() is java.io.IOException -> Result.retry() // réseau : on réessaie bientôt
            else -> Result.failure() // pas configuré, clé invalide… : on attend la prochaine période
        }
    }
}
