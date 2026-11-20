import { BookOpen, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { LaserLayerSettings } from '../../utils/laserLayerSettings';
import type { LaserPreset } from '../../utils/laserPresets';
import { button, input } from './LaserControls';
import { LaserPresetEditor } from './LaserPresetEditor';

type Props = {
  presets: LaserPreset[];
  current?: { name: string; settings: LaserLayerSettings };
  disabled: boolean;
  onChange: (presets: LaserPreset[]) => void;
  onApply: (settings: LaserLayerSettings) => void;
  onClose: () => void;
};

export function LaserPresetLibrary({ presets, current, disabled, onChange, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(), categoriesId = useId();
  const [selectedId, setSelectedId] = useState('');
  const [draftSettings, setDraftSettings] = useState<LaserLayerSettings>();
  const [name, setName] = useState(''), [category, setCategory] = useState(''), [query, setQuery] = useState('');
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const selected = presets.find(preset => preset.id === selectedId);
  const compatible = current && selected?.settings.kind === current.settings.kind;
  const dirty = !!selected && (name !== selected.name || category !== selected.category || draftSettings !== selected.settings);
  const canDiscard = () => !dirty || window.confirm('Abandonner les modifications non enregistrées du préréglage ?');
  const categories = [...new Set(presets.map(preset => preset.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const groups = new Map<string, LaserPreset[]>();
  const filtered = presets.filter(preset => `${preset.category} ${preset.name}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr')))
    .sort((a, b) => a.category.localeCompare(b.category, 'fr') || a.name.localeCompare(b.name, 'fr'));
  for (const preset of filtered) {
    const group = groups.get(preset.category);
    if (group) group.push(preset);
    else groups.set(preset.category, [preset]);
  }

  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);

  const commit = (next: LaserPreset[], done: string) => {
    setError(''); setMessage('');
    try { onChange(next); setMessage(done); return true; }
    catch (error) { setError((error as Error).message); return false; }
  };
  const save = (settings: LaserLayerSettings, replace?: LaserPreset) => {
    if (!name.trim()) return;
    const entry = { id: replace?.id ?? crypto.randomUUID(), name: name.trim(), category: category.trim(), settings };
    const next = replace ? presets.map(preset => preset.id === replace.id ? entry : preset) : [...presets, entry];
    if (commit(next, 'Préréglage enregistré.')) {
      setSelectedId(entry.id); setDraftSettings(entry.settings); setName(entry.name); setCategory(entry.category);
    }
  };

  return <dialog ref={dialog} aria-labelledby={titleId} onClose={onClose} onCancel={event => { if (!canDiscard()) event.preventDefault(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,54rem)] overflow-hidden rounded-2xl border border-slate-700 bg-[#141b27] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75">
    <header className="flex items-center justify-between gap-2 border-b border-slate-800 bg-[#0f1520] px-4 py-3">
      <h2 id={titleId} className="flex items-center gap-2 font-bold text-slate-50"><BookOpen size={18} className="text-sky-400" /> Bibliothèque de réglages</h2>
      <button type="button" className={button} aria-label="Fermer la bibliothèque" onClick={() => { if (canDiscard()) dialog.current?.close(); }}><X size={16} /></button>
    </header>
    <div className="grid max-h-[calc(90dvh-5rem)] gap-4 overflow-y-auto p-4 sm:grid-cols-[1fr_1.2fr]">
      <div className="min-w-0 space-y-3">
        <input autoFocus type="search" aria-label="Rechercher un préréglage" placeholder="Rechercher un préréglage" className={input} value={query} onChange={event => setQuery(event.target.value)} />
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {!groups.size && <p className="text-xs text-slate-300">{presets.length ? 'Aucun résultat.' : 'La bibliothèque est vide.'}</p>}
          {[...groups].map(([group, entries]) => <section key={group} className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{group || 'Sans catégorie'}</h3>
            {entries.map(entry => <button type="button" key={entry.id} aria-pressed={selectedId === entry.id}
              className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#090d14] px-2.5 py-1.5 text-left text-sm text-slate-100 hover:bg-[#1b2436] aria-pressed:border-sky-400 aria-pressed:bg-sky-500/20 aria-pressed:text-sky-200 cursor-pointer"
              onClick={() => {
                if (entry.id === selectedId || !canDiscard()) return;
                setSelectedId(entry.id); setDraftSettings(entry.settings); setName(entry.name); setCategory(entry.category); setMessage(''); setError('');
              }}>
              <span className="truncate">{entry.name}</span><span className="shrink-0 text-xs text-slate-300">{entry.settings.kind === 'raster' ? 'Image' : 'Vectoriel'}</span>
            </button>)}
          </section>)}
        </div>
      </div>
      <div className="min-w-0 space-y-3">
        <p className="text-xs text-slate-300">{current ? `Calque sélectionné · ${current.name}` : 'Sélectionnez un calque pour enregistrer ou appliquer un réglage.'}</p>
        <label className="block space-y-1 text-xs font-semibold text-slate-200"><span>Nom</span><input className={input} maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="block space-y-1 text-xs font-semibold text-slate-200"><span>Catégorie</span><input className={input} maxLength={80} list={categoriesId} value={category} onChange={event => setCategory(event.target.value)} /></label>
        <datalist id={categoriesId}>{categories.map(value => <option key={value} value={value} />)}</datalist>
        {selected && draftSettings && <LaserPresetEditor settings={draftSettings} disabled={disabled} onChange={setDraftSettings} />}
        <div className="flex flex-wrap gap-2">
          {selected && draftSettings && <button type="button" className={`${button} !bg-sky-400 hover:!bg-sky-300 !border-sky-300 !text-slate-950 font-bold`} disabled={disabled || !dirty || !name.trim()}
            onClick={() => save(draftSettings, selected)}>Enregistrer les modifications</button>}
          {current && <button type="button" className={button} disabled={disabled || !name.trim()} onClick={() => { if (canDiscard()) save(current.settings); }}>Créer depuis le calque</button>}
          {selected && compatible && <button type="button" className={button} disabled={disabled || !name.trim()} onClick={() => { if (canDiscard()) save(current.settings, selected); }}>Remplacer par les réglages du calque</button>}
          {selected && <button type="button" className={`${button} !text-rose-300 !border-rose-500/40 hover:!bg-rose-950/60`} disabled={disabled} onClick={() => {
            if (window.confirm(`Supprimer le préréglage « ${selected.name} » ?`) && commit(presets.filter(preset => preset.id !== selected.id), 'Préréglage supprimé.')) {
              setSelectedId(''); setDraftSettings(undefined); setName(''); setCategory('');
            }
          }}>Supprimer</button>}
        </div>
        {selected && current && !compatible && <p className="text-xs text-amber-300">Choisissez un préréglage du même type que le calque.</p>}
        {selected && <button type="button" className={`${button} !bg-emerald-500 hover:!bg-emerald-400 !border-emerald-400 !text-slate-950 font-bold`} disabled={disabled || !compatible || dirty}
          onClick={() => { onApply(selected.settings); dialog.current?.close(); }}>Appliquer au calque</button>}
        {message && <p role="status" className="text-xs text-emerald-300">{message}</p>}
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      </div>
    </div>
  </dialog>;
}
