import { Skull, HeartPulse, Brain, Briefcase, User } from 'lucide-react';
import type { Player } from '../../types/game';
import StatMeter from './StatMeter';

function attrDisplay(player: Player, key: 'gender' | 'profession') {
  return player.attributes[key]?.display ?? 'Не раскрыто';
}

export default function SurvivorCard({ player, isMe }: { player: Player; isMe: boolean }) {
  const vital = player.vital_status ?? { health: 100, sanity: 100, statuses: [] };
  const statuses = vital.statuses ?? [];
  const inDanger = vital.health <= 25 || vital.sanity <= 25;

  return (
    <article className={`relative overflow-hidden rounded-xl border px-3 py-3 shadow-lg ${
      isMe ? 'border-amber-500/55 bg-amber-950/10' : 'border-zinc-800/90 bg-zinc-950/75'
    }`}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 truncate text-sm font-bold uppercase tracking-wide text-zinc-100">
          {inDanger && <Skull size={13} className="shrink-0 text-red-400" />}
          {player.name}
        </h3>
        <p className="flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
          <Briefcase size={10} className="shrink-0" /> {attrDisplay(player, 'profession')}
        </p>
        <p className="flex items-center gap-1.5 truncate text-[11px] text-zinc-500">
          <User size={10} className="shrink-0" /> {attrDisplay(player, 'gender')}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatMeter icon={<HeartPulse size={12} className="text-red-400" />} label="Здоровье" value={vital.health} />
        <StatMeter icon={<Brain size={12} className="text-sky-400" />} label="Рассудок" value={vital.sanity} />
      </div>

      {statuses.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {statuses.map(status => (
            <span
              key={`${status.id}:${status.stat}`}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                status.type === 'buff'
                  ? 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300'
                  : 'border-red-800/50 bg-red-950/30 text-red-300'
              }`}
              title={`${status.delta > 0 ? '+' : ''}${status.delta} к ${status.stat === 'health' ? 'здоровью' : 'рассудку'} каждый месяц`}
            >
              {status.label} · {status.months} мес.
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
