import { useState } from 'react';
import { ChevronDown, AlertTriangle, Building2, Ruler, Timer, Wheat, Package, Map } from 'lucide-react';
import type { BunkerInfo as BunkerInfoType } from '../types/game';
import BunkerMap from './BunkerMap';
import { renderEventText } from './event/eventUtils';

interface Props {
  bunker: BunkerInfoType;
}

export default function BunkerInfo({ bunker }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left group"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-amber-500/80 text-base shrink-0">☢</span>
          <span className="text-zinc-200 text-sm font-semibold truncate">{renderEventText(bunker.theme.label)}</span>
          <span className="text-zinc-700 text-xs shrink-0">·</span>
          <span className="text-zinc-500 text-xs shrink-0 hidden sm:block">{renderEventText(bunker.size.label)}</span>
          <span className="text-zinc-700 text-xs shrink-0 hidden sm:block">·</span>
          <span className="text-zinc-500 text-xs shrink-0 hidden sm:block">{bunker.duration.label}</span>
        </div>
        <ChevronDown
          size={14}
          className={`text-zinc-500 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4 animate-fade-in-up">
          {bunker.disaster_info && (
            <Section icon={<AlertTriangle size={11} />} title="Ситуация снаружи" text={bunker.disaster_info} />
          )}
          {bunker.bunker_info && (
            <Section icon={<Building2 size={11} />} title="Бункер" text={bunker.bunker_info} />
          )}
          <div className="space-y-3 pt-3 border-t border-zinc-800/60">
            <div className="grid grid-cols-3 gap-3">
              <Stat icon={<Ruler size={11} />} label="Размер"           value={renderEventText(bunker.size.label)} />
              <Stat icon={<Timer size={11} />} label="Время проживания" value={bunker.duration.label} />
              <Stat icon={<Wheat size={11} />} label="Еда"              value={`${bunker.food.label} (${bunker.food.amount} на человека)`} />
            </div>
            <div>
              <p className="text-zinc-600 text-xs mb-1 flex items-center gap-1">
                <Package size={11} className="text-zinc-600" /> Инвентарь бункера
              </p>
              <p className="text-zinc-300 text-xs leading-relaxed">{bunker.items.map(item => item.label).join(', ')}</p>
            </div>
            {bunker.grid?.length > 0 && (
              <div>
                <p className="text-zinc-600 text-xs mb-2 flex items-center gap-1">
                  <Map size={11} className="text-zinc-600" /> Карта бункера
                </p>
                <div className="max-w-105">
                  <BunkerMap grid={bunker.grid} compact />
                </div>
              </div>
            )}
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
      <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{renderEventText(text)}</p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-zinc-600 text-xs mb-0.5 flex items-center gap-1">
        <span className="text-zinc-600">{icon}</span> {label}
      </p>
      <p className="text-zinc-200 text-sm font-medium">{value}</p>
    </div>
  );
}
