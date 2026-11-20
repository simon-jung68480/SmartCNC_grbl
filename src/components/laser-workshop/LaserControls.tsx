export const button =
  "inline-flex items-center justify-center gap-1.5 min-h-8 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-[#1b2436] hover:bg-[#243047] text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors cursor-pointer";
export const input =
  "w-full min-w-0 min-h-9 rounded-lg border border-slate-700 bg-[#090d14] px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none disabled:bg-[#0f1520] disabled:opacity-60";
export const card =
  "rounded-xl border border-slate-800 bg-[#141b27] text-slate-100 p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.28)]";

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <label className="block text-[11px] font-semibold text-slate-300 space-y-1">
      <span>{label}</span>
      <input
        className={input}
        type="number"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
