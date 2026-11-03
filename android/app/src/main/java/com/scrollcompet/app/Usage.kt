package com.scrollcompet.app

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process
import java.time.LocalDate
import java.time.ZoneId

/** Applis suivies : clé envoyée au serveur → noms de paquet Android possibles. */
val TRACKED: Map<String, List<String>> = linkedMapOf(
    "tiktok" to listOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.zhiliaoapp.musically.go"),
    "instagram" to listOf("com.instagram.android", "com.instagram.lite"), // compte dans « Reels »
    "x" to listOf("com.twitter.android"),
    "youtube" to listOf(
        "com.google.android.youtube",
        "app.morphe.android.youtube", // YouTube Morphe (YouTube modifié, paquet renommé)
    ),
)
private val PKG_TO_KEY = TRACKED.flatMap { (key, pkgs) -> pkgs.map { it to key } }.toMap()
// Variantes de YouTube à ne pas compter (pas du scroll de vidéos)
private val YOUTUBE_EXCLUDED = listOf("music", "kids", "creator", "studio", ".tv", "unplugged")

/**
 * Appli du classement à laquelle rattacher un paquet, ou null.
 * Les YouTube modifiés (Morphe, ReVanced…) renomment leur paquet : tout paquet contenant
 * « youtube » compte donc dans YouTube, sauf Music, Kids, Studio, TV.
 */
fun keyFor(pkg: String): String? {
    PKG_TO_KEY[pkg]?.let { return it }
    val p = pkg.lowercase()
    return if ("youtube" in p && YOUTUBE_EXCLUDED.none { it in p }) "youtube" else null
}

val LABELS = mapOf("tiktok" to "TikTok", "instagram" to "Instagram (Reels)", "x" to "X (Twitter)", "youtube" to "YouTube")

object Usage {
    /** L'utilisateur a-t-il activé « Accès aux données d'utilisation » pour l'appli ? */
    fun hasPermission(ctx: Context): Boolean {
        val ops = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        @Suppress("DEPRECATION")
        val mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /**
     * Secondes passées au premier plan par appli suivie, sur une journée locale.
     * Calculé à partir des événements (plus précis que les totaux journaliers d'Android,
     * dont les tranches ne tombent pas pile à minuit).
     */
    fun secondsFor(ctx: Context, day: LocalDate, nowMs: Long = System.currentTimeMillis()): Map<String, Long> {
        val zone = ZoneId.systemDefault()
        val start = day.atStartOfDay(zone).toInstant().toEpochMilli()
        val end = minOf(nowMs, day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli())
        val result = TRACKED.keys.associateWith { 0L }.toMutableMap()
        if (end <= start) return result

        allApps(ctx, start, end).forEach { (pkg, ms) ->
            keyFor(pkg)?.let { result[it] = (result[it] ?: 0L) + ms / 1000 }
        }
        return result
    }

    /** Diagnostic : toutes les applis utilisées ce jour-là, en secondes, de la plus utilisée à la moins. */
    fun topApps(ctx: Context, day: LocalDate, limit: Int = 15, nowMs: Long = System.currentTimeMillis()): List<Pair<String, Long>> {
        val zone = ZoneId.systemDefault()
        val start = day.atStartOfDay(zone).toInstant().toEpochMilli()
        val end = minOf(nowMs, day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli())
        if (end <= start) return emptyList()
        return allApps(ctx, start, end).map { it.key to it.value / 1000 }
            .filter { it.second > 0 }.sortedByDescending { it.second }.take(limit)
    }

    /** Millisecondes au premier plan pour chaque paquet entre start et end. */
    private fun allApps(ctx: Context, start: Long, end: Long): Map<String, Long> {
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val raw = usm.queryEvents(start, end)
        val events = sequence {
            val e = UsageEvents.Event()
            while (raw.hasNextEvent()) {
                raw.getNextEvent(e)
                val pkg = e.packageName ?: continue
                yield(Ev(pkg, e.className ?: "", e.eventType, e.timeStamp))
            }
        }
        return foregroundMs(events, start, end)
    }

    /** Un événement d'usage, découplé de l'API Android pour pouvoir le tester sur la JVM. */
    data class Ev(val pkg: String, val screen: String, val type: Int, val at: Long)

    /**
     * Millisecondes au premier plan par paquet, entre start et end, à partir des événements.
     * On suit chaque écran (activité) : en passant d'un écran à l'autre, Android peut signaler
     * la reprise du nouveau avant la pause de l'ancien. L'appli est au premier plan tant qu'au
     * moins un de ses écrans l'est.
     */
    fun foregroundMs(events: Sequence<Ev>, start: Long, end: Long): Map<String, Long> {
        val resumed = mutableMapOf<String, MutableSet<String>>()
        val since = mutableMapOf<String, Long>()
        val seen = mutableSetOf<String>()
        val total = mutableMapOf<String, Long>()
        fun add(pkg: String, ms: Long) { if (ms > 0) total[pkg] = (total[pkg] ?: 0L) + ms }

        for (e in events) {
            val open = resumed.getOrPut(e.pkg) { mutableSetOf() }
            when (e.type) {
                RESUMED -> {
                    if (open.isEmpty()) since[e.pkg] = e.at
                    open += e.screen
                }
                PAUSED, STOPPED -> {
                    if (open.remove(e.screen)) {
                        if (open.isEmpty()) add(e.pkg, e.at - since.getValue(e.pkg))
                    } else if (e.pkg !in seen) {
                        // Pause sans reprise vue : l'appli était déjà ouverte avant le début → on compte depuis start
                        add(e.pkg, e.at - start)
                    }
                }
            }
            seen += e.pkg
        }
        // Encore au premier plan à la fin de la fenêtre
        resumed.forEach { (pkg, open) -> if (open.isNotEmpty()) add(pkg, end - since.getValue(pkg)) }
        return total
    }

    // Constantes UsageEvents.Event (valeurs numériques : ACTIVITY_* n'existent qu'à partir d'Android 10)
    const val RESUMED = 1 // MOVE_TO_FOREGROUND / ACTIVITY_RESUMED
    const val PAUSED = 2 // MOVE_TO_BACKGROUND / ACTIVITY_PAUSED
    const val STOPPED = 23 // ACTIVITY_STOPPED
}
