import type { LaserFocusSettings as Settings } from "../../utils/laserCam";
import { card, NumberField } from "./LaserControls";

type Props = {
  focus: Settings;
  disabled: boolean;
  external: boolean;
  workCoordinateSystem?: string;
  changeFocus: (patch: Partial<Settings>) => void;
};

export function LaserFocusSettings({ focus, disabled, external, workCoordinateSystem, changeFocus }: Props) {
  return (
  <fieldset
    disabled={disabled}
    className={`${card} disabled:opacity-60`}
  >
    <h2 className="text-sm font-bold text-slate-50 mb-3">
      Hors focus et traits larges
    </h2>
    <label className="flex gap-2 items-center text-xs text-slate-200 cursor-pointer">
      <input
        type="checkbox"
        checked={focus.enabled}
        onChange={(e) => changeFocus({ enabled: e.target.checked })}
        className="accent-sky-400"
      />
      Utiliser une gravure hors focus
    </label>
    {focus.enabled && (
      <>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <NumberField
            label="Largeur mesurée du spot (mm)"
            value={focus.spotDiameter}
            min={0.02}
            max={20}
            onChange={(v) => changeFocus({ spotDiameter: v })}
          />
          <NumberField
            label="Décalage de focus (mm)"
            value={focus.offset}
            min={-50}
            max={50}
            onChange={(v) => changeFocus({ offset: v })}
          />
        </div>
        <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
          Mesurez la largeur réellement obtenue sur votre matériau à
          ce décalage. Elle n’est pas calculée à partir de Z. Un
          décalage positif monte la tête ; un décalage négatif la
          descend. Sans pilotage Z, faites ce réglage manuellement
          avant la gravure.
        </p>
        {!external ? (
          <>
            <label className="flex gap-2 items-center text-xs text-slate-200 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={focus.controlZ}
                onChange={(e) =>
                  changeFocus({ controlZ: e.target.checked })
                }
                className="accent-sky-400"
              />
              Appliquer ce décalage avec l’axe Z dans le G-code
            </label>
            {focus.controlZ && (
              <div className="mt-3 space-y-2">
                <NumberField
                  label={workCoordinateSystem ? `Z pièce au focus (${workCoordinateSystem}, mm)` : "Z pièce au focus (mm)"}
                  value={focus.referenceZ}
                  onChange={(v) => changeFocus({ referenceZ: v })}
                />
                <NumberField
                  label="Avance Z (mm/min)"
                  value={focus.zFeed}
                  min={1}
                  max={5000}
                  onChange={(v) => changeFocus({ zFeed: v })}
                />
                <p className="text-xs font-semibold text-amber-300">
                  Z cible :{" "}
                  {Number((focus.referenceZ + focus.offset).toFixed(2)).toLocaleString("fr-FR")} mm,
                  avant le premier déplacement XY.
                </p>
                <label className="flex gap-2 items-center text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={focus.restoreZ}
                    onChange={(e) =>
                      changeFocus({ restoreZ: e.target.checked })
                    }
                    className="accent-sky-400"
                  />
                  Revenir au Z de focus après le dernier calque
                </label>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Le retour au Z de référence s’effectue toujours avant un autre calque. Les mouvements Z se font laser éteint.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-amber-300 mt-2">
            G-code externe conservé : réglage du focus manuel
            uniquement. Aucune commande Z n’est ajoutée.
          </p>
        )}
      </>
    )}
  </fieldset>
  );
}
