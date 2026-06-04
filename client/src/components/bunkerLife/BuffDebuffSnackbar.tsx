import type { ReactNode } from 'react';
import { Brain, CheckCheck, HeartPulse, Skull, Sparkles } from 'lucide-react';
import type { PlayerRef, StatusChange, VitalChange } from '../../types/game';

function OutcomeChip({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${color}`}>
      {children}
    </span>
  );
}

export default function BuffDebuffSnackbar({ statusChanges = [], healthChanges = [], sanityChanges = [], playersKilled = [] }: {
  statusChanges?: StatusChange[];
  healthChanges?: VitalChange[];
  sanityChanges?: VitalChange[];
  playersKilled?: PlayerRef[];
}) {
  const added = statusChanges.filter(c => c.action === 'added' && c.status);
  const cleared = statusChanges.filter(c => c.action === 'cleared');
  const hp = healthChanges.filter(c => c.delta !== 0);
  const san = sanityChanges.filter(c => c.delta !== 0);
  if (added.length === 0 && cleared.length === 0 && hp.length === 0 && san.length === 0 && playersKilled.length === 0) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-60 animate-fade-in-up pointer-events-none">
      <div className="mx-auto max-w-4xl px-3 pb-3">
        <div className="rounded-2xl border border-zinc-700/60 bg-zinc-950/90 px-4 py-3 shadow-2xl backdrop-blur-sm">
          <div className="flex flex-wrap gap-1.5">
            {added.map((c, i) => (
              <OutcomeChip key={`add-${c.id}-${c.status_id ?? i}`} color="border-amber-800/60 bg-amber-950/50 text-amber-200">
                <Sparkles size={11} /> {c.name}: {c.status!.label}
              </OutcomeChip>
            ))}
            {cleared.map(c => (
              <OutcomeChip key={`clr-${c.id}`} color="border-emerald-800/60 bg-emerald-950/50 text-emerald-300">
                <CheckCheck size={11} /> Снят: {c.name}
              </OutcomeChip>
            ))}
            {hp.length > 0 && (
              <OutcomeChip color="border-red-800/60 bg-red-950/50 text-red-300">
                <HeartPulse size={11} /> {hp.map(c => `${c.name} ${c.delta > 0 ? '+' : ''}${c.delta}`).join(', ')}
              </OutcomeChip>
            )}
            {san.length > 0 && (
              <OutcomeChip color="border-sky-800/60 bg-sky-950/50 text-sky-300">
                <Brain size={11} /> {san.map(c => `${c.name} ${c.delta > 0 ? '+' : ''}${c.delta}`).join(', ')}
              </OutcomeChip>
            )}
            {playersKilled.length > 0 && (
              <OutcomeChip color="border-red-800/70 bg-red-950/60 text-red-200">
                <Skull size={11} /> {playersKilled.map(p => p.name).join(', ')}
              </OutcomeChip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
