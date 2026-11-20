# SmartCNC — Interface CNC & Laser (GRBL 1.1)

> [!WARNING]
> **Prototype en cours de développement**
> SmartCNC est encore un **prototype**. L’interface et certaines fonctionnalités évoluent régulièrement et peuvent comporter des bugs.
> Avant toute utilisation sur une machine réelle (fraiseuse CNC ou module laser), effectuez les vérifications de sécurité d’atelier habituelles : arrêt d’urgence accessible, contrôle du paramètre GRBL `$32`, cadrage sans émission, bridage du brut et port des équipements de protection (notamment lunettes laser adaptées).

## Présentation

**SmartCNC** est une application web et desktop (Windows) permettant de piloter une fraiseuse CNC ou une graveuse/découpeuse laser basée sur **Arduino Uno + CNC Shield V3.0 (firmware GRBL 1.1)**. Un simulateur GRBL intégré permet également de préparer, tester et prévisualiser des parcours sans matériel branché.

## Fonctionnalités principales

- **Atelier CNC** : visualiseur 3D en temps réel (Three.js), streamer G-code virtualisé, affichage DRO (`WPos` / `MPos`), jogging XYZ complet (Pas / Continu, clavier, manette Gamepad), curseur continu d’override d’avance (`10 %`–`200 %`), cadrage 2D, assistant de palpage (Touch Plate), heightmap et assistant de surfaçage martyr.
- **Atelier Laser** : éditeur multi-calques (SVG, DXF, images et G-code externe), bibliothèque de préréglages, réglages de remplissage, contours et hors-focus, banc de calibration laser, aperçu 3D/XY progressif et panneau Jog XYZ identique à l’atelier CNC.
- **Interface & Réglages** : barre latérale avec bascule rapide **CNC ↔ Laser**, bouton dédié **`$32`** (activation/désactivation du mode laser GRBL), **Mode Jour / Mode Nuit**, télécommande tactile Wi-Fi pour smartphone (`?mode=pendant`), alertes audio Web Audio et réglages organisés par onglets (`Interface`, `Fonctionnement`, `Son`, `Contrôle`, `Réglages machine`, `GRBL $$`).

## Installation & lancement

### Installateur Windows
Téléchargez la dernière version depuis la page [GitHub Releases](https://github.com/simon-jung68480/SmartCNC_grbl/releases).

### Depuis les sources (Node.js 18+ recommandé)

```bash
git clone https://github.com/simon-jung68480/SmartCNC_grbl.git
cd SmartCNC_grbl
npm install
```

Commandes principales :

- `npm run desktop` (ou `Lancer-SmartCNC.bat` sous Windows) : lance l’application Electron complète
- `npm run dev` : démarre le serveur web local et l’interface dans le navigateur
- `npm run dist:win` : génère l’installateur Windows dans `release/`
- `npm test` : exécute les tests unitaires

## Stack technique & Licence

React 19, TypeScript, Tailwind CSS v4, Three.js, Node.js, Express, Socket.IO, SerialPort et Electron.

Projet distribué sous **licence MIT** — **Simon Jung** (`simon-jung68480`).
