import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings,
  Search,
  RefreshCw,
  Save,
  Download,
  Upload,
  X,
  Calculator,
  Ruler,
  Cpu,
  Check,
  AlertCircle,
  Sliders,
  ArrowRight,
} from 'lucide-react';
import { GrblSettingItem, GrblStatus } from '../types/cnc';
import { HomingDiagnostics } from './HomingDiagnostics';
import { AppPreferencesTab } from './AppPreferencesTab';

export const DEFAULT_GRBL_SETTINGS: GrblSettingItem[] = [
  {
    id: 0,
    code: '$0',
    value: 10,
    unit: 'µs',
    name: 'Durée impulsion pas (Step pulse)',
    category: 'Steppers',
    description: 'Largeur minimale de l’impulsion STEP envoyée aux drivers A4988/DRV8825 (10 µs recommandé).',
  },
  {
    id: 1,
    code: '$1',
    value: 25,
    unit: 'ms',
    name: 'Délai maintien moteurs (Step idle delay)',
    category: 'Steppers',
    description: 'Temps avant désactivation des moteurs à l’arrêt. Mettre 255 pour garder le couple de maintien permanent.',
  },
  {
    id: 2,
    code: '$2',
    value: 0,
    unit: 'masque X/Y/Z',
    name: 'Inversion signaux impulsions STEP',
    category: 'Steppers',
    description: 'Masque binaire d’inversion des impulsions de pas (Bit0=X:1, Bit1=Y:2, Bit2=Z:4). Normalement 0.',
  },
  {
    id: 3,
    code: '$3',
    value: 0,
    unit: 'masque X/Y/Z',
    name: 'Inversion sens de direction (Direction port invert)',
    category: 'Steppers',
    description: 'Inverse le sens de déplacement des axes X (+1), Y (+2), Z (+4) sans débrancher les câbles moteurs sur le CNC Shield.',
  },
  {
    id: 4,
    code: '$4',
    value: 0,
    unit: 'booléen',
    name: 'Inversion broche Enable (Step enable invert)',
    category: 'Steppers',
    description: '0 = actif bas (A4988 / DRV8825 sur CNC Shield V3.0), 1 = actif haut.',
  },
  {
    id: 5,
    code: '$5',
    value: 0,
    unit: 'booléen',
    name: 'Inversion pins fins de course (Limit pins invert)',
    category: 'Limits & Homing',
    description: '0 = contacts NO (Normalement Ouverts vers GND), 1 = contacts NF (Normalement Fermés).',
  },
  {
    id: 6,
    code: '$6',
    value: 0,
    unit: 'booléen',
    name: 'Inversion pin Palpeur Z (Probe pin invert)',
    category: 'Limits & Homing',
    description: 'Broche A5 (SCL) du CNC Shield V3.0. 0 = contact mise à la masse (GND) sur la fraise.',
  },
  {
    id: 10,
    code: '$10',
    value: 1,
    unit: 'masque',
    name: 'Masque rapport de statut (?)',
    category: 'General',
    description: '1 = affiche MPos, 2 = affiche le remplissage du buffer planificateur RX.',
  },
  {
    id: 11,
    code: '$11',
    value: 0.01,
    unit: 'mm',
    name: 'Déviation de jonction (Junction deviation)',
    category: 'General',
    description: 'Contrôle la vitesse de passage dans les angles entre deux segments G1 (0.010 mm standard).',
  },
  {
    id: 12,
    code: '$12',
    value: 0.002,
    unit: 'mm',
    name: 'Tolérance d’arc circulaire G2/G3',
    category: 'General',
    description: 'Précision de segmentation des arcs circulaires G2/G3 (0.002 mm recommandé).',
  },
  {
    id: 13,
    code: '$13',
    value: 0,
    unit: 'booléen',
    name: 'Rapport de coordonnées en pouces',
    category: 'General',
    description: '0 = coordonnées affichées en millimètres (mm), 1 = pouces (inches).',
  },
  {
    id: 20,
    code: '$20',
    value: 0,
    unit: 'booléen',
    name: 'Limites logicielles (Soft limits)',
    category: 'Limits & Homing',
    description: 'Empêche de dépasser les courses max ($130-$132). Nécessite le cycle Homing ($22=1) actif.',
  },
  {
    id: 21,
    code: '$21',
    value: 0,
    unit: 'booléen',
    name: 'Fins de course matériels (Hard limits)',
    category: 'Limits & Homing',
    description: 'Surveille les broches D9 (X), D10 (Y), D12 (Z) du CNC Shield V3.0 et déclenche ALARM:1 en cas de choc.',
  },
  {
    id: 22,
    code: '$22',
    value: 1,
    unit: 'booléen',
    name: 'Cycle d’origine Homing ($H)',
    category: 'Limits & Homing',
    description: 'Active la prise d’origine machine par capteurs de fin de course.',
  },
  {
    id: 23,
    code: '$23',
    value: 3,
    unit: 'masque X/Y/Z',
    name: 'Direction de recherche Homing',
    category: 'Limits & Homing',
    description: 'Définit vers quel coin la machine cherche ses capteurs (0 = Haut/Droite/Arrière, 3 = Avant/Gauche/Haut).',
  },
  {
    id: 24,
    code: '$24',
    value: 25,
    unit: 'mm/min',
    name: 'Vitesse de précision Homing (Locate feed)',
    category: 'Limits & Homing',
    description: 'Vitesse lente lors de la seconde touche de précision sur les fins de course.',
  },
  {
    id: 25,
    code: '$25',
    value: 500,
    unit: 'mm/min',
    name: 'Vitesse d’approche Homing (Seek rate)',
    category: 'Limits & Homing',
    description: 'Vitesse rapide d’approche initiale vers les capteurs de fin de course.',
  },
  {
    id: 26,
    code: '$26',
    value: 250,
    unit: 'ms',
    name: 'Anti-rebond fins de course (Homing debounce)',
    category: 'Limits & Homing',
    description: 'Filtre temporel anti-parasites pour les micro-switchs mécaniques.',
  },
  {
    id: 27,
    code: '$27',
    value: 1.0,
    unit: 'mm',
    name: 'Dégagement après Homing (Pull-off)',
    category: 'Limits & Homing',
    description: 'Distance de recul après détection pour libérer les contacts des fins de course.',
  },
  {
    id: 30,
    code: '$30',
    value: 10000,
    unit: 'RPM',
    name: 'Vitesse broche maximale (Max spindle speed)',
    category: 'Spindle & Laser',
    description: 'Valeur S correspondant à 100% du signal PWM 5V sur la broche D11 (Z+ sur CNC Shield V3.0).',
  },
  {
    id: 31,
    code: '$31',
    value: 0,
    unit: 'RPM',
    name: 'Vitesse broche minimale (Min spindle speed)',
    category: 'Spindle & Laser',
    description: 'Valeur S minimale correspondant au rapport cyclique PWM le plus bas.',
  },
  {
    id: 32,
    code: '$32',
    value: 0,
    unit: 'booléen',
    name: 'Mode Laser (Laser mode)',
    category: 'Spindle & Laser',
    description: '0 = Fraiseuse CNC (Broche standard), 1 = Graveur Laser (module la puissance sans arrêt entre les G1).',
  },
  {
    id: 100,
    code: '$100',
    value: 800.0,
    unit: 'pas/mm',
    name: 'Résolution Axe X (X steps/mm)',
    category: 'Steps/mm',
    description: 'Nombre de micro-pas nécessaires pour déplacer l’axe X de 1 millimètre.',
  },
  {
    id: 101,
    code: '$101',
    value: 800.0,
    unit: 'pas/mm',
    name: 'Résolution Axe Y (Y steps/mm)',
    category: 'Steps/mm',
    description: 'Nombre de micro-pas nécessaires pour déplacer l’axe Y de 1 millimètre.',
  },
  {
    id: 102,
    code: '$102',
    value: 800.0,
    unit: 'pas/mm',
    name: 'Résolution Axe Z (Z steps/mm)',
    category: 'Steps/mm',
    description: 'Nombre de micro-pas nécessaires pour déplacer l’axe Z de 1 millimètre.',
  },
  {
    id: 110,
    code: '$110',
    value: 2000.0,
    unit: 'mm/min',
    name: 'Vitesse rapide Max Axe X (X max rate)',
    category: 'Max Rate',
    description: 'Vitesse maximale de déplacement rapide G0 sur l’axe X.',
  },
  {
    id: 111,
    code: '$111',
    value: 2000.0,
    unit: 'mm/min',
    name: 'Vitesse rapide Max Axe Y (Y max rate)',
    category: 'Max Rate',
    description: 'Vitesse maximale de déplacement rapide G0 sur l’axe Y.',
  },
  {
    id: 112,
    code: '$112',
    value: 800.0,
    unit: 'mm/min',
    name: 'Vitesse rapide Max Axe Z (Z max rate)',
    category: 'Max Rate',
    description: 'Vitesse maximale de déplacement rapide G0 sur l’axe Z.',
  },
  {
    id: 120,
    code: '$120',
    value: 150.0,
    unit: 'mm/sec²',
    name: 'Accélération Axe X',
    category: 'Acceleration',
    description: 'Rampe d’accélération/décélération X. Réduire si les moteurs Nema perdent des pas au démarrage.',
  },
  {
    id: 121,
    code: '$121',
    value: 150.0,
    unit: 'mm/sec²',
    name: 'Accélération Axe Y',
    category: 'Acceleration',
    description: 'Rampe d’accélération/décélération Y.',
  },
  {
    id: 122,
    code: '$122',
    value: 100.0,
    unit: 'mm/sec²',
    name: 'Accélération Axe Z',
    category: 'Acceleration',
    description: 'Rampe d’accélération/décélération Z.',
  },
  {
    id: 130,
    code: '$130',
    value: 300.0,
    unit: 'mm',
    name: 'Course maximale Axe X (X max travel)',
    category: 'Max Travel',
    description: 'Longueur utile de l’axe X (ex: 300 mm pour une CNC 3018).',
  },
  {
    id: 131,
    code: '$131',
    value: 180.0,
    unit: 'mm',
    name: 'Course maximale Axe Y (Y max travel)',
    category: 'Max Travel',
    description: 'Longueur utile de l’axe Y (ex: 180 mm pour une CNC 3018).',
  },
  {
    id: 132,
    code: '$132',
    value: 45.0,
    unit: 'mm',
    name: 'Course maximale Axe Z (Z max travel)',
    category: 'Max Travel',
    description: 'Course verticale utile du chariot Z (ex: 45 mm).',
  },
];

type CategoryFilter =
  | 'ALL'
  | 'Steps/mm'
  | 'Max Rate'
  | 'Acceleration'
  | 'Max Travel'
  | 'Limits & Homing'
  | 'Spindle & Laser'
  | 'Steppers';

const CATEGORY_TABS: { id: CategoryFilter; label: string }[] = [
  { id: 'ALL', label: 'Tous' },
  { id: 'Steps/mm', label: 'Pas/mm ($100-$102)' },
  { id: 'Max Rate', label: 'Vitesses Max ($110-$112)' },
  { id: 'Acceleration', label: 'Accélérations ($120-$122)' },
  { id: 'Max Travel', label: 'Courses Max ($130-$132)' },
  { id: 'Limits & Homing', label: 'Fins de course & Homing ($20-$27)' },
  { id: 'Spindle & Laser', label: 'Broche & Laser ($30-$32)' },
  { id: 'Steppers', label: 'Moteurs ($0-$4)' },
];

export interface GrblSettingsModalProps {
  status?: GrblStatus;
  isOpen?: boolean;
  onClose: () => void;
  connected?: boolean;
  settings?: GrblSettingItem[] | Record<string | number, number>;
  onSendCommand: (cmd: string) => void;
  onReadSettings?: () => void;
  onSaveSettings?: (changes: { id: number; code: string; value: number }[]) => void;
  initialTab?: 'grbl' | 'app';
  onResetLayout?: () => void;
}

export const GrblSettingsModal: React.FC<GrblSettingsModalProps> = ({
  status,
  isOpen = true,
  onClose,
  connected = true,
  settings: externalSettings,
  onSendCommand,
  onReadSettings,
  onSaveSettings,
  initialTab = 'grbl',
  onResetLayout,
}) => {
  const [mainTab, setMainTab] = useState<'grbl' | 'app'>(initialTab);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Merge external settings with full GRBL 1.1 catalog
  const baseSettings = useMemo(() => {
    if (!externalSettings) return DEFAULT_GRBL_SETTINGS;
    if (Array.isArray(externalSettings) && externalSettings.length > 0) {
      const map = new Map(externalSettings.map((s) => [s.id, s.value]));
      return DEFAULT_GRBL_SETTINGS.map((def) => ({
        ...def,
        value: map.has(def.id) ? (map.get(def.id) as number) : def.value,
      }));
    }
    if (typeof externalSettings === 'object') {
      const rec = externalSettings as Record<string, number>;
      return DEFAULT_GRBL_SETTINGS.map((def) => {
        const val = rec[def.id] ?? rec[def.code];
        return {
          ...def,
          value: typeof val === 'number' ? val : def.value,
        };
      });
    }
    return DEFAULT_GRBL_SETTINGS;
  }, [externalSettings]);

  const [editedValues, setEditedValues] = useState<Record<number, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('ALL');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // CNC Shield V3.0 Calculator State
  const [transmissionType, setTransmissionType] = useState<
    't8-lead4' | 't8-lead8' | 't8-lead2' | 'sfu1605' | 'gt2-16t' | 'gt2-20t'
  >('t8-lead4');
  const [motorStepsPerRev, setMotorStepsPerRev] = useState<200 | 400>(200);
  const [driverType, setDriverType] = useState<'A4988' | 'DRV8825'>('A4988');
  const [jumpers, setJumpers] = useState<{ ms0: boolean; ms1: boolean; ms2: boolean }>({
    ms0: true,
    ms1: true,
    ms2: true,
  });

  // Real Measurement Calibration Assistant State
  const [calibAxisId, setCalibAxisId] = useState<100 | 101 | 102>(100);
  const [requestedDistMm, setRequestedDistMm] = useState<number>(100);
  const [measuredDistMm, setMeasuredDistMm] = useState<number>(99.2);

  useEffect(() => {
    const initial: Record<number, number> = {};
    baseSettings.forEach((s) => {
      initial[s.id] = s.value;
    });
    setEditedValues(initial);
  }, [baseSettings]);

  // Calculate microstepping based on A4988 or DRV8825 jumper truth table on CNC Shield V3.0
  const microsteppingInfo = useMemo(() => {
    const { ms0, ms1, ms2 } = jumpers;
    if (driverType === 'A4988') {
      if (!ms0 && !ms1 && !ms2) return { factor: 1, label: 'Pas entier (Full Step 1/1)' };
      if (ms0 && !ms1 && !ms2) return { factor: 2, label: 'Demi-pas (Half Step 1/2)' };
      if (!ms0 && ms1 && !ms2) return { factor: 4, label: 'Quart de pas (1/4 Step)' };
      if (ms0 && ms1 && !ms2) return { factor: 8, label: 'Huitième de pas (1/8 Step)' };
      if (ms0 && ms1 && ms2) return { factor: 16, label: 'Seizième de pas (1/16 Max A4988)' };
      return { factor: 16, label: '1/16 Step (Configuration A4988)' };
    } else {
      // DRV8825
      if (!ms0 && !ms1 && !ms2) return { factor: 1, label: 'Pas entier (Full Step 1/1)' };
      if (ms0 && !ms1 && !ms2) return { factor: 2, label: 'Demi-pas (Half Step 1/2)' };
      if (!ms0 && ms1 && !ms2) return { factor: 4, label: 'Quart de pas (1/4 Step)' };
      if (ms0 && ms1 && !ms2) return { factor: 8, label: 'Huitième de pas (1/8 Step)' };
      if (!ms0 && !ms1 && ms2) return { factor: 16, label: 'Seizième de pas (1/16 Step)' };
      return { factor: 32, label: '1/32 Pas (Max DRV8825)' };
    }
  }, [driverType, jumpers]);

  const transmissionMmPerRev = useMemo(() => {
    switch (transmissionType) {
      case 't8-lead8':
        return 8; // T8 4 starts pitch 2mm = 8mm/tr
      case 't8-lead4':
        return 4; // T8 2 starts pitch 2mm = 4mm/tr (CNC 3018 standard)
      case 't8-lead2':
        return 2; // T8 1 start pitch 2mm = 2mm/tr
      case 'sfu1605':
        return 5; // Ball screw 1605 = 5mm/tr
      case 'gt2-16t':
        return 32; // GT2 2mm * 16 teeth = 32mm/tr
      case 'gt2-20t':
        return 40; // GT2 2mm * 20 teeth = 40mm/tr
    }
  }, [transmissionType]);

  const calculatedStepsPerMm = useMemo(() => {
    const val = (motorStepsPerRev * microsteppingInfo.factor) / transmissionMmPerRev;
    return Number(val.toFixed(3));
  }, [motorStepsPerRev, microsteppingInfo.factor, transmissionMmPerRev]);

  // Real measurement calibration calculation
  const currentAxisSteps = editedValues[calibAxisId] ?? 800;
  const calibratedStepsPerMm = useMemo(() => {
    if (!measuredDistMm || measuredDistMm <= 0 || !requestedDistMm || requestedDistMm <= 0) {
      return currentAxisSteps;
    }
    return Number(((currentAxisSteps * requestedDistMm) / measuredDistMm).toFixed(3));
  }, [currentAxisSteps, requestedDistMm, measuredDistMm]);

  const modifiedSettings = useMemo(() => {
    return baseSettings.filter(
      (s) =>
        editedValues[s.id] !== undefined &&
        Math.abs(editedValues[s.id] - s.value) > 0.0001
    );
  }, [baseSettings, editedValues]);

  const filteredSettings = useMemo(() => {
    return baseSettings.filter((s) => {
      if (selectedCategory !== 'ALL' && s.category !== selectedCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    });
  }, [baseSettings, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  const handleValueChange = (id: number, newValue: number) => {
    if (Number.isNaN(newValue)) return;
    setEditedValues((prev) => ({
      ...prev,
      [id]: newValue,
    }));
  };

  const handleToggleBitmask = (id: number, bitValue: number) => {
    const current = Math.round(editedValues[id] ?? 0);
    const next = current ^ bitValue;
    handleValueChange(id, next);
  };

  const handleReadFromArduino = () => {
    if (onReadSettings) {
      onReadSettings();
    } else {
      onSendCommand('$$');
    }
    setSaveFeedback('Commande $$ envoyée à l’Arduino Uno');
    setTimeout(() => setSaveFeedback(null), 3000);
  };

  const handleSaveToEeprom = () => {
    const changes = modifiedSettings.map((s) => ({
      id: s.id,
      code: s.code,
      value: editedValues[s.id],
    }));

    if (changes.length === 0) {
      setSaveFeedback('Aucune modification en attente.');
      setTimeout(() => setSaveFeedback(null), 2500);
      return;
    }

    changes.forEach((ch) => {
      onSendCommand(`${ch.code}=${ch.value}`);
    });
    onSaveSettings?.(changes);
    onSendCommand('$$');
    setSaveFeedback(`${changes.length} paramètre(s) enregistré(s) dans l'EEPROM ATmega328P !`);
    setTimeout(() => setSaveFeedback(null), 3500);
  };

  const handleExportProfile = () => {
    const payload = {
      profileName: 'SmartCNC_ArduinoUno_CNCShieldV3',
      exportedAt: new Date().toISOString(),
      settings: editedValues,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'profil_grbl_cnc_shield_v3.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProfile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        const importedMap = parsed.settings || parsed;
        if (importedMap && typeof importedMap === 'object') {
          setEditedValues((prev) => {
            const next = { ...prev };
            Object.entries(importedMap).forEach(([k, v]) => {
              const numKey = Number(k.replace('$', ''));
              if (!Number.isNaN(numKey) && typeof v === 'number') {
                next[numKey] = v;
              }
            });
            return next;
          });
          setSaveFeedback('Profil JSON importé ! Cliquez sur "Enregistrer dans l’EEPROM" pour flasher.');
          setTimeout(() => setSaveFeedback(null), 4000);
        }
      } catch {
        setSaveFeedback('Erreur : Fichier JSON invalide.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2 sm:p-5">
      <div className="bg-white border border-slate-300 text-slate-800 rounded-2xl shadow-2xl w-full max-w-7xl h-full flex flex-col overflow-hidden">
        {/* Barre de navigation principale supérieure : GRBL ($$) vs Préférences App */}
        <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMainTab('grbl')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mainTab === 'grbl'
                  ? 'bg-white text-sky-700 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Cpu className="w-4 h-4 text-sky-600" />
              <span>Paramètres GRBL ($$) & Matériel</span>
              {modifiedSettings.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  {modifiedSettings.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMainTab('app')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mainTab === 'app'
                  ? 'bg-white text-sky-700 shadow-xs border border-slate-300'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Sliders className="w-4 h-4 text-sky-600" />
              <span>Préférences de l'Application</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
            title="Fermer (Échap)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENU SELON L'ONGLET ACTIF */}
        {mainTab === 'app' ? (
          <AppPreferencesTab onResetLayout={onResetLayout} />
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* En-tête de l'onglet GRBL */}
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-600">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      Configuration EEPROM GRBL 1.1 ($$) & Calibrage CNC Shield V3.0
                    </h2>
                    {modifiedSettings.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        {modifiedSettings.length} modifié(s)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Paramètres stockés en mémoire non-volatile de l'Arduino Uno (ATmega328P)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportProfile(file);
                    e.target.value = '';
                  }}
                />

                <button
                  type="button"
                  onClick={handleReadFromArduino}
                  disabled={!connected}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-sky-700 border border-slate-300 transition disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Lire depuis l'Arduino ($$)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportProfile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Exporter (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>Importer (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveToEeprom}
                  disabled={!connected}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition disabled:opacity-40 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Enregistrer dans l'EEPROM</span>
                </button>
              </div>
            </div>

        {/* Bannière de retour d'action */}
        {saveFeedback && (
          <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveFeedback}</span>
          </div>
        )}

        {/* Barre de recherche & Catégories */}
        <div className="px-5 py-3 bg-white border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative w-full lg:w-72 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher ($100, vitesse, homing...)"
              className="w-full bg-white border border-slate-300 focus:border-sky-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {CATEGORY_TABS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition ${
                  selectedCategory === cat.id
                    ? 'bg-sky-50 border-sky-400 text-sky-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenu principal en 2 colonnes : Liste des paramètres $$ + Assistants CNC Shield V3.0 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Colonne Gauche (7/12) : Liste des paramètres GRBL */}
          <div className="lg:col-span-7 overflow-y-auto p-4 space-y-2.5 border-r border-slate-200 bg-white">
            {filteredSettings.map((setting) => {
              const currentVal = editedValues[setting.id] ?? setting.value;
              const isModified = Math.abs(currentVal - setting.value) > 0.0001;
              const isAxisBitmask = [2, 3, 23].includes(setting.id);
              const isBoolean = setting.unit === 'booléen';

              return (
                <div
                  key={setting.id}
                  className={`p-3.5 rounded-xl border transition ${
                    isModified
                      ? 'bg-amber-50/70 border-amber-300'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-sky-50 border border-sky-200 font-mono text-xs font-bold text-sky-700">
                          {setting.code}
                        </span>
                        <h4 className="text-xs font-bold text-slate-900">{setting.name}</h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600 font-mono">
                          {setting.category}
                        </span>
                        {isModified && (
                          <span className="text-[10px] font-bold text-amber-700">
                            ● Modifié (était {setting.value})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        {setting.description}
                      </p>
                    </div>

                    {/* Contrôle d'édition selon le type de paramètre */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isBoolean ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleValueChange(setting.id, currentVal === 1 ? 0 : 1)
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                            currentVal === 1
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                              : 'bg-white border-slate-300 text-slate-600'
                          }`}
                        >
                          {currentVal === 1 ? '1 (Activé)' : '0 (Désactivé)'}
                        </button>
                      ) : (
                        <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden">
                          <input
                            type="number"
                            step="any"
                            value={currentVal}
                            onChange={(e) =>
                              handleValueChange(setting.id, parseFloat(e.target.value))
                            }
                            className="w-24 px-2.5 py-1.5 bg-white text-right font-mono text-xs font-bold text-slate-900 focus:outline-none"
                          />
                          <span className="px-2 py-1.5 bg-slate-100 text-[10px] font-mono text-slate-600 border-l border-slate-300">
                            {setting.unit}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cases à cocher visuelles d'inversion d'axes X/Y/Z pour $2, $3, $23 */}
                  {isAxisBitmask && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200 flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                        <Sliders className="w-3 h-3 text-sky-600" />
                        Masque d'inversion d'axes :
                      </span>
                      {[
                        { axis: 'Inverser X', bit: 1, color: 'text-red-600' },
                        { axis: 'Inverser Y', bit: 2, color: 'text-emerald-700' },
                        { axis: 'Inverser Z', bit: 4, color: 'text-blue-700' },
                      ].map((item) => {
                        const checked = (Math.round(currentVal) & item.bit) !== 0;
                        return (
                          <label
                            key={item.bit}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer select-none transition ${
                              checked
                                ? 'bg-sky-50 border-sky-400 text-slate-900'
                                : 'bg-white border-slate-300 text-slate-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleBitmask(setting.id, item.bit)}
                              className="rounded border-slate-300 bg-white text-sky-600"
                            />
                            <span className={`font-bold ${item.color}`}>
                              {item.axis}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              (+{item.bit})
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Colonne Droite (5/12) : Calculateur Pas/mm CNC Shield V3.0 & Assistant Calibration */}
          <div className="lg:col-span-5 overflow-y-auto p-4 space-y-4 bg-white">
            <HomingDiagnostics status={status} />
            {/* 1. Calculateur matériel Pas/mm (Spécial CNC Shield V3.0) */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Calculateur de Pas/mm (CNC Shield V3.0)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Configurez vos cavaliers MS0/MS1/MS2 et votre transmission mécanique
                  </p>
                </div>
              </div>

              {/* Type de transmission */}
              <div className="space-y-1 text-xs">
                <label className="block text-slate-700 font-semibold">
                  1. Type de transmission mécanique
                </label>
                <select
                  value={transmissionType}
                  onChange={(e) =>
                    setTransmissionType(e.target.value as typeof transmissionType)
                  }
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                >
                  <option value="t8-lead4">
                    Vis trapézoïdale T8 — Avance 4 mm/tour (Standard CNC 3018 / 2 filets)
                  </option>
                  <option value="t8-lead8">
                    Vis trapézoïdale T8 — Avance 8 mm/tour (Rapide / 4 filets)
                  </option>
                  <option value="t8-lead2">
                    Vis trapézoïdale T8 — Avance 2 mm/tour (Haute précision / 1 filet)
                  </option>
                  <option value="sfu1605">
                    Vis à billes SFU1605 / 1204 — Avance 5 mm/tour
                  </option>
                  <option value="gt2-16t">
                    Courroie GT2 (pas 2mm) + Poulie 16 dents (32 mm/tour)
                  </option>
                  <option value="gt2-20t">
                    Courroie GT2 (pas 2mm) + Poulie 20 dents (40 mm/tour)
                  </option>
                </select>
              </div>

              {/* Angle Moteur & Type de Driver */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    2. Moteur Nema 17 / 23
                  </label>
                  <select
                    value={motorStepsPerRev}
                    onChange={(e) =>
                      setMotorStepsPerRev(Number(e.target.value) as 200 | 400)
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                  >
                    <option value={200}>1.8° (200 pas/tr)</option>
                    <option value={400}>0.9° (400 pas/tr)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    3. Driver sur CNC Shield
                  </label>
                  <select
                    value={driverType}
                    onChange={(e) =>
                      setDriverType(e.target.value as 'A4988' | 'DRV8825')
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                  >
                    <option value="A4988">Pololu A4988 (1/16 max)</option>
                    <option value="DRV8825">DRV8825 (1/32 max)</option>
                  </select>
                </div>
              </div>

              {/* Cavaliers Jumpers MS0 / MS1 / MS2 sous le driver */}
              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 font-semibold flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-sky-600" />
                    Cavaliers (Jumpers) sous le driver :
                  </span>
                  <span className="text-[11px] font-mono text-sky-700 font-bold">
                    {microsteppingInfo.label}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'ms0', label: 'Jumper MS0 (M0)' },
                      { key: 'ms1', label: 'Jumper MS1 (M1)' },
                      { key: 'ms2', label: 'Jumper MS2 (M2)' },
                    ] as const
                  ).map((j) => {
                    const active = jumpers[j.key];
                    return (
                      <button
                        key={j.key}
                        type="button"
                        onClick={() =>
                          setJumpers((prev) => ({ ...prev, [j.key]: !prev[j.key] }))
                        }
                        className={`py-2 px-2 rounded-lg border text-center font-mono text-[11px] transition ${
                          active
                            ? 'bg-sky-50 border-sky-400 text-sky-900 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        <div>{j.label}</div>
                        <div className="text-[10px] mt-0.5">
                          {active ? 'INSTALLÉ (HIGH)' : 'RETIRÉ (LOW)'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Résultat & Boutons d'application en 1 clic à $100, $101, $102 */}
              <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">Valeur calculée :</span>
                  <span className="text-lg font-mono font-extrabold text-sky-700">
                    {calculatedStepsPerMm} pas/mm
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleValueChange(100, calculatedStepsPerMm)}
                    className="py-1.5 px-2 rounded-lg bg-white hover:bg-red-50 text-red-700 border border-red-300 text-[11px] font-bold transition"
                  >
                    → $100 (X)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleValueChange(101, calculatedStepsPerMm)}
                    className="py-1.5 px-2 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 text-[11px] font-bold transition"
                  >
                    → $101 (Y)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleValueChange(102, calculatedStepsPerMm)}
                    className="py-1.5 px-2 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 text-[11px] font-bold transition"
                  >
                    → $102 (Z)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleValueChange(100, calculatedStepsPerMm);
                      handleValueChange(101, calculatedStepsPerMm);
                      handleValueChange(102, calculatedStepsPerMm);
                    }}
                    className="py-1.5 px-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold transition"
                  >
                    Tous X/Y/Z
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Assistant de calibration par mesure réelle (Pied à coulisse / Réglet) */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
                  <Ruler className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Assistant de Calibration par Mesure Réelle
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Corrigez les pas/mm à partir d'une mesure au pied à coulisse
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 100, label: 'Axe X ($100)' },
                    { id: 101, label: 'Axe Y ($101)' },
                    { id: 102, label: 'Axe Z ($102)' },
                  ] as const
                ).map((ax) => (
                  <button
                    key={ax.id}
                    type="button"
                    onClick={() => setCalibAxisId(ax.id)}
                    className={`py-1.5 px-2 rounded-lg font-bold border transition ${
                      calibAxisId === ax.id
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {ax.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">
                    Distance demandée (mm)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="any"
                    value={requestedDistMm}
                    onChange={(e) => setRequestedDistMm(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">
                    Distance réelle mesurée (mm)
                  </label>
                  <input
                    type="number"
                    min={0.1}
                    step="any"
                    value={measuredDistMm}
                    onChange={(e) => setMeasuredDistMm(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                <div className="space-y-0.5 font-mono text-[11px]">
                  <div className="text-slate-500">
                    Actuel (${calibAxisId}) :{' '}
                    <span className="text-slate-900 font-semibold">{currentAxisSteps} pas/mm</span>
                  </div>
                  <div className="text-emerald-700 font-bold flex items-center gap-1">
                    <span>Corrigé :</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="text-sm">{calibratedStepsPerMm} pas/mm</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleValueChange(calibAxisId, calibratedStepsPerMm)}
                  className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                >
                  Appliquer à ${calibAxisId}
                </button>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-slate-600 bg-amber-50/70 p-2.5 rounded-lg border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Astuce : Après avoir appliqué vos nouveaux pas/mm, cliquez sur{' '}
                  <strong className="text-emerald-700">Enregistrer dans l'EEPROM</strong>{' '}
                  en haut à droite pour flasher l'Arduino Uno.
                </span>
              </div>
            </div>
          </div>
        </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default GrblSettingsModal;
