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
Ce script construit et lance SmartCNC dans sa propre fenêtre. Le serveur local démarre et s'arrête avec l'application.

#### Option B — En ligne de commande :
```bash
npm run desktop
```
Pour créer un installateur Windows, lancez `npm run dist:win`. Il sera disponible dans le dossier `release`. Le port 3000 doit être libre.

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

## Atelier laser : préparation et gravure

L’onglet **Atelier laser** utilise la même connexion GRBL que l’atelier CNC, avec un programme indépendant. Le dessin et les réglages restent en mémoire lorsqu’on change d’atelier.

La barre d’outils ouvre, importe et enregistre les dessins. Sur le plateau quadrillé, les outils Ligne, Rectangle et Ellipse créent un calque par forme. La palette change sa couleur. Dans le panneau **Calques**, l’œil règle l’affichage sur le plateau et la case **Sortie** décide si le calque est gravé. Les commandes de cadrage et de départ restent accessibles sous les panneaux latéraux.

Sur le plateau, la touche **Suppr** ou la corbeille retire l’objet sélectionné. Les objets de même couleur partagent les paramètres de gravure au sein de leur type, vectoriel ou image. Ouvrez **Préréglages** dans la barre d’outils pour nommer, classer et modifier directement ces réglages. Sélectionnez un préréglage et enregistrez ses modifications avant de l’appliquer à un calque compatible. La bibliothèque est enregistrée localement.

1. **Importer**. Sélectionnez des fichiers SVG, DXF ASCII, PNG, JPEG, WebP ou BMP pour les ajouter au même plateau. Un fichier G-code s’ouvre individuellement. La bibliothèque contient les motifs de test.
2. **Préparer**. Ordonnez les calques et cochez ceux à graver. Le mode combiné permet de régler séparément l’avance, la puissance et les passes du remplissage et du contour. L’onglet **Machine** propose les déplacements manuels, le point de départ et les compensations. La valeur S maximale doit correspondre à `$30` de la machine.
3. **Générer et contrôler** : la vue 3D utilise le même plateau, la même grille, les mêmes graduations et les mêmes décalages machine/pièce que l’atelier CNC. Le plan XY permet de voir la largeur estimée des traits, de cadrer toute la machine ou uniquement la gravure, et d’afficher les déplacements laser éteint. Les limites incluent le rayon du spot. Toute modification impose une nouvelle génération avant export ou lancement.
4. **Cadrer**. Le bouton parcourt le rectangle englobant à la hauteur Z actuelle, laser éteint. Pour les images, la marge inclut le débordement d’accélération. En mode « Position actuelle », la tête revient au point de départ. Après un déplacement manuel, générez à nouveau pour utiliser la nouvelle position.
5. **Exporter ou lancer** : exporter le programme `.nc`, ou démarrer après vérification du mode laser `$32=1`, de l’origine, du parcours et des protections. Les commandes de pause, reprise et arrêt restent disponibles.

Les programmes générés peuvent conserver les coordonnées du dessin, utiliser le zéro pièce, s’ancrer sur la position actuelle ou sur une origine XY mémorisée. Les modes relatifs proposent neuf points d’ancrage sur le rectangle de gravure. L’atelier conserve localement l’offset XY général et la table de compensation aller-retour. Celle-ci s’applique aux images et aux hachures vectorielles, avec interpolation par avance. Le banc de calibration calcule la moitié de l’écart signé et peut l’ajouter à la table.

### Formats et limites

- **SVG** : chemins, sous-chemins, courbes, arcs, groupes transformés et formes simples. Modes contours, remplissage ou remplissage + contours. Les aplats et les règles `fill-rule` (`nonzero` / `evenodd`) sont conservés ; les trous restent vides et les éléments peints qui se chevauchent sont réunis. On peut aussi forcer le remplissage des contours sans aplat. Convertir textes et instances en chemins ; appliquer les masques, découpes et transformations CSS avant l’export. Les éléments ignorés sont signalés. Le document n’est jamais inséré dans la page.
- **DXF** : lignes, polylignes avec bulges, cercles, arcs, ellipses, splines non rationnelles et blocs transformés. Les unités du fichier sont converties en mm ; sans unité, 1 unité = 1 mm. Les textes, hachures, splines rationnelles et entités non prises en charge sont signalés. Les dessins doivent être dans le plan XY.
- **Images** : balayage horizontal aller-retour, niveaux de gris à 32 puissances ou noir/blanc par seuil, inversion et pas de balayage réglable. La transparence devient blanche. Une marge laser éteint permet d’accélérer hors de la gravure. Il ne s’agit pas d’une vectorisation automatique. Le traitement est limité à 1 million de pixels multipliés par les passes et 300 000 lignes de programme.
- **G-code externe** : conservé sans réécriture. Les limites représentent les déplacements avec M3/M4 et S positif. Un départ XY indéterminé, un changement de repère, une commande de position non prise en charge ou des arcs discrétisés peuvent empêcher le cadrage automatique. L’estimation de durée ne tient pas compte des accélérations.

### Surfaces et hachures

Ouvrez les paramètres d’un calque avec la roue dentée ou en cliquant sur une opération. Le remplissage propose le pas en mm, l’angle, le balayage uni ou bidirectionnel, le croisement à 90° et une distance de surbalayage à chaque extrémité, laser éteint. Le contour peut suivre le tracé, le parcourir en sens inverse ou alterner le sens à chaque passe. Les contours fermés imbriqués utilisent la règle paire/impaire pour les trous. Les hachures tiennent compte du rayon de spot mesuré du calque.

Dans les SVG, le blanc opaque représente une zone non gravée. Un fond blanc placé derrière le motif n’est ni rempli ni tracé ; une forme blanche au-dessus du noir retire cette surface, et une forme noire peinte ensuite la rétablit. L’ordre des formes et les trous `evenodd` / `nonzero` sont conservés. Les dimensions et le placement du motif excluent les fonds blancs non gravés. Le blanc semi-transparent nécessite une conversion en image pour conserver les niveaux de gris.

### Lecture dans le simulateur Arduino

Après génération ou importation du G-code, **Simuler le G-code** connecte automatiquement le simulateur GRBL et lance le programme. Une machine réelle doit être déconnectée au préalable. Le mode laser et l’échelle de puissance sont réglés uniquement dans le simulateur. **Pause**, **Reprendre** et **Arrêter** pilotent cette lecture, comme dans l’atelier CNC.

Les vues 3D et XY dessinent progressivement les traits réellement parcourus, jusqu’à la position courante de la tête, avec la largeur du spot. Les déplacements à puissance nulle ne gravent pas. Le tracé reste visible après arrêt ; une nouvelle lecture repart de zéro. **Afficher le dessin complet** permet de consulter le résultat prévu pendant la lecture.

### Réglage du hors focus

Dans les paramètres du calque, activer **Hors focus et traits larges**, puis renseigner le décalage et la largeur du spot mesurée. Le remplissage utilise la largeur du calque. L’aperçu et le cadrage tiennent compte de la largeur maximale du travail. La largeur indicative d’un calque au focus est de 0,15 mm.

L’option **Appliquer ce décalage avec l’axe Z** utilise une référence Z pièce et une avance Z. La tête rejoint `Z référence + décalage` avant le calque, laser éteint. Elle revient à la référence avant le calque suivant. Pour le dernier calque, ce retour est optionnel. En mode manuel, préparez un programme par hauteur de focus. Le cadrage se fait à la hauteur Z actuelle.

Le traitement des dessins et des images s’effectue localement. Aucun programme généré n’active `$32` automatiquement. Les tests de conversion, de remplissage et de génération se lancent avec `npm test`.

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

## Éditeur laser et projets

Les dessins et les images peuvent être ajoutés à une composition. Chaque calque peut être sélectionné, déplacé, redimensionné, dupliqué ou masqué. Le contour, le remplissage, l’avance, la puissance, les passes et le focus se règlent par calque. Le mode M3/M4 et la valeur S maximale sont communs à la machine.

Enregistrer le projet produit un fichier `.smartlaser.json` contenant les tracés, les images et leurs réglages. Ouvrir ce fichier restaure la composition sans envoyer de commande à la machine. Les programmes G-code externes gardent leur import dédié. Après une modification du parcours, ouvrez de nouveau l’aperçu avant le lancement.

## Diagnostic du homing

Le logiciel transmet `$H` au contrôleur réel : la séquence et les contacts sont traités dans le firmware GRBL. Le comportement normal est Z, puis X et Y ensemble ; chaque axe s'arrête sur son propre contact pendant que l'autre poursuit sa recherche. Voir la [documentation officielle du cycle GRBL](https://github.com/gnea/grbl/wiki/Set-up-the-Homing-Cycle).

Les paramètres GRBL affichent les contacts X/Y/Z en direct. Machine immobile, actionner chaque contact séparément : un contact X ne doit activer que X, un contact Y uniquement Y. Si un seul contact affiche X et Y, vérifier le câblage, les entrées du shield et les parasites avant un nouveau homing. Les entrées Uno standard sont D9 pour X, D10 pour Y et D12 pour Z. Le logiciel ne remplace pas cette vérification matérielle.

Le simulateur modélise les déplacements indépendants des axes, les phases de recherche et de précision, puis le dégagement ; il tient compte de la direction `$23`, du dégagement `$27` et des courses `$130` à `$132`.

## Banc de calibration laser

Le panneau **Banc de calibration laser** prépare un programme dans l’atelier, avec aperçu, notes de lecture, cadrage, export et lancement habituels. Il ne lance aucun déplacement directement et ne modifie aucun paramètre GRBL. Les tests utilisent la position X/Y du placement, ainsi que la vitesse, la puissance, le mode M3/M4 et l’échelle S de l’atelier ; les réglages de hors focus sont ignorés pour ne pas ajouter de mouvement Z involontaire.

- **Matrice vitesse / puissance** : 2 à 10 échantillons par axe. Les colonnes vont de la moitié au double de la vitesse d’atelier ; les lignes parcourent la plage de puissance choisie. Aplats au pas de 0,15 mm.
- **Mise au point avec axe Z** : lignes à des hauteurs réparties entre les deux décalages, relativement au Z pièce de référence. La génération exige l’autorisation explicite des mouvements Z ; les repositionnements Z se font laser éteint et le programme revient à la référence en fin de test. Vérifier la course libre. Sans axe Z motorisé, régler le focus manuellement et utiliser des tests de lignes séparés.
- **Pas de balayage / spot** : aplats avec des intervalles de 0,025 à 2 mm. Choisir le plus grand intervalle laissant un aplat régulier. Le calculateur peut reporter l’intervalle retenu dans le remplissage et le balayage d’image.
- **Passes de coupe** : carrés avec un nombre de passes croissant, entre 1 et 50. Les passes d’un carré sont consécutives ; surveiller la chauffe et le matériau. Les autres tests utilisent une passe, sauf le test kerf qui conserve le nombre de passes de l’atelier.
- **Dimensions et équerrage** : carré, cercle et diagonales. Mesurer entre centres des traits. Le calculateur propose `nouveaux pas/mm = pas/mm actuels × distance demandée / distance mesurée`, à reporter et vérifier dans les paramètres GRBL. Des diagonales différentes nécessitent un réglage mécanique.
- **Largeur de coupe (kerf)** : découper le carré, puis mesurer l’ouverture et l’insert séparé. `kerf = (ouverture − insert) / 2`. Le décalage du centre d’outil nécessaire vaut la moitié du kerf ; cette version ne compense pas automatiquement les contours.
- **Alignement aller / retour** : 20 lignes alternées au pas de 0,4 mm. Comparer leurs extrémités à la vitesse choisie ; la moitié du décalage relatif donne une correction indicative par sens. Répéter aux vitesses utilisées. Cette version mesure le défaut sans compensation automatique du balayage ni réglage des délais du firmware.

Les numéros et valeurs des échantillons figurent dans les notes et commentaires du G-code ; ils ne sont pas gravés sur le matériau. Le logiciel ne déduit ni la puissance optique réelle, ni le spot, ni le focus à partir d’une mesure automatique. Les dimensions de test sont limitées à 2–200 mm par motif et les échantillons à 2–10 ; contrôler l’encombrement total de la matrice et le repère avant lancement.
