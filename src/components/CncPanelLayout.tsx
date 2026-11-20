import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import { HorizontalSplitter, VerticalSplitter, type useLayoutResizer } from "./LayoutResizers";

const columns = [
  { id: "left", label: "Gauche" },
  { id: "center", label: "Centre" },
  { id: "right", label: "Droite" },
] as const;
type Column = typeof columns[number]["id"];

const panelLabels = {
  dro: "Coordonnées",
  jog: "Déplacements",
  viewport: "Vue 3D",
  gcode: "G-code",
  tools: "Outils",
  console: "Console",
};
type Panel = keyof typeof panelLabels;
type PanelLayout = Record<Column, Panel[]> & { hidden: Panel[] };

const defaultLayout: PanelLayout = {
  left: ["dro", "jog"],
  center: ["viewport", "gcode"],
  right: ["tools", "console"],
  hidden: [],
};
const storageKey = "smartcnc_cnc_panels";

function readLayout(): PanelLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as PanelLayout | null;
    if (saved && columns.every(({ id }) => Array.isArray(saved[id])) && Array.isArray(saved.hidden)) {
      const panels = columns.flatMap(({ id }) => saved[id]);
      const hidden = new Set(saved.hidden);
      const known = Object.keys(panelLabels);
      if (panels.length === known.length && known.every(panel => panels.includes(panel as Panel)) &&
          saved.hidden.every(panel => panels.includes(panel))) {
        return { ...saved, hidden: [...hidden] };
      }
    }
  } catch {
    // Fall back to the factory layout if storage is unavailable.
  }
  return defaultLayout;
}

export function useCncPanelLayout() {
  const [panelLayout, setPanelLayout] = useState(readLayout);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(panelLayout)); } catch {}
  }, [panelLayout]);
  return { panelLayout, setPanelLayout, resetPanels: () => setPanelLayout(defaultLayout) };
}

interface LayoutDialogProps {
  layout: PanelLayout;
  onChange: (layout: PanelLayout) => void;
  onReset: () => void;
  onClose: () => void;
}

export function CncLayoutDialog({ layout, onChange, onReset, onClose }: LayoutDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [dragged, setDragged] = useState<Panel | null>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  function move(panel: Panel, target: Column, before?: Panel) {
    if (before === panel) return;
    const next = { ...layout };
    for (const { id } of columns) next[id] = layout[id].filter(item => item !== panel);
    const index = before === undefined ? next[target].length : next[target].indexOf(before);
    next[target].splice(index, 0, panel);
    onChange(next);
  }

  function drop(event: React.DragEvent, target: Column, before?: Panel) {
    if (!dragged) return;
    event.preventDefault();
    event.stopPropagation();
    move(dragged, target, before);
    setDragged(null);
  }

  function reorder(column: Column, index: number, offset: number) {
    const items = [...layout[column]];
    const other = index + offset;
    [items[index], items[other]] = [items[other], items[index]];
    onChange({ ...layout, [column]: items });
  }

  const iconButton = "rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 cursor-pointer transition-colors";
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }}
    aria-labelledby="cnc-layout-title"
    className="m-auto w-[calc(100%-1rem)] max-w-4xl max-h-[calc(100%-1rem)] overflow-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-slate-900/45">
    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
      <h2 id="cnc-layout-title" className="text-base font-bold">Disposition de l’atelier CNC</h2>
      <button type="button" className={iconButton} aria-label="Fermer la disposition" onClick={onClose}><X size={18}/></button>
    </div>
    <p className="my-3 text-xs text-slate-600">Glissez les panneaux entre les colonnes ou utilisez les menus et les flèches. Décochez un panneau pour le masquer.</p>
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {columns.map(({ id, label }) => <section key={id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5"
        onDragOver={event => { if (dragged) event.preventDefault(); }} onDrop={event => drop(event, id)}>
        <h3 className="mb-2 text-xs font-bold text-slate-700 px-1">{label}</h3>
        {layout[id].map((panel, index) => <div key={panel}
          className="mb-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-2xs"
          onDrop={event => drop(event, id, panel)}>
          <span draggable className="cursor-grab text-slate-400 hover:text-slate-700" title={`Glisser ${panelLabels[panel]}`}
            onDragStart={event => { event.dataTransfer.setData("text/plain", panel); event.dataTransfer.effectAllowed = "move"; setDragged(panel); }}
            onDragEnd={() => setDragged(null)}><GripVertical size={16}/></span>
          <label className="flex flex-1 items-center gap-1.5 whitespace-nowrap font-medium text-slate-800 cursor-pointer">
            <input type="checkbox" className="accent-sky-600 rounded" checked={!layout.hidden.includes(panel)}
              onChange={event => onChange({ ...layout, hidden: event.target.checked ? layout.hidden.filter(item => item !== panel) : [...layout.hidden, panel] })}/>
            {panelLabels[panel]}
          </label>
          <select className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs" aria-label={`Colonne de ${panelLabels[panel]}`}
            value={id} onChange={event => move(panel, event.target.value as Column)}>
            {columns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}
          </select>
          <button type="button" className={iconButton} aria-label={`Monter ${panelLabels[panel]}`} disabled={index === 0}
            onClick={() => reorder(id, index, -1)}><ArrowUp size={12}/></button>
          <button type="button" className={iconButton} aria-label={`Descendre ${panelLabels[panel]}`} disabled={index === layout[id].length - 1}
            onClick={() => reorder(id, index, 1)}><ArrowDown size={12}/></button>
        </div>)}
      </section>)}
    </div>
    <div className="mt-4 flex justify-end">
      <button type="button" className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer" onClick={onReset}>Rétablir la disposition par défaut</button>
    </div>
  </dialog>;
}

interface WorkspaceProps {
  panels: Record<Panel, ReactNode>;
  panelLayout: PanelLayout;
  sizes: ReturnType<typeof useLayoutResizer>;
  containerRef: React.RefObject<HTMLElement | null>;
  onConfigure: () => void;
}

export function CncWorkspace({ panels, panelLayout, sizes, containerRef, onConfigure }: WorkspaceProps) {
  const [selected, setSelected] = useState<Column>("left");
  const visible = columns.map(column => ({
    ...column, panels: panelLayout[column.id].filter(panel => !panelLayout.hidden.includes(panel)),
  })).filter(column => column.panels.length);
  const active = visible.some(column => column.id === selected) ? selected : visible[0]?.id;
  const { layout, activeDrag, startDrag, resetLeftWidth, resetRightWidth } = sizes;

  if (!visible.length) return <main className="flex flex-1 items-center justify-center">
    <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-slate-50 cursor-pointer" onClick={onConfigure}>Afficher des panneaux CNC</button>
  </main>;

  return <>
    <nav aria-label="Panneaux CNC" className="cnc-column-tabs flex-wrap border-b border-slate-200 bg-white px-2 gap-1">
      {visible.map(({ id, panels }) => <button type="button" key={id} aria-pressed={active === id}
        className={`flex-1 border-b-2 px-2 py-2 text-xs font-semibold transition-colors cursor-pointer ${active === id ? "border-sky-600 text-sky-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
        onClick={() => setSelected(id)}>{panels.map(panel => panelLabels[panel]).join(" · ")}</button>)}
    </nav>
    <main ref={containerRef} className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-hidden p-2">
      {visible.map(({ id, panels: columnPanels }, index) => {
        const isCenter = id === "center";
        const isLeft = id === "left";
        const showSplit = !isLeft && columnPanels.length > 1;
        const rowDrag = isCenter ? "row-center" : "row-right";
        const colDrag = isLeft ? "col-left" : "col-right";
        const width = isLeft ? layout.leftWidth : layout.rightWidth;
        const fixedWidth = visible.length > 1 && (isLeft || (!isCenter && visible.some(column => column.id === "center")));
        return <section key={id} data-column={id} data-active={active === id}
          className={`cnc-column-group min-h-0 min-w-0 ${fixedWidth ? "cnc-column-sized" : "flex-1"}`}
          style={{ "--panel-width": `${width}px` } as React.CSSProperties}>
          {!isCenter && !isLeft && fixedWidth && index > 0 && <VerticalSplitter onPointerDown={event => startDrag(colDrag, event)}
            onDoubleClick={resetRightWidth} isActive={activeDrag === colDrag}/>}
          <div ref={isCenter ? sizes.centerColRef : isLeft ? undefined : sizes.rightColRef}
            className="min-w-0 flex flex-1 flex-col gap-1.5 overflow-auto">
            {columnPanels.map((panel, panelIndex) => {
              const splitTop = showSplit && panelIndex === 0;
              const scrolls = panel === "dro" || panel === "jog" || panel === "tools";
              const natural = isLeft && scrolls;
              const basis = splitTop ? `${isCenter ? layout.centerTopPercent : layout.rightTopPercent}%` : undefined;
              return <div key={panel} className={`min-w-0 ${natural ? "shrink-0" : "min-h-[160px]"} ${splitTop || natural ? "shrink-0" : "flex-1"} flex flex-col`}
                style={{ flexBasis: basis }}>
                <div className={`min-h-0 ${natural ? "" : "flex-1"} ${scrolls ? "overflow-auto" : "overflow-hidden flex flex-col"}`}>
                  {panels[panel]}
                </div>
                {splitTop && <HorizontalSplitter onPointerDown={event => startDrag(rowDrag, event)}
                  onDoubleClick={isCenter ? sizes.resetCenterTop : sizes.resetRightTop} isActive={activeDrag === rowDrag}/>}
              </div>;
            })}
          </div>
          {isLeft && index < visible.length - 1 && <VerticalSplitter onPointerDown={event => startDrag(colDrag, event)}
            onDoubleClick={resetLeftWidth} isActive={activeDrag === colDrag}/>}
        </section>;
      })}
    </main>
  </>;
}
