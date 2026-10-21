import type { GrblSettingItem } from '../src/types/cnc';

export const GRBL_ERRORS: Record<number, { title: string; description: string }> = {
  1: {
    title: 'Lettre G-Code manquante',
    description: 'Une commande G-Code doit commencer par une lettre suivie d’une valeur numérique.'
  },
  2: {
    title: 'Format numérique invalide',
    description: 'La valeur numérique après la lettre G-Code est manquante ou mal formée.'
  },
  3: {
    title: 'Commande système $ inconnue',
    description: 'La commande système GRBL ($) n’est pas reconnue ou n’est pas supportée.'
  },
  4: {
    title: 'Valeur négative interdite',
    description: 'Ce paramètre ou cette commande attend une valeur strictement positive.'
  },
  5: {
    title: 'Cycle Homing désactivé',
    description: 'La prise d’origine ($H) a été appelée alors que le Homing ($22=0) est désactivé dans GRBL.'
  },
  6: {
    title: 'Impulsion Step trop courte',
    description: 'La durée d’impulsion ($0) doit être au minimum de 3 µs pour l’Arduino Uno.'
  },
  7: {
    title: 'Erreur de lecture EEPROM',
    description: 'La mémoire EEPROM de l’Arduino Uno est corrompue. Les paramètres par défaut ont été restaurés.'
  },
  8: {
    title: 'Machine non au repos (Idle)',
    description: 'Cette commande système ($) ne peut être exécutée que lorsque la machine est à l’état Idle.'
  },
  9: {
    title: 'G-Code verrouillé en Alarme ou Jog',
    description: 'Les commandes G-Code sont bloquées tant que la machine est en Alarme ($X requis) ou en cours de Jog.'
  },
  10: {
    title: 'Limites logicielles sans Homing',
    description: 'Les limites logicielles ($20=1) nécessitent obligatoirement l’activation du Homing ($22=1).'
  },
  11: {
    title: 'Ligne trop longue (> 80 car.)',
    description: 'Le bloc G-Code dépasse la limite du tampon de ligne de l’Arduino Uno (80 caractères max).'
  },
  12: {
    title: 'Fréquence Step max dépassée',
    description: 'Le produit Vitesse Max × Steps/mm dépasse la fréquence maximale supportée par l’ATmega328P (30 kHz).'
  },
  13: {
    title: 'Porte de sécurité ouverte',
    description: 'Le capteur de porte de sécurité a été déclenché et empêche le démarrage.'
  },
  14: {
    title: 'Chaîne de démarrage trop longue',
    description: 'Le bloc de démarrage ($N0 / $N1) dépasse la taille maximale autorisée en EEPROM.'
  },
  15: {
    title: 'Dépassement de course en Jog',
    description: 'La cible du déplacement manuel ($J) dépasse les courses maximales ($130/$131/$132) de la machine.'
  },
  16: {
    title: 'Commande de Jog invalide',
    description: 'La commande $J= ne contient pas d’axe valide ou contient des codes G non autorisés.'
  },
  17: {
    title: 'Mode Laser nécessite PWM',
    description: 'Le mode Laser ($32=1) nécessite une broche pilotée en PWM (D11 sur CNC Shield V3.0).'
  },
  20: {
    title: 'Commande G-Code non supportée',
    description: 'Une commande G ou M du bloc n’est pas prise en charge par GRBL 1.1.'
  },
  21: {
    title: 'Conflit de groupe modal',
    description: 'Plusieurs commandes G-Code appartenant au même groupe modal sont présentes sur la même ligne.'
  },
  22: {
    title: 'Vitesse d’avance (F) non définie',
    description: 'Un mouvement de travail (G1/G2/G3) a été commandé sans qu’aucune vitesse F n’ait été définie.'
  },
  23: {
    title: 'Valeur entière requise',
    description: 'La commande G-Code attend un nombre entier (ex: numéro d’outil T ou coordonnée P).'
  },
  24: {
    title: 'Axes multiples non autorisés',
    description: 'Deux commandes utilisant les mêmes mots d’axes XYZ ont été détectées dans le même bloc.'
  },
  25: {
    title: 'Mot G-Code répété',
    description: 'Un même mot G-Code a été répété plusieurs fois dans le même bloc.'
  },
  26: {
    title: 'Mots d’axes XYZ manquants',
    description: 'La commande requiert explicitement au moins une coordonnée d’axe X, Y ou Z.'
  },
  27: {
    title: 'Numéro de ligne N invalide',
    description: 'Le numéro de ligne N doit être compris entre 1 et 9 999 999.'
  },
  28: {
    title: 'Argument P ou L manquant',
    description: 'La commande (ex: G10 ou G4) nécessite une valeur P ou L qui n’a pas été fournie.'
  },
  29: {
    title: 'Système de coordonnées non supporté',
    description: 'GRBL ne supporte que les systèmes de coordonnées G54 à G59 (P1 à P6).'
  },
  30: {
    title: 'G53 nécessite G0 ou G1',
    description: 'Le déplacement en coordonnées machine (G53) n’est valide qu’avec G0 ou G1.'
  },
  31: {
    title: 'Mots d’axes superflus',
    description: 'Des coordonnées XYZ ont été fournies alors qu’aucune commande de mouvement ne les utilise.'
  },
  32: {
    title: 'Arc G2/G3 sans axe dans le plan',
    description: 'Un arc G2 ou G3 a été commandé sans coordonnée dans le plan actif (G17/G18/G19).'
  },
  33: {
    title: 'Cible de mouvement invalide',
    description: 'La cible de l’arc ou du cycle de palpage est mathématiquement impossible à atteindre.'
  },
  34: {
    title: 'Rayon d’arc G2/G3 invalide',
    description: 'Erreur géométrique sur le calcul de l’arc (IJK ou R) : le point d’arrivée n’est pas sur le cercle.'
  },
  35: {
    title: 'Décalage IJK manquant pour G2/G3',
    description: 'Un arc en mode IJK nécessite au moins un décalage I, J ou K dans le plan actif.'
  },
  36: {
    title: 'Mots G-Code inutilisés',
    description: 'Le bloc contient des paramètres qui ne correspondent à aucune commande active.'
  },
  37: {
    title: 'Axe d’outil G43.1 invalide',
    description: 'La compensation dynamique de longueur d’outil G43.1 ne peut s’appliquer qu’à l’axe Z.'
  },
  38: {
    title: 'Numéro d’outil T trop élevé',
    description: 'Le numéro d’outil T dépasse la valeur maximale autorisée.'
  }
};

export const GRBL_ALARMS: Record<number, { title: string; description: string }> = {
  1: {
    title: 'Fin de course matériel (Hard Limit)',
    description: 'Un capteur de fin de course (X+, X-, Y+, Y-, Z+ ou Z- sur le CNC Shield) a été déclenché. Le mouvement est stoppé immédiatement. Vérifiez la position mécanique puis déverrouillez ($X) ou relancez un Homing ($H).'
  },
  2: {
    title: 'Dépassement de course (Soft Limit)',
    description: 'La cible du mouvement dépasse l’enveloppe de travail définie dans $130/$131/$132. Vérifiez votre origine de travail (WPos) ou les dimensions du fichier G-Code.'
  },
  3: {
    title: 'Arrêt d’urgence en mouvement (Reset)',
    description: 'Un Soft Reset a été effectué pendant que les moteurs étaient en mouvement. La position réelle sur l’Arduino Uno peut être perdue : un nouveau Homing ($H) est recommandé.'
  },
  4: {
    title: 'Échec initial du palpeur (Probe)',
    description: 'Le palpeur (broche A5 / SCL sur CNC Shield V3.0) est déjà en contact ou dans un état invalide avant même le début du cycle G38.2. Vérifiez la pince crocodile et le câblage.'
  },
  5: {
    title: 'Échec de contact du palpeur (Probe)',
    description: 'La fraise a parcouru toute la distance de recherche maximale sans toucher la cale de palpage Z/XYZ. Rapprochez l’outil de la cale et réessayez.'
  },
  6: {
    title: 'Arrêt pendant le cycle Homing',
    description: 'Le cycle de prise d’origine ($H) a été interrompu par un Reset manuel.'
  },
  7: {
    title: 'Porte ouverte pendant le Homing',
    description: 'Le capteur de porte de sécurité a été activé pendant la prise d’origine ($H).'
  },
  8: {
    title: 'Échec de dégagement Homing (Pull-Off)',
    description: 'Après avoir touché le capteur de fin de course, l’axe n’a pas réussi à libérer le contact sur la distance $27. Augmentez $27 ou vérifiez le switch mécanique.'
  },
  9: {
    title: 'Capteur introuvable pendant Homing',
    description: 'Le capteur de fin de course n’a pas été détecté sur la course maximale ($130-$132 × 1.5). Vérifiez le câblage des Endstops sur le CNC Shield V3.0 et le sens des moteurs ($3/$23).'
  },
  10: {
    title: 'Double fin de course non déclenché',
    description: 'En mode Dual Axis, le second capteur de fin de course ne s’est pas déclenché à temps.'
  }
};

export const GRBL_SETTINGS_META: Record<number, Omit<GrblSettingItem, 'value'>> = {
  0: {
    id: 0,
    code: '$0',
    unit: 'µs',
    name: 'Durée d’impulsion Step',
    category: 'Steppers',
    description: 'Durée de l’impulsion envoyée aux drivers A4988 / DRV8825 / TMC2209 sur le CNC Shield V3.0. Valeur recommandée : 10 µs.'
  },
  1: {
    id: 1,
    code: '$1',
    unit: 'ms',
    name: 'Délai maintien moteurs (Step Idle Delay)',
    category: 'Steppers',
    description: 'Temps de maintien du couple après un mouvement (broche EN = D8 sur CNC Shield). Mettre 255 pour garder les moteurs bloqués en permanence pendant l’usinage.'
  },
  2: {
    id: 2,
    code: '$2',
    unit: 'masque',
    name: 'Inversion impulsions Step',
    category: 'Steppers',
    description: 'Masque binaire d’inversion des signaux STEP (D2/D3/D4). Laissez à 0 pour les drivers A4988 et DRV8825 classiques.'
  },
  3: {
    id: 3,
    code: '$3',
    unit: 'masque',
    name: 'Inversion direction moteurs (Dir Port)',
    category: 'Steppers',
    description: 'Inverse le sens de rotation des axes (D5=X, D6=Y, D7=Z). Valeurs : 0=Aucun, 1=X, 2=Y, 3=X+Y, 4=Z, 5=X+Z, 6=Y+Z, 7=X+Y+Z.'
  },
  4: {
    id: 4,
    code: '$4',
    unit: 'bool',
    name: 'Inversion broche Enable (D8)',
    category: 'Steppers',
    description: 'Sur le CNC Shield V3.0 avec A4988/DRV8825, l’activation (EN) est active à l’état bas : laissez obligatoirement $4=0.'
  },
  5: {
    id: 5,
    code: '$5',
    unit: 'bool',
    name: 'Inversion capteurs fin de course',
    category: 'Limits & Homing',
    description: '0 = Capteurs Normalement Ouverts (NO, reliés à GND). 1 = Capteurs Normalement Fermés (NC).'
  },
  6: {
    id: 6,
    code: '$6',
    unit: 'bool',
    name: 'Inversion entrée Palpeur (Probe A5/SCL)',
    category: 'Limits & Homing',
    description: '0 = Contact par mise à la masse (pince sur fraise + cale sur A5/SCL du CNC Shield). 1 = Logique inversée.'
  },
  10: {
    id: 10,
    code: '$10',
    unit: 'masque',
    name: 'Masque de rapport d’état (?)',
    category: 'General',
    description: 'Définit les données renvoyées par GRBL : 1=MPos (Position Machine), 2=Buffer RX/Planner (recommandé : 3 pour MPos + Buffer).'
  },
  11: {
    id: 11,
    code: '$11',
    unit: 'mm',
    name: 'Tolérance de jonction (Junction Deviation)',
    category: 'General',
    description: 'Détermine la vitesse de passage dans les angles entre segments G1. Valeur standard : 0.010 mm.'
  },
  12: {
    id: 12,
    code: '$12',
    unit: 'mm',
    name: 'Tolérance d’arc (Arc Tolerance)',
    category: 'General',
    description: 'Précision de subdivision des arcs G2/G3 en petits segments linéaires. Valeur standard : 0.002 mm.'
  },
  13: {
    id: 13,
    code: '$13',
    unit: 'bool',
    name: 'Rapport en pouces (Report Inches)',
    category: 'General',
    description: '0 = Coordonnées renvoyées en millimètres (recommandé). 1 = Pouces.'
  },
  20: {
    id: 20,
    code: '$20',
    unit: 'bool',
    name: 'Limites logicielles (Soft Limits)',
    category: 'Limits & Homing',
    description: 'Vérifie que chaque commande reste dans l’enveloppe $130/$131/$132 après un Homing ($22=1 requis).'
  },
  21: {
    id: 21,
    code: '$21',
    unit: 'bool',
    name: 'Limites matérielles (Hard Limits)',
    category: 'Limits & Homing',
    description: 'Surveille en continu les fins de course sur D9 (X), D10 (Y) et D12 (Z) sous GRBL 1.1. Attention aux parasites électromagnétiques de la broche.'
  },
  22: {
    id: 22,
    code: '$22',
    unit: 'bool',
    name: 'Cycle de prise d’origine (Homing $H)',
    category: 'Limits & Homing',
    description: 'Active la commande $H permettant de référencer la machine sur ses capteurs de fin de course.'
  },
  23: {
    id: 23,
    code: '$23',
    unit: 'masque',
    name: 'Masque de direction Homing',
    category: 'Limits & Homing',
    description: 'Définit vers quel côté chercher les capteurs d’origine (0=Max+, 3=X- et Y- avec Z+ en haut, configuration standard CNC).'
  },
  24: {
    id: 24,
    code: '$24',
    unit: 'mm/min',
    name: 'Vitesse d’approche fine Homing (Feed)',
    category: 'Limits & Homing',
    description: 'Vitesse lente de la seconde touche de précision lors du cycle $H (ex: 25 mm/min).'
  },
  25: {
    id: 25,
    code: '$25',
    unit: 'mm/min',
    name: 'Vitesse de recherche rapide Homing (Seek)',
    category: 'Limits & Homing',
    description: 'Vitesse rapide de recherche initiale des fins de course lors du cycle $H (ex: 500 mm/min).'
  },
  26: {
    id: 26,
    code: '$26',
    unit: 'ms',
    name: 'Anti-rebond Homing (Debounce)',
    category: 'Limits & Homing',
    description: 'Filtrage logiciel anti-rebond des interrupteurs mécaniques de fin de course (standard : 250 ms).'
  },
  27: {
    id: 27,
    code: '$27',
    unit: 'mm',
    name: 'Distance de dégagement Homing (Pull-Off)',
    category: 'Limits & Homing',
    description: 'Recul des axes après la prise d’origine pour ne plus appuyer sur les capteurs (ex: 2.0 mm).'
  },
  30: {
    id: 30,
    code: '$30',
    unit: 'RPM',
    name: 'Vitesse de broche maximale (Max RPM)',
    category: 'Spindle & Laser',
    description: 'Correspond à un signal PWM à 100% (5V sur la broche Z+ / D11 du CNC Shield V3.0 sous GRBL 1.1). Ex: 10000 ou 24000 RPM.'
  },
  31: {
    id: 31,
    code: '$31',
    unit: 'RPM',
    name: 'Vitesse de broche minimale (Min RPM)',
    category: 'Spindle & Laser',
    description: 'Vitesse correspondant au PWM minimal non nul. Généralement réglé à 0.'
  },
  32: {
    id: 32,
    code: '$32',
    unit: 'bool',
    name: 'Mode Laser',
    category: 'Spindle & Laser',
    description: '0 = Mode Fraiseuse CNC (pauses lors des changements de vitesse broche). 1 = Mode Graveur Laser (modulation continue sans arrêt).'
  },
  100: {
    id: 100,
    code: '$100',
    unit: 'pas/mm',
    name: 'Résolution Axe X (Steps/mm)',
    category: 'Steps/mm',
    description: 'Nombre de micropas par millimètre sur X. Ex: Moteur 200 pas + cavalier 1/16 + vis T8 pas 4mm = 800 pas/mm (ou 400 avec vis pas 8mm).'
  },
  101: {
    id: 101,
    code: '$101',
    unit: 'pas/mm',
    name: 'Résolution Axe Y (Steps/mm)',
    category: 'Steps/mm',
    description: 'Nombre de micropas par millimètre sur Y. Identique à X si la transmission mécanique (vis trapézoïdale T8 ou courroie GT2) est la même.'
  },
  102: {
    id: 102,
    code: '$102',
    unit: 'pas/mm',
    name: 'Résolution Axe Z (Steps/mm)',
    category: 'Steps/mm',
    description: 'Nombre de micropas par millimètre sur Z. Souvent sur vis trapézoïdale T8 (ex: 800 pas/mm).'
  },
  110: {
    id: 110,
    code: '$110',
    unit: 'mm/min',
    name: 'Vitesse maximale Axe X',
    category: 'Max Rate',
    description: 'Vitesse de déplacement rapide G0 maximale sur l’axe X (ex: 2000 mm/min).'
  },
  111: {
    id: 111,
    code: '$111',
    unit: 'mm/min',
    name: 'Vitesse maximale Axe Y',
    category: 'Max Rate',
    description: 'Vitesse de déplacement rapide G0 maximale sur l’axe Y (ex: 2000 mm/min).'
  },
  112: {
    id: 112,
    code: '$112',
    unit: 'mm/min',
    name: 'Vitesse maximale Axe Z',
    category: 'Max Rate',
    description: 'Vitesse de déplacement rapide G0 maximale sur l’axe Z (ex: 800 mm/min).'
  },
  120: {
    id: 120,
    code: '$120',
    unit: 'mm/s²',
    name: 'Accélération Axe X',
    category: 'Acceleration',
    description: 'Rampe d’accélération/décélération X. Une valeur modérée (100 à 200 mm/s²) évite les pertes de pas sur NEMA 17.'
  },
  121: {
    id: 121,
    code: '$121',
    unit: 'mm/s²',
    name: 'Accélération Axe Y',
    category: 'Acceleration',
    description: 'Rampe d’accélération/décélération Y (100 à 200 mm/s² recommandé).'
  },
  122: {
    id: 122,
    code: '$122',
    unit: 'mm/s²',
    name: 'Accélération Axe Z',
    category: 'Acceleration',
    description: 'Rampe d’accélération/décélération Z pour le porte-broche (50 à 100 mm/s² recommandé).'
  },
  130: {
    id: 130,
    code: '$130',
    unit: 'mm',
    name: 'Course maximale Axe X (Max Travel)',
    category: 'Max Travel',
    description: 'Longueur utile de l’axe X en millimètres (ex: 300 mm pour une CNC 3018/3030).'
  },
  131: {
    id: 131,
    code: '$131',
    unit: 'mm',
    name: 'Course maximale Axe Y (Max Travel)',
    category: 'Max Travel',
    description: 'Longueur utile de l’axe Y en millimètres (ex: 300 mm ou 180 mm sur CNC 3018).'
  },
  132: {
    id: 132,
    code: '$132',
    unit: 'mm',
    name: 'Course maximale Axe Z (Max Travel)',
    category: 'Max Travel',
    description: 'Course verticale utile de l’axe Z en millimètres (ex: 80 mm).'
  }
};

export const DEFAULT_SIMULATOR_SETTINGS: Record<number, number> = {
  0: 10,
  1: 255,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
  10: 3,
  11: 0.01,
  12: 0.002,
  13: 0,
  20: 0,
  21: 0,
  22: 1,
  23: 3,
  24: 25,
  25: 500,
  26: 250,
  27: 2,
  30: 10000,
  31: 0,
  32: 0,
  100: 800,
  101: 800,
  102: 800,
  110: 2000,
  111: 2000,
  112: 800,
  120: 100,
  121: 100,
  122: 50,
  130: 300,
  131: 300,
  132: 80
};
