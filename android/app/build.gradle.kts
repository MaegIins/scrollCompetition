plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.scrollcompet.app"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.scrollcompet.app"
        minSdk = 26 // Android 8
        targetSdk = 35
        versionCode = 5
        versionName = "1.4"

        // Adresse du site chargée au premier lancement (modifiable dans l'écran Synchro)
        val defaultUrl = (project.findProperty("scrollcompet.defaultUrl") as String?).orEmpty()
        buildConfigField("String", "DEFAULT_URL", "\"$defaultUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Appli entre potes, installée hors Play Store : la clé de debug suffit
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        buildConfig = true
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // Synchro périodique en arrière-plan, survit aux redémarrages
    implementation("androidx.work:work-runtime:2.9.1")
    testImplementation("junit:junit:4.13.2")
}
