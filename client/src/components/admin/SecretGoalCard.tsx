import { Target, Eye } from 'lucide-react';

// Persistent reminder of the player's private role-play goal, shown alongside
// the profession ability. Visible only to the player who owns the goal.
export default function SecretGoalCard({ goal }: { goal: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-start gap-3">
        <div className="ability-card-icon mt-0.5 shrink-0">
          <Target size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mb-1">Тайная цель</p>
          <p className="text-zinc-100 text-sm leading-relaxed">{goal}</p>
          <p className="flex items-center gap-1.5 text-zinc-600 text-[11px] mt-2">
            <Eye size={11} /> Видна только тебе
          </p>
        </div>
      </div>
    </div>
  );
}
