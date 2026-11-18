import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { button } from "./LaserControls";

export function LaserLayerDialog({ name, onClose, children, focusSettings }: { name: string; onClose: () => void; children: ReactNode; focusSettings: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [section, setSection] = useState<"operation" | "focus">("operation");

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return <dialog ref={dialog} aria-labelledby={titleId} onClose={onClose}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[min(94vw,46rem)] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/55">
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0"><h2 id={titleId} className="font-semibold">Paramètres du calque</h2><p className="truncate text-sm text-slate-600">{name}</p></div>
      <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Fermer les paramètres du calque"
        className="grid size-9 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100"><X size={18} /></button>
    </div>
    <div className="flex gap-2 border-b border-slate-200 bg-white px-4 pb-3 pt-2" role="group" aria-label="Catégorie de paramètres">
      <button type="button" className={`${button} aria-pressed:border-sky-500 aria-pressed:bg-sky-50`} aria-pressed={section === "operation"} onClick={() => setSection("operation")}>Gravure</button>
      <button type="button" className={`${button} aria-pressed:border-sky-500 aria-pressed:bg-sky-50`} aria-pressed={section === "focus"} onClick={() => setSection("focus")}>Hors focus</button>
    </div>
    <div className="max-h-[calc(90dvh-8rem)] space-y-3 overflow-y-auto p-3 sm:p-4">{section === "operation" ? children : focusSettings}</div>
  </dialog>;
}
