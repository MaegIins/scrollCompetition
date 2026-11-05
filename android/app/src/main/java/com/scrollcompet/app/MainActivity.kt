package com.scrollcompet.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Écran principal : le site Scroll Compet affiché dans l'appli (classement, stats, profil…).
 * Le site reste utilisable dans un navigateur ; ici il sait qu'il tourne dans l'appli grâce à
 * l'objet JavaScript `window.ScrollApp` et au user-agent « ScrollCompetApp ».
 */
class MainActivity : Activity() {
    private lateinit var cfg: Config
    private lateinit var web: WebView
    private var loadedUrl = ""
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        cfg = Config(this)
        if (cfg.serverUrl.isEmpty()) cfg.serverUrl = BuildConfig.DEFAULT_URL
        Sync.schedule(this)
        darkStatusBarIcons()

        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#F1ECE1"))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // le site garde sa session dans localStorage
            settings.userAgentString += " ScrollCompetApp/${packageManager.getPackageInfo(packageName, 0).versionName}"
            addJavascriptInterface(Bridge(), "ScrollApp")
            webViewClient = Client()
            webChromeClient = Chrome()
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#F1ECE1"))
            addView(web)
        }
        applySystemBarInsets(root)
        setContentView(root)

        if (!handleSetupLink(intent?.data)) loadSite()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleSetupLink(intent.data)
    }

    override fun onResume() {
        super.onResume()
        // L'adresse a pu changer dans l'écran Synchro
        if (cfg.serverUrl != loadedUrl) loadSite()
        notifyPage()
    }

    @Deprecated("Remplacé par OnBackPressedDispatcher dans AndroidX, inutile ici")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else @Suppress("DEPRECATION") super.onBackPressed()
    }

    private fun loadSite() {
        loadedUrl = cfg.serverUrl
        if (loadedUrl.startsWith("http")) {
            web.loadUrl(loadedUrl)
        } else {
            startActivity(Intent(this, SyncActivity::class.java)) // pas d'adresse : on la demande
        }
    }

    /** Prévient la page que l'état de la synchro a changé (pour masquer le bandeau « Activer »). */
    private fun notifyPage() {
        web.evaluateJavascript("window.dispatchEvent(new Event('scrollapp-change'))", null)
    }

    /**
     * scrollcompet://setup?url=…&key=sc_… : envoyé par le site (bouton « Activer la synchro auto »
     * dans l'appli, ou « Connecter l'appli » depuis un navigateur). Renvoie true si c'en était un.
     */
    private fun handleSetupLink(uri: Uri?): Boolean {
        if (uri == null || uri.scheme != "scrollcompet" || uri.host != "setup") return false
        setIntent(Intent()) // évite de retraiter le lien à la rotation
        val url = uri.getQueryParameter("url").orEmpty().trimEnd('/')
        val key = uri.getQueryParameter("key").orEmpty()
        if (!url.startsWith("http") || !key.startsWith("sc_")) {
            toast("Lien de connexion invalide")
            return false
        }
        cfg.serverUrl = url
        cfg.apiKey = key
        toast("Synchro auto activée")
        if (url != loadedUrl) loadSite()
        notifyPage()
        thread { Sync.run(this) }
        // Dernière étape : l'autorisation Android, gérée dans l'écran Synchro
        if (!Usage.hasPermission(this)) startActivity(Intent(this, SyncActivity::class.java))
        return true
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    /** Ce que la page peut appeler : window.ScrollApp.isConnected(), openSync(), syncNow(), lastSync(), version() */
    inner class Bridge {
        @JavascriptInterface fun isConnected(): Boolean = cfg.isConfigured && Usage.hasPermission(this@MainActivity)
        @JavascriptInterface fun hasKey(): Boolean = cfg.isConfigured
        @JavascriptInterface fun openSync() = runOnUiThread {
            startActivity(Intent(this@MainActivity, SyncActivity::class.java))
        }
        /**
         * Synchro immédiate, en arrière-plan. À la fin, la page reçoit l'événement « scrollapp-synced »
         * avec detail = { ok, message }.
         */
        @JavascriptInterface fun syncNow() {
            thread {
                val r = Sync.run(this@MainActivity)
                val detail = JSONObject()
                    .put("ok", r.isSuccess)
                    .put("message", r.fold({ it }, { "Échec : ${it.message}" }))
                runOnUiThread {
                    web.evaluateJavascript("window.dispatchEvent(new CustomEvent('scrollapp-synced', { detail: $detail }))", null)
                }
            }
        }
        @JavascriptInterface fun lastSync(): String = cfg.lastSync
        @JavascriptInterface fun version(): String = packageManager.getPackageInfo(packageName, 0).versionName ?: ""
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (uri.scheme == "scrollcompet") {
                handleSetupLink(uri)
                return true
            }
            // Le site reste dans l'appli ; les autres liens s'ouvrent dans le navigateur
            if (uri.host == Uri.parse(cfg.serverUrl).host) return false
            try {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: ActivityNotFoundException) {
                toast("Impossible d'ouvrir $uri")
            }
            return true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            val host = Uri.parse(cfg.serverUrl).host ?: cfg.serverUrl
            view.loadDataWithBaseURL(
                null,
                """
                <html><body style="background:#F1ECE1;color:#111;font-family:sans-serif;padding:32px">
                <h1 style="font-weight:900">SCROLL COMPET</h1>
                <p>Impossible de joindre <b>$host</b>.</p>
                <p style="color:#55524B;font-family:monospace;font-size:13px">${error.description}</p>
                <p><button onclick="location.href='${cfg.serverUrl}'" style="padding:12px 20px;border:2px solid #111;background:#FFD400;font-weight:bold">RÉESSAYER</button></p>
                <p><button onclick="ScrollApp.openSync()" style="padding:12px 20px;border:2px solid #111;background:#fff">CHANGER L'ADRESSE</button></p>
                </body></html>
                """.trimIndent(),
                "text/html", "utf-8", null,
            )
        }
    }

    // <input type="file"> (photo de profil) : ouvre le sélecteur d'images d'Android
    private inner class Chrome : WebChromeClient() {
        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try {
                @Suppress("DEPRECATION")
                startActivityForResult(params.createIntent(), PICK_FILE)
                true
            } catch (_: ActivityNotFoundException) {
                fileCallback = null
                false
            }
        }
    }

    @Deprecated("API Activity simple, sans AndroidX")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_FILE) return
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
        fileCallback = null
    }

    private companion object {
        const val PICK_FILE = 42
    }
}
