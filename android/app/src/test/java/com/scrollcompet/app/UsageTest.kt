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

    @Test fun `YouTube Morphe compte dans YouTube`() {
        assert("app.morphe.android.youtube" in TRACKED.getValue("youtube"))
        assert(TRACKED.values.flatten().let { it.size == it.toSet().size }) // aucun paquet dans deux applis
    }

    @Test fun `aucun événement`() {
        assertEquals(emptyMap<String, Long>(), calc())
    }
}
