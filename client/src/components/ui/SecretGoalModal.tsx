import { Target, Eye, X } from 'lucide-react';

interface Props {
  goal: string;
  onClose: () => void;
}

// One-time reveal of a player's private role-play goal, shown after the bunker
// intro. Purely cosmetic — the goal never affects game outcome.
export default function SecretGoalModal({ goal, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-600 hover:text-zinc-300 transition-colors"
          aria-label="Закрыть"
        >
          <X size={18} />
        </button>

        <div className="text-center mb-5">
          <Target size={36} className="mx-auto mb-3" style={{ color: 'var(--accent)' }} />
          <h2 className="font-bold text-xl mb-2 text-zinc-100">Твоя тайная цель</h2>
          <p className="flex items-center justify-center gap-1.5 text-zinc-500 text-xs">
            <Eye size={12} /> Видна только тебе — не показывай остальным
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 mb-5">
          <p className="text-zinc-100 text-base leading-relaxed text-center">{goal}</p>
        </div>

        <p className="text-zinc-500 text-xs text-center leading-relaxed mb-5">
          Просто для разнообразия: попробуй выполнить её по ходу игры. На исход не влияет —
          в конце сам решишь, справился или нет.
        </p>

        <button
          className="btn-primary w-full py-3 rounded-xl font-semibold text-sm text-white"
          onClick={onClose}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
