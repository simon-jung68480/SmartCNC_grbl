# 🛠️ SmartCNC — Interface Moderne de Commande GRBL 1.1

**SmartCNC** est une application web & desktop complète, réactive et ergonomique spécialement conçue pour le pilotage de **CNC-Routers maison** commandées par un **Arduino Uno + CNC Shield V3.0 exécutant le firmware GRBL 1.1**.

Développée comme une alternative moderne, légère et intuitive aux logiciels classiques (Universal Gcode Sender / UGS, Candle, bCNC), elle intègre une visualisation 3D en temps réel, un moteur de streaming G-Code haute performance insensible aux gros fichiers, une télécommande mobile Wi-Fi pour smartphone, ainsi qu'un ensemble complet d'assistants d'atelier.

---

## ✨ Fonctionnalités Clés

### 🖥️ 1. Pilotage & Visualisation 3D (Three.js)
- **Visualiseur 3D interactif** : Rotation orbitale, translation (pan) et zoom fluide avec vue isomérique et projections orthogonales (XY, XZ, YZ).
- **Parcours d'outil optimisé (Mode Clair atelier)** :
  - Déplacements rapides `G0` en **pointillés orange vif** (`#ea580c`).
  - Passes d'usinage `G1/G2/G3` à exécuter en **bleu franc**.
  - Passes déjà usinées colorées en **vert émeraude** en temps réel.
  - Boîte englobante cotée (`X × Y × Z mm`) autour de la pièce.
  - Représentation 3D animée de la broche et de la fraise en carbure.
- **Grille & Plateau réglables** :
  - Paramètre dédié permettant de **régler la hauteur de la grille par rapport au zéro machine** (idéal pour caler le plateau visuel au niveau réel de votre martyr, ex: `Z = -15.0 mm`).
  - Dimensions de plateau personnalisables et graduations tous les 50 ou 100 mm.

### ⚡ 2. Streamer G-Code Haute Performance
- **Virtual Scrolling (Windowing)** : Rendu fluide et immédiat des fichiers G-Code de **20 000 à plus de 200 000 lignes** sans aucun freeze de l'interface.
- **Suivi de la progression** : Pourcentage exact, numéro de ligne, temps écoulé et temps restant estimé.
- **Commandes temps réel synchronisées** : Lancement, Pause immédiate (Feed Hold `!`), Reprise (Cycle Start `~`), et Arrêt d'urgence (Soft Reset `0x18`).
- **Générateur de Surfaçage Martyr (Spoilboard Wizard)** : Créez en 1 clic un G-Code de surfaçage adapté aux dimensions de votre table et au diamètre de votre fraise.

### 📐 3. Prise d'Origine (DRO) & Modes avec/sans Fins de Course
- **Grand affichage DRO** : Coordonnées Pièce (`WPos`) et Machine (`MPos`) en chiffres lisibles (option Grand Format pour lecture à distance).
- **Mise à zéro sans déplacement** : Boutons `X = 0`, `Y = 0`, `Z = 0` et `Prendre Origine Pièce (XYZ = 0)` appliquant immédiatement `G10 L20 P1` sans faire voler la fraise.
- **Adaptation au type de machine (Paramétrable dans les réglages)** :
  - **Mode sans fin de course (manuel)** : Met en avant le bouton *« Mettre Machine à 0;0;0 ici »* et **masque le bouton `$H`** pour éviter toute alarme GRBL accidentelle sur une machine sans switchs.
  - **Mode avec fins de course physiques** : Affiche en grand le bouton *« Lancer Cycle Homing ($H) »* pour calibrer l'origine sur les contacteurs X/Y/Z.
- **Anti-crash brides de serrage** : Dégagement vertical automatique en Z (ex: `G0 Z10`) avant tout retour à l'origine `X0 Y0`.

### 🎯 4. Assistant de Cadrage & Framing Sécurisé
- **Visualiseur 2D interactif (SVG)** avec affichage des cotes X, Y, Z et du centre de pièce.
- **Marge de sécurité anti-brides réglable** (`0 mm`, `+2 mm`, `+5 mm`, `+10 mm`, `+15 mm`) pour vérifier le bridage du brut.
- **Déplacement rapide aux 4 coins et au centre** avec montée préalable en Z obligatoire avant tout mouvement horizontal.

### 📱 5. Télécommande Mobile / Smartphone (Pendant Wi-Fi)
- Accessible depuis n'importe quel smartphone ou tablette connecté au Wi-Fi de l'atelier via **`http://<IP_DU_PC>:3000?mode=pendant`**.
- Interface tactile optimisée pour doigts d'atelier avec retour par vibration haptique :
  - DRO géant lisible à 2 mètres.
  - Pavé de jogging directionnel haute réactivité (mode continu ou pas de 0.1 à 100 mm).
  - Boutons d'origine rapide `X=0`, `Y=0`, `Z=0` et `XYZ=0`.
  - Bouton Palpage Z direct avec voyant de contact en temps réel.
  - Immense bouton rouge **STOP URGENCE**.

### 🔊 6. Signaux Sonores d'Atelier (Web Audio API)
- 100% synthétisé et autonome (zéro MP3 externe, zéro latence, fonctionne hors-ligne) :
  - **Bip contact sonde (Touch Plate)** : Bip aigu instantané dès contact de la pince croco sur la cale métallique.
  - **Carillon de fin d'usinage** : Mélodie 3 notes harmoniques dès que le G-Code atteint 100%.
  - **Tonalité d'alarme** : Avertisseur bitonal puissant en cas d'alarme GRBL ou percussion de fin de course.
  - **Clic de jogging** haptique discret.
  - Réglage du volume et boutons de test individuels.

### 🕹️ 7. Contrôles Manette Gamepad & Clavier
- **Web Gamepad API native** : Détecte automatiquement une manette Xbox, PlayStation ou USB pour piloter les axes au joystick analogique avec réglage de zone morte (*Deadzone*) et vitesse proportionnelle.
- **Raccourcis clavier sécurisés** (Flèches pour X/Y, PageUp/PageDown pour Z, `[` et `]` pour le pas, Espace pour Pause).

### 📏 8. Palpage & Outils Avancés
- **Assistant Palpage (Touch Plate)** :
  - Palpage Z simple (dessus de brut).
  - Palpage X (bords gauche ou droit).
  - Palpage Y (bords avant ou arrière).
  - Détection automatique de coin XY avec compensation de l'épaisseur de cale et du rayon de fraise.
  - Palpage complet XYZ.
- **Bed Leveling / Auto-nivellement (Heightmap)** :
  - Scan de surface point par point et compensation bilinéaire en Z en temps réel sur le parcours d'outil.
- **Simulateur GRBL 1.1 haute fidélité intégré** :
  - Permet de tester toute l'application et d'exécuter des usinages virtuels sans brancher d'Arduino.

---

## 🔌 Schéma de Câblage — Arduino Uno + CNC Shield V3.0

> [!IMPORTANT]
> **Rappel essentiel GRBL 0.9 / 1.1 sur CNC Shield V3.0 :**
> Avec le passage à GRBL 0.9+, les broches **D11 (Spindle PWM)** et **D12 (Fin de course Z-Limit)** ont été inversées pour permettre le contrôle de vitesse broche par PWM matériel :
> - **Broche D11 (Sérigraphiée Z+ / Z- sur le Shield)** : Signal **Broche PWM** (Spindle Enable / PWM).
> - **Broche D12 (Sérigraphiée SpnEn sur le Shield)** : Contacteur **Fin de course Z-Limit**.

| Fonction | Broche Arduino Uno | Emplacement sur CNC Shield V3.0 |
| :--- | :---: | :--- |
| **Pas Axe X (Step)** | D2 | Driver X - Broche STEP |
| **Direction Axe X (Dir)** | D5 | Driver X - Broche DIR |
| **Pas Axe Y (Step)** | D3 | Driver Y - Broche STEP |
| **Direction Axe Y (Dir)** | D6 | Driver Y - Broche DIR |
| **Pas Axe Z (Step)** | D4 | Driver Z - Broche STEP |
| **Direction Axe Z (Dir)** | D7 | Driver Z - Broche DIR |
| **Activation Moteurs (Enable)** | D8 | Broche EN (commune à tous les drivers) |
| **Fin de course X (X-Limit)** | D9 | Connecteurs blancs `X+` / `X-` |
| **Fin de course Y (Y-Limit)** | D10 | Connecteurs blancs `Y+` / `Y-` |
| **Fin de course Z (Z-Limit)** | **D12** | Connecteurs noirs **`SpnEn`** *(inversion GRBL 1.1)* |
| **Broche PWM / Vitesse** | **D11** | Connecteurs blancs **`Z+` / `Z-`** *(inversion GRBL 1.1)* |
| **Palpeur Z (Touch Plate Probe)**| **A5 / SCL** | Broche `SCL` (vers la cale, pince crocodile vers GND) |
| **Bouton Pause (Feed Hold)** | A1 | Broche `Hold` |
| **Bouton Reprise (Cycle Start)** | A2 | Broche `Resume` |
| **Arrêt d'Urgence (Soft Reset)**| A0 | Broche `Abort` |

---

## 🚀 Installation & Démarrage

### Prérequis
- **Node.js** (version 18 ou supérieure recommandée) : [Télécharger Node.js](https://nodejs.org/)
- **Git** : [Télécharger Git](https://git-scm.com/)
- Un **Arduino Uno** flashé avec le firmware **GRBL 1.1** (ou utiliser le simulateur intégré).

### 1. Cloner le dépôt
```bash
git clone https://github.com/simon-jung68480/SmartCNC_grbl.git
cd SmartCNC_grbl
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Lancer l'application

#### Option A — En 1 clic sous Windows :
Double-cliquez simplement sur le fichier :
```
Lancer-SmartCNC.bat
```
Ce script lance le serveur local et ouvre automatiquement votre navigateur sur [http://localhost:3000](http://localhost:3000).

#### Option B — En ligne de commande :
```bash
npm run dev
```
Puis ouvrez votre navigateur à l'adresse **http://localhost:3000**.

---

## 📱 Utilisation sur Smartphone / Tablette (Télécommande Wi-Fi)

1. Assurez-vous que votre PC et votre smartphone sont connectés sur le **même réseau Wi-Fi**.
2. Dans SmartCNC sur votre PC, cliquez sur le bouton **« Wi-Fi »** dans l'en-tête en haut à droite : l'adresse IP locale de votre machine s'affiche (ex: `http://192.168.1.45:3000`).
3. Sur votre smartphone, ouvrez votre navigateur et entrez l'adresse :
   ```
   http://<IP_DE_VOTRE_PC>:3000?mode=pendant
   ```
4. **Astuce atelier** : Ajoutez la page à l'écran d'accueil de votre téléphone pour l'utiliser comme une vraie application plein écran sans barre d'adresse !

---

## ⚙️ Configuration & Réglages

Cliquez sur le bouton **« Paramètres ($$ & App) »** dans l'en-tête pour accéder aux deux onglets de configuration :

1. **Paramètres GRBL ($$) & Matériel** :
   - Tous les réglages EEPROM `$0` à `$132`.
   - Calculateur de pas/mm selon vos tiges filetées (T8x8, T8x4, T8x2, SFU1605) ou courroies GT2 et cavaliers `MS0/MS1/MS2`.
   - Assistant de calibration par mesure réelle.
2. **Préférences de l'Application** :
   - **Mode sans fin de course vs avec fins de course physiques** (active ou masque le bouton `$H`).
   - **Hauteur de la grille 3D** par rapport au Zéro Machine (offset table martyr en mm).
   - **Facteur de zoom visuel** (90%, 100%, 110%, 125% Atelier, 140% Écran éloigné).
   - **Dégagement vertical Z de sécurité** avant tout retour à l'origine `X0 Y0`.
   - **Réglages sonores** (volume général, activation/test de chaque signal).
   - **Sensibilité manette Gamepad** (zone morte et vitesse de consigne).

---

## 🛠️ Technologies Utilisées

- **Frontend** : React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **3D Engine** : Three.js (WebGL renderer, OrbitControls, BufferGeometry optimisé)
- **Backend & Communication** : Node.js, Express, Socket.IO, SerialPort (`@serialport/parser-readline`)
- **Audio** : Web Audio API synthétisé en temps réel
- **Gamepad** : Web Gamepad API standard
- **Build & Dev Tool** : Vite 6, tsx

---

## 📄 Licence

Ce projet est sous licence MIT — vous êtes libre de l'utiliser, le modifier et le distribuer pour vos projets personnels ou d'atelier.
Contributeur : **Simon Jung** (`simon-jung68480`)
