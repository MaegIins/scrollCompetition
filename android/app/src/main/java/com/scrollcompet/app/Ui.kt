package com.scrollcompet.app

import android.app.Activity
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController

/**
 * Android 15 affiche les applis « bord à bord » : sans ça, le contenu passe sous la barre
 * d'état et la barre de navigation. On décale la vue de la taille des barres (et du clavier).
 */
fun applySystemBarInsets(view: View) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return // avant Android 11 : pas de bord à bord imposé
    view.setOnApplyWindowInsetsListener { v, insets ->
        val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
        v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        insets
    }
    view.requestApplyInsets()
}

/** Icônes de la barre d'état en sombre (fond clair « papier » de l'appli). */
fun Activity.darkStatusBarIcons() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    // decorView (et non window.insetsController) : crée la fenêtre si besoin, sinon NPE avant setContentView (Android 16)
    window.decorView.windowInsetsController?.setSystemBarsAppearance(
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
    )
}
