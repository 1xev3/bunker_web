import { Target, Eye } from 'lucide-react';
import Button from './Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './Dialog';

interface Props {
  goal: string;
  onClose: () => void;
}

// One-time reveal of a player's private role-play goal, shown after the bunker
// intro. Purely cosmetic — the goal never affects game outcome.
export default function SecretGoalModal({ goal, onClose }: Props) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader className="mb-5 text-center">
          <Target size={36} className="mx-auto mb-3" style={{ color: 'var(--accent)' }} />
          <DialogTitle className="text-xl">Твоя тайная цель</DialogTitle>
          <DialogDescription className="flex items-center justify-center gap-1.5 text-xs">
            <Eye size={12} /> Видна только тебе — не показывай остальным
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 mb-5">
          <p className="text-zinc-100 text-base leading-relaxed text-center">{goal}</p>
        </div>

        <p className="text-zinc-500 text-xs text-center leading-relaxed mb-5">
          Просто для разнообразия: попробуй выполнить её по ходу игры. На исход не влияет —
          в конце сам решишь, справился или нет.
        </p>

        <Button variant="primary" size="lg" className="w-full"
          onClick={onClose}
        >
          Понятно
        </Button>
      </DialogContent>
    </Dialog>
  );
}
