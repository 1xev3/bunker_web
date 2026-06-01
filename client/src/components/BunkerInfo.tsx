import { useState } from 'react';
import { ChevronDown, AlertTriangle, Building2, Ruler, Timer, Wheat, Package } from 'lucide-react';
import type { BunkerInfo as BunkerInfoType } from '../types/game';

interface Props {
  bunker: BunkerInfoType;
}

export default function BunkerInfo({ bunker }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/40">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left group"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-amber-500/80 text-base shrink-0">☢</span>
          <span className="text-zinc-200 text-sm font-semibold truncate">{bunker.theme}</span>
          <span className="text-zinc-700 text-xs shrink-0">·</span>
          <span className="text-zinc-500 text-xs shrink-0 hidden sm:block">{bunker.size}</span>
          <span className="text-zinc-700 text-xs shrink-0 hidden sm:block">·</span>
          <span className="text-zinc-500 text-xs shrink-0 hidden sm:block">{bunker.duration}</span>
        </div>
        <ChevronDown
          size={14}
          className={`text-zinc-500 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4 bg-zinc-900/30 animate-fade-in-up">
          {bunker.disaster_info && (
            <Section icon={<AlertTriangle size={11} />} title="Ситуация снаружи" text={bunker.disaster_info} />
          )}
          {bunker.bunker_info && (
            <Section icon={<Building2 size={11} />} title="Бункер" text={bunker.bunker_info} />
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/60">
            <Stat icon={<Ruler size={11} />} label="Размер" value={bunker.size} />
            <Stat icon={<Timer size={11} />} label="Срок" value={bunker.duration} />
            <Stat icon={<Wheat size={11} />} label="Еда" value={bunker.food} />
            <div>
              <p className="text-zinc-600 text-xs mb-1 flex items-center gap-1">
                <Package size={11} className="text-zinc-600" /> В бункере
              </p>
              <p className="text-zinc-300 text-xs leading-relaxed">{bunker.items.join(', ')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div>
      <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
        <span className="text-zinc-500">{icon}</span> {title}
      </p>
      <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-zinc-600 text-xs mb-0.5 flex items-center gap-1">
        <span className="text-zinc-600">{icon}</span> {label}
      </p>
      <p className="text-zinc-200 text-sm font-medium">{value}</p>
    </div>
  );
}
