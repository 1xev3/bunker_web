import type { ReactNode } from 'react';

// A labelled health/sanity bar whose color steps with the value (green → red).
export default function StatMeter({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  const color = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : value >= 20 ? 'bg-orange-500' : 'bg-red-500';
  const text = value >= 70 ? 'text-emerald-300' : value >= 40 ? 'text-amber-300' : value >= 20 ? 'text-orange-300' : 'text-red-300';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 uppercase tracking-widest text-zinc-500">{icon}{label}</span>
        <span className={`font-mono font-bold ${text}`}>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
