# 📱 Scroll Competition

Qui a le plus scrollé TikTok / Reels / Twitter aujourd'hui ? Celui-là gagne (bravo… ou pas).

- **Front** : Vue 3 + Vite + Tailwind v4 (`client/`)
- **Back** : Express + SQLite natif de Node (`node:sqlite`, Node ≥ 22) (`server/`)

## Lancer en dev

```bash
npm run install:all
npm run dev          # API sur :3001, front sur :5173 (accessible sur le réseau local)
```

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

Chacun s'inscrit avec un pseudo + PIN, puis saisit chaque jour son temps par appli (TikTok, Reels, Twitter)
depuis Réglages › Temps d'écran (iOS) ou Bien-être numérique (Android). On se base sur la confiance.

- **Classement** par jour, semaine, mois ou depuis le début ; top 10 + ta place si tu es plus bas.
  Les ex æquo partagent le rang. Les inactifs depuis plus de 7 jours sont masqués.
- **Victoires** : nombre de journées gagnées depuis le début (journée en cours exclue).
- **Suspect** : badge pour toute journée à plus de 24h de scroll (on ne bloque pas, on affiche).
- **Stats** : courbes de tout le monde sur 7 ou 30 jours (légende cliquable pour isoler / ajouter des gens),
  détail par appli, vue tableau.
- **Profil** : photo, pseudo, changement de PIN (déconnecte les autres appareils).

Sécurité : PIN haché (scrypt), blocage progressif après 5 PIN faux (30 s → 15 min max).
