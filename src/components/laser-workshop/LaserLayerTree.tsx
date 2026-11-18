import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Image, Layers, Pencil, ScanLine, Settings2, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { LaserDocumentObject } from '../../utils/laserDocument';
import { laserLayerGroups, laserLayerKey } from '../../utils/laserLayerSettings';

type Operation = 'fill' | 'contours' | 'raster';

interface Props {
  objects: LaserDocumentObject[];
  selectedId: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onSelectOperation?: (id: string, operation: Operation) => void;
  onRename?: (id: string, name: string) => void;
  onEdit: (id: string) => void;
  colorName: (color: string) => string;
}

const operations = {
  contours: ['contours'],
  fill: ['fill'],
  'fill-and-contours': ['fill', 'contours'],
} as const;

const action = 'inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-35';
const trigger = 'inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-200/60 focus-visible:outline-2 focus-visible:outline-sky-600';
const format = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 });

export function LaserLayerTree({ objects, selectedId, disabled, onSelect, onToggle, onToggleVisibility, onDuplicate, onRemove, onMove, onSelectOperation, onRename, onEdit, colorName }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const groups = laserLayerGroups(objects);
  const selectedIndex = groups.flat().findIndex(object => object.id === selectedId);
  const selected = objects.find(object => object.id === selectedId);

  return (
    <section aria-label="Calques et ordre de gravure" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Layers size={16} aria-hidden="true" /> Calques</h2>
        {selected && (
          <div role="group" aria-label={`Actions pour ${selected.name}`} className="flex flex-wrap gap-1">
            <button type="button" className={action} title="Paramètres du calque" aria-label="Paramètres du calque" disabled={disabled} onClick={() => onEdit(selected.id)}><Settings2 size={15} aria-hidden="true" /></button>
            <button type="button" className={action} title="Graver plus tôt" aria-label="Graver plus tôt" disabled={disabled || selectedIndex === 0} onClick={() => onMove(selected.id, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
            <button type="button" className={action} title="Graver plus tard" aria-label="Graver plus tard" disabled={disabled || selectedIndex === objects.length - 1} onClick={() => onMove(selected.id, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
            {onRename && <button type="button" className={action} title="Renommer" aria-label="Renommer le calque" disabled={disabled} onClick={() => { setEdit({ id: selected.id, name: selected.name }); setCollapsed(previous => { const next = new Set(previous); next.delete(selected.id); return next; }); }}><Pencil size={14} aria-hidden="true" /></button>}
            <button type="button" className={action} title="Dupliquer l’objet" aria-label="Dupliquer l’objet" disabled={disabled || objects.length >= 200} onClick={() => onDuplicate(selected.id)}><Copy size={14} aria-hidden="true" /></button>
            <button type="button" className={`${action} hover:text-rose-700`} title="Supprimer l’objet" aria-label="Supprimer l’objet" disabled={disabled} onClick={() => onRemove(selected.id)}><Trash2 size={14} aria-hidden="true" /></button>
          </div>
        )}
      </div>
      {objects.length === 0 ? (
        <p className="p-3 text-xs text-slate-500">Importez un dessin pour ajouter un calque.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {groups.map(group => <li key={laserLayerKey(group[0])}>
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <span className="size-3 rounded-sm" style={{ backgroundColor: group[0].color ?? '#334155' }} />
              {group[0].color ? colorName(group[0].color) : 'Sans couleur'} · {group[0].raster ? 'Image' : 'Vectoriel'}
              {group[0].isolatedColor && <span className="font-normal">· réglages historiques</span>}
            </div>
            <ul>{group.map(object => {
            const expanded = !collapsed.has(object.id);
            const isSelected = selectedId === object.id;
            const rowEdit = edit?.id === object.id ? edit : null;
            return (
              <li key={object.id} className={isSelected ? 'bg-sky-50/75' : undefined}>
                <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5">
                  <button type="button" className={trigger} aria-expanded={expanded} aria-label={`${expanded ? 'Masquer' : 'Afficher'} les opérations de ${object.name}`} onClick={() => setCollapsed(previous => {
                    const next = new Set(previous);
                    if (expanded) next.add(object.id);
                    else next.delete(object.id);
                    return next;
                  })}>{expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}</button>
                  <button type="button" title={object.name} aria-pressed={isSelected} disabled={disabled} className={`min-w-0 flex-1 truncate rounded py-1 text-left text-xs focus-visible:outline-2 focus-visible:outline-sky-600 ${isSelected ? 'font-semibold text-sky-900' : 'text-slate-700'}`} onClick={() => onSelect(object.id)} onDoubleClick={() => onEdit(object.id)}>{object.name}</button>
                  <button type="button" className={trigger} title={object.hidden ? 'Afficher sur le plateau' : 'Masquer sur le plateau'} aria-label={`Afficher ${object.name} sur le plateau`} aria-pressed={!object.hidden} disabled={disabled} onClick={() => onToggleVisibility(object.id)}>
                    {object.hidden ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                  </button>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded py-1 pl-1 pr-0.5 text-[11px] text-slate-600">
                    <input type="checkbox" className="size-3.5 accent-sky-700" checked={object.enabled} disabled={disabled} aria-label={`Inclure ${object.name} dans la gravure`} onChange={() => onToggle(object.id)} />
                    Sortie
                  </label>
                </div>
                {rowEdit && expanded && (
                  <form className="ml-9 mr-2 flex gap-1 pb-2" onSubmit={event => {
                    event.preventDefault();
                    const name = rowEdit.name.trim();
                    if (disabled || !name) return;
                    onRename?.(object.id, name);
                    setEdit(null);
                  }}>
                    <input autoFocus aria-label="Nom du calque" value={rowEdit.name} maxLength={1000} disabled={disabled} className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 text-xs text-slate-900" onChange={event => setEdit({ id: object.id, name: event.target.value })} onKeyDown={event => { if (event.key === 'Escape') setEdit(null); }} />
                    <button type="submit" className={`${action} px-2 text-xs`} disabled={disabled || !rowEdit.name.trim()}>Valider</button>
                  </form>
                )}
                {expanded && (
                  <ul aria-label={`Opérations de ${object.name}`} className="ml-5 mr-2 mb-2 border-l border-slate-200 pl-3">
                    {(object.raster ? ['raster'] as const : operations[object.fill.mode]).map(operation => {
                      const cut = operation === 'contours' && object.fill.mode === 'fill-and-contours' ? object.contourCut ?? object.cut : object.cut;
                      return (
                      <li key={operation}>
                        <button type="button" disabled={disabled} className={`flex min-h-8 w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded px-1.5 py-1 text-left text-xs hover:bg-slate-200/60 focus-visible:outline-2 focus-visible:outline-sky-600 ${object.enabled ? 'text-slate-700' : 'text-slate-500'}`} onClick={() => onSelectOperation ? onSelectOperation(object.id, operation) : onSelect(object.id)}>
                          {operation === 'raster' ? <Image size={14} aria-hidden="true" /> : operation === 'fill' ? <ScanLine size={14} aria-hidden="true" /> : <Square size={14} aria-hidden="true" />}
                          <span>{operation === 'raster' ? 'Balayage image' : operation === 'fill' ? 'Remplissage' : 'Contour'}</span>
                          <span className="ml-auto text-[11px] tabular-nums text-slate-500">{format.format(cut.feed)} mm/min · {format.format(cut.power)} % · {cut.passes} {cut.passes > 1 ? 'passes' : 'passe'}</span>
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
            })}</ul>
          </li>)}
        </ul>
      )}
    </section>
  );
}
