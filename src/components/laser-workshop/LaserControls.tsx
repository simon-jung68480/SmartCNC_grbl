export const button =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors";
export const input =
  "w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-100";
export const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

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
    <label className="block text-xs text-slate-600 space-y-1">
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
