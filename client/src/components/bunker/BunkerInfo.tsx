import { useState } from 'react';
import { ChevronDown, AlertTriangle, Building2, Ruler, Timer, Wheat, Package, Map } from 'lucide-react';
import type { BunkerInfo as BunkerInfoType } from '../../types/game';
import BunkerMap from './BunkerMap';
import { renderEventText } from '../event/eventUtils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover';

interface Props {
  bunker: BunkerInfoType;
}

export default function BunkerInfo({ bunker }: Props) {
  const [open, setOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const themeImage = bunker.theme.image;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative h-10 min-w-0 flex-1 rounded-xl border border-zinc-700 shadow-[0_10px_30px_rgba(0,0,0,0.18)] sm:flex-none">
      <PopoverTrigger asChild>
      <button
        type="button"
        className="group flex h-full w-full items-center justify-between rounded-xl px-3 text-left transition-colors hover:bg-zinc-800/40"
        aria-label="Описание бункера"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-amber-500/80 text-base shrink-0">☢</span>
          <span className="text-zinc-200 text-sm font-semibold truncate">{renderEventText(bunker.theme.label)}</span>
        </div>
        <ChevronDown
          size={14}
          className={`text-zinc-500 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      </PopoverTrigger>

      <PopoverContent className="card max-h-[calc(100dvh-9rem)] w-[calc(100vw-16px)] overflow-auto px-3 py-3 shadow-2xl sm:max-h-[70vh] sm:w-[min(900px,calc(100vw-24px))] sm:px-4 sm:py-4">
          {(() => {
            const hasMap = (bunker.layout?.rooms?.length ?? 0) > 0;
            return (
              <div className={`grid gap-4 items-stretch ${hasMap ? 'grid-cols-1 sm:grid-cols-[3fr_2fr]' : 'grid-cols-1'}`}>
                {/* Left: text content */}
                <div className="space-y-4">
                  {(bunker.disaster_info || (themeImage && !imageError)) && (
                    <div>
                      <p className="term-label mb-1.5">
                        <span className="text-zinc-500"><AlertTriangle size={11} /></span> Ситуация снаружи
                      </p>
                      {themeImage && !imageError && (
                        <img
                          src={themeImage}
                          alt={bunker.theme.label}
                          onError={() => setImageError(true)}
                          className="w-full max-h-56 object-cover rounded-lg border border-zinc-800 shadow-md mb-2.5"
                        />
                      )}
                      {bunker.disaster_info && (
                        <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{renderEventText(bunker.disaster_info)}</p>
                      )}
                    </div>
                  )}
                  {bunker.bunker_info && (
                    <Section icon={<Building2 size={11} />} title="Бункер" text={bunker.bunker_info} />
                  )}
                  <div className="space-y-3 pt-3 border-t border-zinc-800/60">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  </div>
                </div>

                {/* Right: map — same height as left column */}
                {hasMap && (
                  <div className="flex flex-col">
                    <p className="text-zinc-600 text-xs mb-2 flex items-center gap-1 shrink-0">
                      <Map size={11} className="text-zinc-600" /> Карта бункера
                    </p>
                    <div className="flex-1 min-h-0 relative">
                      <BunkerMap layout={bunker.layout} compact svgClassName="absolute inset-0 w-full h-full" />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
      </PopoverContent>
      </div>
    </Popover>
  );
}

function Section({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div>
      <p className="term-label mb-1.5">
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
