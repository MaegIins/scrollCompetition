package com.scrollcompet.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.time.LocalDate
import kotlin.concurrent.thread

/**
 * Écran unique : connexion au site, autorisation, temps du jour, synchro.
 * Interface construite en code (pas de XML ni de dépendance UI) pour rester minimal.
 */
class MainActivity : Activity() {
    private val paper = Color.parseColor("#F1ECE1")
    private val ink = Color.parseColor("#111111")
    private val hi = Color.parseColor("#FFD400")
    private val alert = Color.parseColor("#E8442E")

    private lateinit var cfg: Config
    private lateinit var root: LinearLayout
    private var showDiag = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        cfg = Config(this)
        handleSetupLink(intent)
        Sync.schedule(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleSetupLink(intent)
        render()
    }

    // Revenir des réglages Android (autorisation) rafraîchit l'écran
    override fun onResume() {
        super.onResume()
        render()
    }

    /** scrollcompet://setup?url=https://…&key=sc_… (bouton « Connecter l'appli » du site) */
    private fun handleSetupLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "scrollcompet" || data.host != "setup") return
        val url = data.getQueryParameter("url").orEmpty()
        val key = data.getQueryParameter("key").orEmpty()
        if (url.startsWith("http") && key.startsWith("sc_")) {
            cfg.serverUrl = url
            cfg.apiKey = key
            toast("Appli connectée à ${Uri.parse(url).host}")
            syncNow()
        } else {
            toast("Lien de connexion invalide")
        }
        setIntent(Intent()) // évite de retraiter le lien à la rotation
    }

    private fun render() {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(28))
            setBackgroundColor(paper)
        }
        setContentView(ScrollView(this).apply { setBackgroundColor(paper); addView(root) })

        title("SCROLL COMPET")
        caption("Envoie ton temps TikTok, Instagram, X et YouTube au classement, tout seul.")

        // 1. Connexion au site
        section("1. CONNEXION AU SITE")
        if (cfg.isConfigured) {
            text("✓ Connecté à ${Uri.parse(cfg.serverUrl).host}")
            link("modifier") { cfg.apiKey = ""; render() }
        } else {
            text("Sur ce téléphone, ouvre le site › Profil › Saisie automatique › Android, puis touche « Connecter l'appli ».")
            caption("Ou colle les infos à la main :")
            val url = input("Adresse du site (https://…)", cfg.serverUrl, InputType.TYPE_TEXT_VARIATION_URI)
            val key = input("Clé perso (sc_…)", "", InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD)
            button("Enregistrer", hi) {
                cfg.serverUrl = url.text.toString()
                cfg.apiKey = key.text.toString()
                if (cfg.isConfigured) syncNow() else toast("Adresse ou clé invalide")
                render()
            }
        }

        // 2. Autorisation
        section("2. AUTORISATION")
        if (Usage.hasPermission(this)) {
            text("✓ Accès aux données d'utilisation activé")
        } else {
            text("Android doit autoriser l'appli à lire ton temps d'utilisation. Active « Scroll Compet » dans la liste.")
            button("Ouvrir le réglage", hi) { startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }
            // Android 13+ bloque ce réglage pour les applis installées hors Play Store (« paramètre restreint »)
            caption(
                "Interrupteur grisé / « Paramètre restreint » ?\n" +
                    "1. Touche-le une fois ici, ferme le message.\n" +
                    "2. Réglages › Applis › Voir toutes les applis › Scroll Compet.\n" +
                    "3. Menu ⋮ en haut à droite › « Autoriser les paramètres restreints ».\n" +
                    "4. Reviens ici › Ouvrir le réglage : l'interrupteur marche."
            )
        }

        // 3. Aujourd'hui
        section("3. AUJOURD'HUI")
        if (Usage.hasPermission(this)) {
            val secs = Usage.secondsFor(this, LocalDate.now())
            secs.forEach { (k, v) -> row(LABELS[k] ?: k, Sync.fmt(v)) }
            row("TOTAL", Sync.fmt(secs.values.sum()), bold = true)
        } else {
            caption("Disponible une fois l'autorisation donnée.")
        }

        // 4. Synchro
        section("4. SYNCHRO")
        caption("Automatique toutes les 30 min environ (Android décide du moment exact).")
        if (cfg.lastSync.isNotEmpty()) {
            text(cfg.lastSync, color = if (cfg.lastSync.startsWith("Échec")) alert else ink)
        }
        button("Synchroniser maintenant", ink, textColor = Color.WHITE) { syncNow() }

        // 5. Diagnostic : ce qu'Android remonte vraiment (utile si une appli n'est pas comptée)
        section("5. DIAGNOSTIC")
        if (!showDiag) {
            link("voir les applis détectées aujourd'hui") { showDiag = true; render() }
        } else if (Usage.hasPermission(this)) {
            caption("Applis utilisées aujourd'hui (nom technique → appli du classement) :")
            val top = Usage.topApps(this, LocalDate.now())
            if (top.isEmpty()) caption("Aucune.")
            top.forEach { (pkg, sec) ->
                val key = keyFor(pkg)
                row(if (key != null) "$pkg → ${LABELS[key]?.substringBefore(' ')}" else pkg, Sync.fmt(sec), bold = key != null)
            }
            // Détail YouTube / Morphe : événements reçus, total agrégé d'Android, visibilité
            caption("\nDétail YouTube :")
            val yt = Usage.diagnose(this, LocalDate.now()) { "youtube" in it.lowercase() || "morphe" in it.lowercase() }
            if (yt.isEmpty()) caption("Aucun paquet YouTube trouvé.")
            yt.forEach { d ->
                caption(
                    "${d.pkg}\n  ${d.events} événements → ${Sync.fmt(d.seconds)} · compté : ${keyFor(d.pkg)?.let { LABELS[it] } ?: "non"}"
                )
            }
            link("masquer") { showDiag = false; render() }
        }

        caption("\nInstagram compte dans « Reels ». Pour ces applis, l'automatique remplace la saisie manuelle du jour.")
        caption("Version ${packageManager.getPackageInfo(packageName, 0).versionName}")
    }

    private fun syncNow() {
        thread {
            val r = Sync.run(this)
            runOnUiThread {
                toast(r.fold({ "Synchro OK" }, { "Échec : ${it.message}" }))
                render()
            }
        }
    }

    // --- Petits composants d'interface ------------------------------------------
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun box(fill: Int) = GradientDrawable().apply { setColor(fill); setStroke(dp(2), ink) }
    private fun lp(top: Int = 0) = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(top) }

    private fun title(s: String) = root.addView(TextView(this).apply {
        text = s; textSize = 34f; setTypeface(typeface, Typeface.BOLD); setTextColor(ink)
    })
    private fun section(s: String) = root.addView(TextView(this).apply {
        text = s; textSize = 13f; typeface = Typeface.MONOSPACE; setTextColor(ink)
        setPadding(0, dp(6), 0, dp(6))
        background = GradientDrawable().apply { setColor(paper) }
    }, lp(24))
    private fun text(s: String, color: Int = ink) = root.addView(TextView(this).apply {
        text = s; textSize = 16f; setTextColor(color)
    }, lp(4))
    private fun caption(s: String) = root.addView(TextView(this).apply {
        text = s; textSize = 13f; setTextColor(Color.parseColor("#55524B")); typeface = Typeface.MONOSPACE
    }, lp(6))
    private fun link(s: String, onClick: () -> Unit) = root.addView(TextView(this).apply {
        text = s; textSize = 13f; typeface = Typeface.MONOSPACE; setTextColor(ink); paintFlags = paintFlags or 8
        setOnClickListener { onClick() }
    }, lp(6))
    private fun input(hint: String, value: String, variation: Int) = EditText(this).apply {
        this.hint = hint; setText(value); textSize = 15f; setTextColor(ink); background = box(Color.WHITE)
        inputType = InputType.TYPE_CLASS_TEXT or variation
        setPadding(dp(12), dp(10), dp(12), dp(10)); isSingleLine = true
    }.also { root.addView(it, lp(8)) }
    private fun button(s: String, fill: Int, textColor: Int = ink, onClick: () -> Unit) = root.addView(Button(this).apply {
        text = s; isAllCaps = true; setTypeface(typeface, Typeface.BOLD); setTextColor(textColor); background = box(fill)
        stateListAnimator = null; setOnClickListener { onClick() }
    }, lp(10))
    private fun row(label: String, value: String, bold: Boolean = false) = root.addView(LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(dp(12), dp(10), dp(12), dp(10)); background = box(if (bold) hi else Color.WHITE)
        addView(TextView(context).apply {
            text = label; textSize = 15f; setTextColor(ink); if (bold) setTypeface(typeface, Typeface.BOLD)
        }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        addView(TextView(context).apply {
            text = value; textSize = 15f; typeface = Typeface.MONOSPACE; setTextColor(ink); gravity = Gravity.END
            if (bold) setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
        })
    }, lp(-2).apply { if (root.childCount > 0 && root.getChildAt(root.childCount - 1) !is LinearLayout) topMargin = dp(6) })

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}
