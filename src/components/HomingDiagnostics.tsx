import React from 'react';
import type { GrblStatus } from '../types/cnc';

export function HomingDiagnostics({ status }: { status?: GrblStatus }) {
  const connected = Boolean(status?.connected);
  const active = (['x', 'y', 'z'] as const).filter(axis => status?.pins[`${axis}Limit`]);
  return <section className="p-4 rounded-2xl bg-sky-50 border border-sky-200 space-y-3 text-xs text-slate-700">
    <h3 className="font-bold text-slate-900">Diagnostic des fins de course et du homing</h3>
    <p>GRBL exécute Z puis X/Y. Chaque axe doit s’arrêter sur son propre contact pendant que l’autre continue. L’application transmet la commande $H ; le firmware contrôle les moteurs.</p>
    <div className="flex gap-2" aria-live="polite">
      {(['x', 'y', 'z'] as const).map(axis => <span key={axis} className={`rounded border px-3 py-2 font-bold ${connected && status?.pins[`${axis}Limit`] ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-white border-slate-300'}`}>
        {axis.toUpperCase()} : {connected ? status?.pins[`${axis}Limit`] ? 'déclenché' : 'libre' : 'hors ligne'}
      </span>)}
    </div>
    {status?.isSimulator ? <p>Simulation : les contacts sont virtuels. Ce diagnostic ne valide pas le câblage réel.</p> : <>
      <p>Machine immobile, moteurs sans mouvement, actionnez chaque contact séparément : X seul doit allumer X, Y seul doit allumer Y, puis relâchez. Ne lancez pas de déplacement pendant ce contrôle. Si les limites matérielles sont actives ($21=1), le contact peut mettre GRBL en alarme ; les indicateurs restent consultables.</p>
      {connected && active.length > 1 && <p className="font-semibold text-amber-900">Entrées actives : {active.join(', ').toUpperCase()}. Si vous actionnez un seul contact, vérifiez le câblage et les entrées partagées avant de relancer le homing.</p>}
      <p>Arduino Uno / GRBL 1.1 : X = D9, Y = D10, Z = D12. Sur le CNC Shield V3.0, Z se raccorde à SpnEn ; D11 est la sortie PWM. Si les entrées sont indépendantes et le défaut persiste, contrôlez le firmware installé. Le réglage $23 change la direction, pas l’indépendance des contacts.</p>
    </>}
    <a className="text-sky-700 underline" href="https://github.com/gnea/grbl/wiki/Set-up-the-Homing-Cycle" target="_blank" rel="noreferrer">Documentation GRBL : contrôle des contacts</a>
  </section>;
}
