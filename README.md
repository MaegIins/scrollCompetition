# 📱 Scroll Competition

Qui a le plus scrollé TikTok / Reels / Twitter / YouTube aujourd'hui ? Celui-là gagne (bravo… ou pas).

- **Front** : Vue 3 + Vite + Tailwind v4 (`client/`)
- **Back** : Express + SQLite natif de Node (`node:sqlite`, Node ≥ 22) (`server/`)

## Lancer en dev

```bash
npm run install:all
npm run dev          # API sur :3001, front sur :5173 (accessible sur le réseau local)
```

## Appli Android

Prérequis : JDK 17+ et le SDK Android (`ANDROID_HOME`, plateforme 35 + build-tools 35).

```bash
npm run build:android   # compile l'APK et la publie dans client/public/scroll-compet.apk (servie sur /scroll-compet.apk)
npm run test:android    # tests JUnit du calcul du temps d'usage
```

L'APK est signée avec la clé de debug de la machine qui compile : pour que les mises à jour s'installent
par-dessus l'ancienne version, compile toujours depuis la même machine. Elle s'installe hors Play Store
(« sources inconnues »).

### Récupérer l'APK sans recompiler

La compilation est longue : si l'APK a déjà été compilée une fois, inutile de recommencer.

- **Depuis le téléphone** : le site sert directement la dernière APK compilée, sur
  `http://<adresse-du-serveur>/scroll-compet.apk` (ou Profil › Saisie automatique › Android › Télécharger).
  En dev, `client/public/` est servi tel quel par Vite : la nouvelle version est en ligne dès la fin de
  `npm run build:android`, sans redémarrer quoi que ce soit.
- **Sur la machine qui a compilé**, le fichier est ici :
  - `client/public/scroll-compet.apk` (copie publiée par `npm run build:android`) ;
  - `android/app/build/outputs/apk/release/app-release.apk` (sortie brute de Gradle) ;
  - `client/dist/scroll-compet.apk` après un `npm run build` (version servie en prod).
- **Installer par câble ou en Wi-Fi** (débogage USB / sans fil activé sur le téléphone) :
  ```bash
  ~/Android/Sdk/platform-tools/adb install -r client/public/scroll-compet.apk
  ```
- **Vérifier la version d'un fichier APK** (elle s'affiche aussi en bas de l'écran de l'appli) :
  ```bash
  ~/Android/Sdk/build-tools/35.0.0/aapt2 dump badging client/public/scroll-compet.apk | grep -o "versionName='[^']*'"
  ```

L'APK n'est pas versionnée dans git (fichier généré) : après un `git clone` sur une nouvelle machine, il faut
la compiler une fois, ou la copier depuis la machine qui l'a compilée (et garder cette machine pour les
mises à jour, à cause de la signature).

Pensez à incrémenter `versionCode` / `versionName` dans `android/app/build.gradle.kts` à chaque nouvelle
version : c'est ce qui permet de vérifier, en bas de l'écran de l'appli, que le téléphone a bien la dernière.

## Tests

```bash
npm test             # serveur + client, sans dépendance (node:test)
```

- `server/test/api.test.js` : toutes les routes sur une base en mémoire, avec une horloge simulée
  (sessions iPhone, passage de minuit, jour par défaut à Paris…), plus la migration d'une ancienne base.
- `server/test/unit.test.js` : dates, pseudos, découpage des sessions par jour (dont changement d'heure).
- `client/test/utils.test.js` : dates locales, formats de durée, graduations des graphes, filtre des chiffres.

Le serveur est découpé en `server/app.js` (`createApp({ dbPath, inviteCode, appTz, now })`, testable)
et `server/index.js` (lit les variables d'env et lance l'écoute).

## Prod (un seul process)

```bash
npm run build        # build le front dans client/dist
INVITE_CODE=monsecret PORT=3001 npm start   # Express sert l'API + le front
```

Variables d'env :
- `PORT` (défaut 3001)
- `INVITE_CODE` : si défini, requis pour s'inscrire (évite que n'importe qui rejoigne)
- `DATA_DIR` : dossier de la base SQLite (défaut `server/data/`)

## Fonctionnement

Chacun s'inscrit avec un pseudo + PIN, puis saisit chaque jour son temps par appli (TikTok, Reels, Twitter, YouTube)
depuis Réglages › Temps d'écran (iOS) ou Bien-être numérique (Android). On se base sur la confiance.

- **Classement** par jour, semaine, mois ou depuis le début ; top 10 + ta place si tu es plus bas.
  Les ex æquo partagent le rang. Les inactifs depuis plus de 7 jours sont masqués.
- **Victoires** : nombre de journées gagnées depuis le début (journée en cours exclue).
- **Suspect** : badge pour toute journée à plus de 24h de scroll (on ne bloque pas, on affiche).
- **Stats** : courbes de tout le monde sur 7 ou 30 jours (légende cliquable pour isoler / ajouter des gens),
  détail par appli, vue tableau.
- **Profil** : photo, pseudo, changement de PIN (déconnecte les autres appareils).

## Saisie automatique

Dans le profil, chacun génère une **clé perso** (affichée une fois, stockée hachée) et suit le tuto :

- **Android** : mini appli maison (`android/`, Kotlin). Elle lit le temps d'usage Android depuis minuit
  (événements `UsageStatsManager`) et l'envoie toutes les 30 min via WorkManager.
  Configuration en un geste : sur le téléphone, Profil › Android › « Connecter l'appli » ouvre
  `scrollcompet://setup?url=…&key=…`. Route utilisée : `POST /api/auto/usage` avec `Authorization: Bearer sc_…`
  et `{"day": "YYYY-MM-DD", "tiktok": s, "instagram": s, "x": s, "youtube": s}` en **secondes**.
- **iPhone** (Raccourcis, automatisations « App ouverte / fermée ») :
  `POST /api/auto/event?app=tiktok&event=open|close&key=sc_…`. Le serveur calcule les sessions
  (découpées à minuit, ignorées au-delà de 4h ou sans ouverture).

Instagram compte dans Reels. Pour une appli suivie automatiquement, l'automatique remplace la saisie manuelle du jour.
Le téléphone doit pouvoir joindre le serveur (même Wi-Fi en dev, ou appli déployée).

Variable d'env : `APP_TZ` (défaut `Europe/Paris`).

Sécurité : PIN haché (scrypt), blocage progressif après 5 PIN faux (30 s → 15 min max).
