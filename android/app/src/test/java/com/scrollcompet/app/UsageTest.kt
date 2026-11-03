package com.scrollcompet.app

import com.scrollcompet.app.Usage.Ev
import com.scrollcompet.app.Usage.PAUSED
import com.scrollcompet.app.Usage.RESUMED
import com.scrollcompet.app.Usage.STOPPED
import org.junit.Assert.assertEquals
import org.junit.Test

/** Calcul du temps au premier plan à partir des événements Android (sur la JVM, sans téléphone). */
class UsageTest {
    private val start = 0L
    private val end = 24 * 3600_000L
    private fun min(m: Int) = m * 60_000L
    private fun calc(vararg e: Ev) = Usage.foregroundMs(e.asSequence(), start, end)
    private val tt = "com.zhiliaoapp.musically"
    private val ig = "com.instagram.android"

    @Test fun `session simple`() {
        val r = calc(Ev(tt, "Main", RESUMED, min(10)), Ev(tt, "Main", PAUSED, min(35)))
        assertEquals(min(25), r[tt])
    }

    @Test fun `PAUSED puis STOPPED du même écran ne compte qu'une fois`() {
        val r = calc(
            Ev(tt, "Main", RESUMED, min(10)),
            Ev(tt, "Main", PAUSED, min(20)),
            Ev(tt, "Main", STOPPED, min(21)),
        )
        assertEquals(min(10), r[tt])
    }

    @Test fun `changement d'écran avec reprise avant la pause - pas de trou`() {
        val r = calc(
            Ev(ig, "Feed", RESUMED, min(0)),
            Ev(ig, "Reels", RESUMED, min(5)), // le nouvel écran reprend…
            Ev(ig, "Feed", PAUSED, min(5) + 200), // …avant la pause de l'ancien
            Ev(ig, "Reels", PAUSED, min(30)),
        )
        assertEquals(min(30), r[ig])
    }

    @Test fun `plusieurs sessions s'additionnent`() {
        val r = calc(
            Ev(tt, "Main", RESUMED, min(0)), Ev(tt, "Main", PAUSED, min(10)),
            Ev(tt, "Main", RESUMED, min(60)), Ev(tt, "Main", PAUSED, min(65)),
        )
        assertEquals(min(15), r[tt])
    }

    @Test fun `appli déjà ouverte avant minuit - compte depuis le début de la fenêtre`() {
        val r = calc(Ev(tt, "Main", PAUSED, min(12)))
        assertEquals(min(12), r[tt])
    }

    @Test fun `appli encore ouverte à la fin - compte jusqu'à la fin de la fenêtre`() {
        val r = Usage.foregroundMs(sequenceOf(Ev(tt, "Main", RESUMED, min(50))), start, min(60))
        assertEquals(min(10), r[tt])
    }

    @Test fun `applis indépendantes`() {
        val r = calc(
            Ev(tt, "Main", RESUMED, min(0)), Ev(tt, "Main", PAUSED, min(10)),
            Ev(ig, "Feed", RESUMED, min(10)), Ev(ig, "Feed", PAUSED, min(13)),
        )
        assertEquals(min(10), r[tt])
        assertEquals(min(3), r[ig])
    }

    @Test fun `pause orpheline après une vraie session ignorée`() {
        val r = calc(
            Ev(tt, "Main", RESUMED, min(0)), Ev(tt, "Main", PAUSED, min(10)),
            Ev(tt, "Other", PAUSED, min(40)),
        )
        assertEquals(min(10), r[tt])
    }

    @Test fun `YouTube officiel et modifiés comptent dans YouTube`() {
        for (pkg in listOf(
            "com.google.android.youtube",
            "app.morphe.android.youtube",
            "app.revanced.android.youtube",
            "app.rvx.android.youtube",
            "com.vanced.android.youtube",
        )) assertEquals(pkg, "youtube", keyFor(pkg))
    }

    @Test fun `YouTube Music, Kids, Studio, TV ne comptent pas`() {
        for (pkg in listOf(
            "com.google.android.apps.youtube.music",
            "app.morphe.android.apps.youtube.music",
            "com.google.android.apps.youtube.kids",
            "com.google.android.apps.youtube.creator",
            "com.google.android.youtube.tv",
            "com.google.android.apps.youtube.unplugged",
        )) assertEquals(pkg, null, keyFor(pkg))
    }

    @Test fun `autres applis suivies et inconnues`() {
        assertEquals("tiktok", keyFor("com.zhiliaoapp.musically"))
        assertEquals("instagram", keyFor("com.instagram.android"))
        assertEquals("x", keyFor("com.twitter.android"))
        assertEquals(null, keyFor("com.whatsapp"))
        assert(TRACKED.values.flatten().let { it.size == it.toSet().size }) // aucun paquet dans deux applis
    }

    @Test fun `régression Morphe - ouverte avant minuit, interactions avant la pause`() {
        // Séquence réelle relevée sur le téléphone le 3 novembre (heures depuis minuit)
        val yt = "app.morphe.android.youtube"
        val main = "com.google.android.apps.youtube.app.watchwhile.MainActivity"
        val USER_INTERACTION = 7
        val STANDBY_BUCKET_CHANGED = 11
        fun at(h: Int, m: Int, sec: Int) = ((h * 60 + m) * 60 + sec) * 1000L
        val r = calc(
            Ev(yt, "", STANDBY_BUCKET_CHANGED, at(0, 3, 0)),
            Ev(yt, "", USER_INTERACTION, at(0, 10, 0)),
            Ev(yt, main, PAUSED, at(0, 28, 17)),
            Ev(yt, main, STOPPED, at(0, 28, 17)),
            Ev(yt, main, RESUMED, at(8, 0, 17)), Ev(yt, main, PAUSED, at(8, 0, 18)), Ev(yt, main, STOPPED, at(8, 0, 18)),
            Ev(yt, main, RESUMED, at(8, 0, 27)), Ev(yt, main, PAUSED, at(8, 0, 34)), Ev(yt, main, STOPPED, at(8, 0, 35)),
            Ev(yt, main, RESUMED, at(10, 50, 35)), Ev(yt, main, PAUSED, at(10, 50, 35)),
            Ev(yt, main, RESUMED, at(10, 50, 35)), Ev(yt, main, STOPPED, at(10, 50, 36)), Ev(yt, main, PAUSED, at(10, 50, 38)),
        )
        // 28 min 17 s avant 0h28, puis 1 s + 7 s + 3 s
        assertEquals(at(0, 28, 17) + 1000 + 7000 + 3000, r[yt])
    }

    @Test fun `les événements hors premier plan sont ignorés`() {
        val r = calc(Ev(tt, "", 7, min(1)), Ev(tt, "Main", RESUMED, min(5)), Ev(tt, "", 7, min(6)), Ev(tt, "Main", PAUSED, min(10)))
        assertEquals(min(5), r[tt])
    }

    @Test fun `aucun événement`() {
        assertEquals(emptyMap<String, Long>(), calc())
    }
}
