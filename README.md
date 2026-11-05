# 🚀 Sortarr — Prowlarr Priority & Ratio Manager

**Sortarr** est une application web moderne (SvelteKit + Node.js) conçue pour gérer, superviser et optimiser automatiquement l'ordre de priorité de vos indexeurs **Prowlarr** en fonction de vos statistiques réelles sur chaque tracker privé (**Ratio**, **Upload**, **Download**, **Buffer**, **Freeleech**, **Points / Jetons / Karma / Zen / Crédits** et **Seeds**).

Contrairement à Prowlarr qui ne connaît pas votre ratio ni l'état du Freeleech de vos comptes, **Sortarr** interroge directement les API ou pages de profil de vos trackers pour prioriser intelligemment les indexeurs lors des recherches automatisées de **Sonarr**, **Radarr**, **Lidarr** ou **Readarr**.

---

## 📸 Aperçu

### 1. Tableau de bord principal & Grille des devises
*Supervision en temps réel de l'état de l'auto-tri, actions rapides et vue synthétique des points, jetons, karma, crédits et seeds de vos trackers privés :*

![Tableau de bord principal - Gestion des indexeurs](https://i.imgur.com/O0pO3nz.png)

### 2. Gestion des priorités Prowlarr & Ratios réels
*Liste ordonnée de vos indexeurs avec affichage des ratios, upload, download, buffers, seeds actifs et badges d'état (FL, PAUSE, Privé/Semi-privé) :*

![Priorités Prowlarr et statistiques des indexeurs](https://i.imgur.com/5VXiMN8.png)

### 3. Statistiques & Variations journalières
*Suivi jour par jour des ratios et devises avec calcul instantané des gains et variations du jour (`+X auj.`) :*

![Statistiques quotidiennes des ratios et devises](https://i.imgur.com/dfpD6YH.png)

### 4. Graphiques d'évolution détaillés par tracker
*Courbes SVG interactives d'évolution (Ratio / Points / Karma / Astra), KPIs de buffer net et historique journalier des variations :*

![Graphiques d'évolution par tracker](https://i.imgur.com/Tvd3ICB.png)

---

## ✨ Fonctionnalités principales

- 🎯 **Gestion des priorités Prowlarr (Drag & Drop + Auto-tri)** :
  - Réordonnez manuellement vos indexeurs par glisser-déposer ou laissez l'algorithme de tri optimiser vos priorités en un clic.
  - Application directe des priorités (`1` à `N`) vers votre instance Prowlarr via son API `v1`.
- 🧠 **Algorithme d'Auto-tri intelligent** :
  1. **Trackers sans ratio (publics) ou à ratio infini (`∞`)** en tête.
  2. **Trackers en Freeleech actif (`FL`)** triés du **plus haut ratio au plus bas**.
  3. **Autres trackers privés** triés du **plus haut ratio au plus bas** (avec prise en compte du buffer en cas d'égalité).
- 🏷️ **Protection automatique du ratio par Tag (`no-arr`) & Intégration Radarr / Sonarr / Cross-seed** :
  - Définition d'un seuil de ratio personnalisable (par défaut `1.0`).
  - Attribution automatique d'un tag d'exclusion (par défaut `no-arr`) sur vos indexeurs Prowlarr dès que leur ratio réel passe sous le seuil.
  - **Association directe avec Radarr et Sonarr** via leurs API `v3` : Sortarr synchronise et applique directement le tag sur les indexeurs de vos applications *Arr.
  - **Préservation de votre ratio** : dans Radarr/Sonarr, un indexeur doté d'un tag est strictement réservé aux médias possédant ce même tag. Comme vos médias n'ont pas ce tag, Radarr et Sonarr ne lancent plus de grabs automatiques sur ces trackers, stoppant toute dégradation du ratio.
  - **Compatible Cross-seed** : l'indexeur reste actif et synchronisé dans Prowlarr pour la complétion de seeds et les recherches de cross-seed.
  - **Restitution automatique** : dès que le ratio remonte au-dessus du seuil, le tag est automatiquement retiré.
  - **Exemption Freeleech** : option pour ne pas brider un tracker lorsqu'il est en Freeleech (`FL`).
  - **Badge visuel `🏷️ no-arr`** sur le tableau de bord pour identifier immédiatement les indexeurs bridés.
- ⏱️ **Planificateur en arrière-plan (Auto-Sort Scheduler)** :
  - Exécute automatiquement la récupération des statistiques, la mise à jour des priorités Prowlarr et la synchronisation des tags de protection à intervalle régulier, même en l'absence d'utilisateur connecté.
- 🪙 **Tableau de bord des Points, Jetons, Karma, Zen & Crédits** :
  - Visibilité complète sur la page d'accueil de toutes les monnaies et bonus de vos trackers (**Karma & Astras** pour AstraTorrent, `JETONS` V3X + gain `/h` + jetons FL, `ZEN` C411 + niveau, `CRÉDITS` TR4KER & Draupnirr, `CRAZY BONUS` Crazy Spirits, `SEEDBONUS` UNIT3D/G3MINI/TeamFlix, `BONUS` Nostradamus & SpeedApp) ainsi que du nombre de torrents en **Seed**.
- 📈 **Statistiques quotidiennes des ratios (`/stats`)** :
  - Enregistrement automatique jour par jour du ratio, de l'upload, du download, du buffer et des devises pour chaque tracker (jusqu'à 365 jours d'historique).
  - Courbes d'évolution SVG interactives, bascule de vue indépendante par carte de tracker (Ratio / Points / Karma / Astra), calcul des variations journalières (`Δ Ratio / j`, `Δ Upload / j`, `Δ Download / j`), journal quotidien par date et matrice comparative.
- 💾 **Sauvegarde automatique en temps réel de la configuration** :
  - Chaque modification dans les paramètres est automatiquement synchronisée et enregistrée avec un indicateur visuel en direct (`💾 Sauvegardé`).
- 🔐 **Sécurité avancée & Captcha personnalisable** :
  - Inscription initiale automatique au premier lancement (`/register`), puis connexion obligatoire (`/login`).
  - Mots de passe hachés avec `scrypt` + sel aléatoire et option de modification du mot de passe.
  - **Double authentification (2FA TOTP)** compatible Google Authenticator, Authy et Bitwarden, avec QR Code et 6 codes de secours à usage unique.
  - **Protection anti-bot modulable** : Captcha visuel SVG intégré par défaut (sans clé externe), support de **Google reCAPTCHA v2**, ou désactivation complète du captcha pour les réseaux internes sécurisés.

---

## 🔌 Trackers & Connecteurs pris en charge

Sortarr intègre des connecteurs dédiés pour les principaux trackers francophones et internationaux :

| Tracker / Moteur | Mode de récupération | Données récupérées |
| :--- | :--- | :--- |
| **UNIT3D** *(G3MINI, TeamFlix, The Old School, Generation Free…)* | API native `GET /api/user` (`Bearer` / `api_token`) | Ratio, Upload, Download, Buffer, Seedbonus, Seeds, Jetons FL, Freeleech global/perso |
| **V3X** | API native `GET https://api.v3x.club/api/me` (`Bearer`) | Ratio, Upload, Download, Buffer, Jetons (`bonusPoints`), Gain `/h`, Jetons FL, Seeds, Niveau, Freeleech |
| **C411** | API native `GET /api/user/profile` (`Bearer`) | Ratio, Upload, Download, Buffer, Points **Zen**, Niveau (`Niv.`), Freeleech |
| **TR4KER** | API native `GET https://tr4ker.net/api/me` (`X-Api-Key`) | Ratio, Upload (+ bonus), Download, Buffer, **Crédits**, Freeleech global/perso |
| **Draupnirr** | API native `GET https://draupnirr.xyz/api/me` (`X-Api-Key`) | Ratio, Upload (+ bonus), Download, Buffer, **Crédits**, Invitations, Freeleech |
| **AstraTorrent** | API native `GET https://astratorrent.la/api/user.php` (`apikey`) | Ratio, Upload, Download, Buffer, **Karma / Astra**, Contrats actifs, Seeds, Freeleech |
| **SpeedApp** | API native `GET https://speedapp.io/api/me` (`Bearer` ou `email:pass`) | Ratio, Upload, Download, Buffer, Bonus, Seeds, Freeleech |
| **TeamFlix** | API native `GET https://tracker.teamflix.cc/api/user` (`Bearer`) | Ratio, Upload, Download, Buffer, Seedbonus, Seeds, Freeleech |
| **Crazy Spirits** | Cookie de session (`uid=...; pass=...`) ou `api-ratio` | Ratio, Upload, Download, Buffer, **Crazy Bonus** |
| **Nostradamus** | Cookie de session (`_nostradamus_key=...` + PoW Anubis / LiveView) ou `api-ratio` | Ratio, Upload, Download, Buffer, Points Bonus |
| **YggReborn** | Cookie (`__ygg_sess=...; cf_clearance=...`) ou exporter Prometheus `/metrics` | Ratio, Upload, Download, Buffer |
| **Service `api-ratio`** | Intégration [`kreezx/api-ratio`](https://github.com/kreezx/api-ratio) (`GET /ratios`) | C411, TR4KER, Gemini, Crazy Spirits, Nostradamus, La Cale, Memphis, TOS, GenFree, HD-Space, NEXUM, Redacted |
| **JSON personnalisé / Manuel / Public** | Endpoint JSON libre avec chemins personnalisés, saisie manuelle ou tracker public sans ratio | Configurable |

---

## 🛠️ Prérequis & Installation

### Prérequis
- **Node.js** `v18+` (ou `v20+` / `v22+` recommandé)
- **npm** (inclus avec Node.js)
- Une instance **Prowlarr** accessible avec sa clé API (*Prowlarr → Settings → General → Security → API Key*)

### 1. Cloner le dépôt et installer les dépendances

```bash
git clone https://github.com/LRoffic/Sortarr.git
cd Sortarr
npm install
```

### 2. Lancer en mode développement

```bash
npm run dev
```
L'application sera accessible sur **`http://localhost:5173`**.

### 3. Compiler et lancer en production (sans Docker)

```bash
# Générer le build de production
npm run build

# Démarrer le serveur Node.js (port 3000 par défaut)
npm run start
```
Pour personnaliser le port ou l'hôte d'écoute en production :
```bash
# Sous Linux / macOS
PORT=3000 HOST=0.0.0.0 node build/index.js

# Sous Windows (PowerShell)
$env:PORT=3000; node build/index.js
```

*(Optionnel : si l'un de vos trackers utilise un certificat SSL intermédiaire système sous Windows, vous pouvez démarrer Node avec `node --use-system-ca build/index.js`, bien que Sortarr embarque déjà un fallback TLS automatique).*

---

## 🐳 Déploiement avec Docker & Docker Compose

Sortarr fournit une image Docker officielle multi-architecture (`linux/amd64` pour PC/serveurs x86 et `linux/arm64` pour Raspberry Pi, Apple Silicon, etc.) hébergée sur **GitHub Container Registry (GHCR)**.

### Option 1 : Déploiement avec Docker Compose (Recommandé)

Créez un fichier `docker-compose.yml` dans votre dossier de déploiement :

```yaml
services:
  sortarr:
    # Image officielle multi-architecture sur GHCR
    image: ghcr.io/lroffic/sortarr:latest
    container_name: sortarr
    restart: unless-stopped
    ports:
      # Port hôte : Port conteneur (adaptez le premier port selon vos besoins)
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
      - TZ=Europe/Paris
    volumes:
      # Persistance de la configuration, des identifiants et de l'historique des stats
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/login"]
      interval: 30s
      timeout: 5s
      start_period: 15s
      retries: 3
```

Lancez le conteneur en arrière-plan :

```bash
docker compose up -d
```

Pour mettre à jour Sortarr avec la dernière version publiée :

```bash
docker compose pull
docker compose up -d
```

### Option 2 : Lancement direct avec Docker CLI (`docker run`)

```bash
docker run -d \
  --name sortarr \
  --restart unless-stopped \
  -p 3000:3000 \
  -e TZ=Europe/Paris \
  -v $(pwd)/data:/app/data \
  ghcr.io/lroffic/sortarr:latest
```

### Option 3 : Construire l'image Docker localement depuis les sources

Si vous préférez builder vous-même l'image :

```bash
# Cloner le dépôt
git clone https://github.com/LRoffic/Sortarr.git
cd Sortarr

# Construire l'image locale
docker build -t sortarr:local .

# Lancer le conteneur avec l'image construite localement
docker run -d \
  --name sortarr \
  --restart unless-stopped \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  sortarr:local
```

### 📋 Documentation des paramètres Docker

| Paramètre | Description |
| :--- | :--- |
| `image` | `ghcr.io/lroffic/sortarr:latest` pour la dernière version stable, ou un tag précis (ex: `:1.0.0`). |
| `ports` | `3000:3000` — Redirige le port `3000` de votre machine vers Sortarr. Vous pouvez changer le premier chiffre (ex: `8080:3000`) si le port `3000` est déjà utilisé. |
| `volumes` | `./data:/app/data` — **Indispensable** : conserve vos identifiants administrateur, votre configuration Prowlarr/trackers et tout l'historique des ratios même lors de la recréation du conteneur. |
| `environment` | `TZ=Europe/Paris` (fuseau horaire), `PORT=3000`, `HOST=0.0.0.0`. |
| `user` | Le conteneur s'exécute automatiquement avec l'utilisateur sécurisé non-root `node` (UID/GID 1000). |
| `healthcheck` | Vérifie périodiquement la disponibilité du serveur HTTP via `wget`. |

---

## 📖 Guide d'utilisation

### 1. Création du compte administrateur (`/register`)
Au tout premier lancement, aucun utilisateur n'étant enregistré, Sortarr vous redirige automatiquement vers la page **Création du compte administrateur** (`/register`). Choisissez un identifiant et un mot de passe.

### 2. Configuration de Prowlarr et des Trackers (`/settings`)
1. Rendez-vous dans l'onglet **⚙️ Configuration**.
   > 💡 **Sauvegarde automatique** : Chaque modification (champs de texte, cases à cocher, interrupteurs) est automatiquement sauvegardée en direct sans nécessiter de validation manuelle, avec confirmation visuelle (`💾 Sauvegardé`).
2. Renseignez l'**URL de Prowlarr** (ex. `http://localhost:9696`) et votre **Clé API Prowlarr**.
3. Dans la section **📊 Trackers (ratio, buffer, freeleech)** :
   - Cliquez sur **🔎 Détecter automatiquement** ou activez chaque tracker individuellement.
   - Sélectionnez le connecteur correspondant à votre tracker :
     - **UNIT3D / G3MINI / TeamFlix / C411 / TR4KER / Draupnirr / AstraTorrent / V3X / SpeedApp** : collez votre clé API profil (ou laissez vide si la clé renseignée dans Prowlarr est la même).
     - **Crazy Spirits** : collez votre cookie `uid=...; pass=...`.
     - **Nostradamus** : collez votre cookie `_nostradamus_key=...`.
     - **YggReborn** : collez votre cookie `__ygg_sess=...; cf_clearance=...` (ou l'URL de `yggreborn-exporter`).
   - Cliquez sur **🔌 Tester** à côté d'un tracker pour vérifier instantanément son ratio, son upload/download, ses points et son statut Freeleech.
4. Activez si souhaité l'**✨ Auto-tri en arrière-plan** en choisissant l'intervalle d'exécution en minutes.

### 3. Protection du ratio par Tag & Intégration Radarr / Sonarr (`/settings`)
Pour empêcher **Radarr** et **Sonarr** de lancer des téléchargements automatiques sur les trackers dont votre ratio est faible tout en continuant de pouvoir seeder et cross-seeder dessus :

1. Dans la section **🏷️ Protection du ratio par Tag**, activez l'interrupteur.
2. Définissez le **Nom du tag Prowlarr / *Arr** (par défaut `no-arr`).
3. Définissez le **Seuil de ratio minimum** (par défaut `1.0`). Dès que le ratio réel d'un tracker est `< seuil`, Sortarr lui applique le tag. Dès qu'il repasse `≥ seuil`, le tag est retiré.
4. Cochez **⚡ Exempter les trackers en Freeleech (FL)** pour ne pas brider un tracker lorsqu'il est en Freeleech (les téléchargements n'impactant pas le ratio).
5. **Association directe avec Radarr et Sonarr** :
   - Renseignez l'URL et la clé API de **Radarr** et/ou **Sonarr**.
   - Cliquez sur les boutons **Tester connexion** pour valider l'accès aux API.
6. Cliquez sur **🏷️ Synchroniser les tags maintenant** pour appliquer immédiatement les tags sur Prowlarr, Radarr et Sonarr (ou laissez l'Auto-tri périodique le faire automatiquement).

> **Pourquoi cette méthode est idéale pour le ratio et cross-seed ?**
> Dans l'écosystème *Arr, un indexeur tagué n'est sollicité que pour les films ou séries portant ce même tag. Comme vos médias surveillés ne portent pas ce tag, Radarr et Sonarr ne grabberont plus jamais automatiquement de release sur ces trackers à risque. En revanche, l'indexeur reste actif dans Prowlarr, ce qui permet à vos torrents existants de continuer à seeder et aux outils d'injection comme **cross-seed** de continuer à fonctionner.

### 4. Gestion des priorités et suivi des points (`/`)
- Sur la page **Indexeurs** (`/`), consultez en haut le bandeau récapitulatif **🪙 Points, Jetons, Karma, Crédits & Bonus** ainsi que les cartes détaillées de chaque tracker.
- Les indexeurs protégés par la règle de ratio affichent un badge violet **`🏷️ no-arr`** aux côtés des éventuels badges `FL` (Freeleech) ou `PAUSE`.
- Cliquez sur **✨ Auto-trier (local)** pour prévisualiser le tri optimal ou glissez-déposez les cartes manuellement.
- Cliquez sur **💾 Appliquer les priorités** pour envoyer le nouvel ordre à Prowlarr et synchroniser les tags.

### 5. Suivi quotidien des ratios (`/stats`)
- Ouvrez l'onglet **📈 Statistiques** pour consulter l'évolution jour par jour de vos ratios, uploads, downloads, buffers et points bonus :
  - **📊 Par tracker** : courbe d'évolution et historique quotidien détaillé par tracker.
  - **📅 Journal par jour** : bilan de tous vos trackers groupé date par date.
  - **🧮 Tableau comparatif** : matrice croisée `Dates × Trackers`.

### 6. Sécurité : Mot de passe, 2FA & reCAPTCHA (`/settings`)
- En bas de la page **⚙️ Configuration** (section **🔐 Sécurité**), vous pouvez :
  - **Modifier votre mot de passe** à tout moment.
  - **Activer la double authentification (TOTP 2FA)** en scannant le QR Code avec votre application d'authentification et en conservant vos 6 codes de secours.
  - **Configurer ou désactiver la protection anti-bot** :
    - *Captcha visuel SVG Sortarr* (actif par défaut, fonctionne hors-ligne sans clé).
    - *Google reCAPTCHA v2* (case à cocher « Je ne suis pas un robot » avec vos clés site et secrète).
    - *Désactiver totalement le captcha* (option disponible pour simplifier la connexion si Sortarr est hébergé uniquement sur votre réseau local sécurisé).

---

## 🗄️ Stockage des données & Confidentialité

Sortarr fonctionne sans serveur de base de données externe : toutes les données sont stockées localement au format JSON dans le dossier **`data/`** (exclu de Git via `.gitignore`) :
- `data/config.json` : paramètres Prowlarr et clés/cookies des trackers.
- `data/users.json` : comptes utilisateurs (mots de passe hachés avec `scrypt`), secret TOTP 2FA et configuration reCAPTCHA.
- `data/stats_history.json` : historique quotidien des ratios, uploads, downloads, buffers et points.
- `data/autosort.log` : journal d'exécution du planificateur d'auto-tri.

> ⚠️ **Important** : Ne partagez et ne commitez jamais le dossier `data/`, car il contient vos clés API et cookies de session privés.

---

## ✨ Note de développement

Ce projet **a été, est et sera 100 % vibe codé** 🚀🎶

