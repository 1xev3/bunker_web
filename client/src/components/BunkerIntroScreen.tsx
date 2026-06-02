import { useState, useEffect } from 'react';
import { AlertTriangle, Building2, Ruler, Timer, Wheat, Package, ChevronRight, Map, ArrowLeft, Users } from 'lucide-react';
import type { BunkerInfo, Player } from '../types/game';
import BunkerMap from './BunkerMap';

interface Props {
  bunker: BunkerInfo;
  players: Player[];
  onContinue: () => void;
  onLeave: () => void;
}

function useTypewriter(text: string, speedMs: number, active: boolean, skip: boolean) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (!text) { setDone(true); return; }

    if (skip) {
      setDisplayed(text);
      setDone(true);
      return;
    }

    setDisplayed('');
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setDone(true); }
    }, speedMs);
    return () => clearInterval(id);
  }, [active, skip]);

  return { displayed, done };
}

const S = { FLASH: 0, TITLE: 1, DISASTER: 2, BUNKER: 3, STATS: 4, MAP: 5, PLAYERS: 6, BUTTON: 7 };

export default function BunkerIntroScreen({ bunker, players, onContinue, onLeave }: Props) {
  const [stage, setStage] = useState(S.FLASH);
  const [skipped, setSkipped] = useState(false);

  const title    = useTypewriter(bunker.theme.label,   45, stage >= S.TITLE,    skipped);
  const disaster = useTypewriter(bunker.disaster_info,  14, stage >= S.DISASTER, skipped);
  const desc     = useTypewriter(bunker.bunker_info,    14, stage >= S.BUNKER,   skipped);

  const handleSkip = () => {
    if (stage >= S.BUTTON) return;
    setSkipped(true);
    setStage(S.BUTTON);
  };

  useEffect(() => {
    if (stage === S.FLASH) {
      const t = setTimeout(() => setStage(S.TITLE), 1100);
      return () => clearTimeout(t);
    }
  }, [stage]);

  useEffect(() => {
    if (title.done && stage === S.TITLE) setStage(bunker.disaster_info ? S.DISASTER : S.BUNKER);
  }, [title.done, stage]);

  useEffect(() => {
    if (disaster.done && stage === S.DISASTER) setStage(bunker.bunker_info ? S.BUNKER : S.STATS);
  }, [disaster.done, stage]);

  useEffect(() => {
    if (desc.done && stage === S.BUNKER) setStage(S.STATS);
  }, [desc.done, stage]);

  useEffect(() => {
    if (stage === S.STATS) {
      const t = setTimeout(() => setStage(S.MAP), 700);
      return () => clearTimeout(t);
    }
  }, [stage]);

  useEffect(() => {
    if (stage === S.MAP) {
      const t = setTimeout(() => setStage(S.PLAYERS), 600);
      return () => clearTimeout(t);
    }
  }, [stage]);

  useEffect(() => {
    if (stage === S.PLAYERS) {
      const t = setTimeout(() => setStage(S.BUTTON), 500);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const cursor = <span className="inline-block w-0.5 h-4 bg-amber-400 ml-0.5 align-middle animate-pulse" />;
  const hasMap = bunker.grid?.length > 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header
        className="border-b border-zinc-900/80 px-4 py-3 flex items-center justify-between shrink-0 bg-zinc-950/95 sticky top-0 z-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 text-amber-500/60 text-xs tracking-[0.25em] uppercase">
          <span className="radiation-icon text-base">☢</span>
          <span>Экстренное уведомление</span>
          <span className="radiation-icon text-base">☢</span>
        </div>
        <button
          onClick={onLeave}
          className="text-zinc-500 hover:text-zinc-100 text-sm transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-transparent hover:border-zinc-700"
        >
          <ArrowLeft size={14} /> Выйти
        </button>
      </header>

      <div
        className={`flex-1 flex items-center justify-center p-4 sm:p-6 relative ${stage < S.BUTTON ? 'cursor-pointer' : ''}`}
        onClick={handleSkip}
      >
        {/* Skip hint */}
        {stage < S.BUTTON && (
          <p className="absolute bottom-6 inset-x-0 text-center text-zinc-600 text-xs animate-pulse select-none pointer-events-none">
            нажмите, чтобы пропустить
          </p>
        )}

        {/* Flash intro */}
        {stage === S.FLASH && (
          <div className="text-center space-y-5 select-none">
            <div className="text-7xl animate-emergency-flash">☢</div>
            <div className="text-2xl sm:text-3xl font-bold tracking-[0.3em] uppercase animate-emergency-flash">
              Экстренное уведомление
            </div>
          </div>
        )}

        {stage > S.FLASH && (
          <div className="max-w-6xl w-full space-y-5">
            {/* Title */}
            <div className="text-center animate-fade-in-up">
              <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 leading-tight min-h-[2.5rem]">
                {title.displayed}
                {stage === S.TITLE && cursor}
              </h1>
            </div>

            {/* Two-column layout: info left, map right */}
            <div className={`grid gap-5 items-start ${stage >= S.MAP && hasMap ? 'grid-cols-1 lg:grid-cols-[3fr_2fr]' : 'grid-cols-1'}`}>
              {/* Left: text info */}
              <div className="space-y-4">
                {stage >= S.DISASTER && (
                  <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-4 animate-fade-in-up">
                    <p className="flex items-center gap-2 text-red-400/70 text-xs uppercase tracking-widest mb-2.5">
                      <AlertTriangle size={11} /> Ситуация снаружи
                    </p>
                    <p className="text-zinc-300 text-sm leading-relaxed">
                      {disaster.displayed}
                      {stage === S.DISASTER && cursor}
                    </p>
                  </div>
                )}

                {stage >= S.BUNKER && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 animate-fade-in-up">
                    <p className="flex items-center gap-2 text-zinc-400/70 text-xs uppercase tracking-widest mb-2.5">
                      <Building2 size={11} /> Убежище
                    </p>
                    <p className="text-zinc-300 text-sm leading-relaxed">
                      {desc.displayed}
                      {stage === S.BUNKER && cursor}
                    </p>
                  </div>
                )}

                {stage >= S.STATS && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { icon: <Ruler size={13} />, label: 'Размер',           value: bunker.size.label,     delay: '0ms'   },
                        { icon: <Timer size={13} />, label: 'Время проживания', value: bunker.duration.label, delay: '80ms'  },
                        { icon: <Wheat size={13} />, label: 'Еда',              value: bunker.food.label,     delay: '160ms' },
                      ].map(({ icon, label, value, delay }) => (
                        <div
                          key={label}
                          className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 animate-fade-in-up"
                          style={{ animationDelay: delay }}
                        >
                          <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">{icon}{label}</p>
                          <p className="text-zinc-200 text-sm font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 animate-fade-in-up" style={{ animationDelay: '240ms' }}>
                      <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">
                        <Package size={13} /> Инвентарь бункера
                      </p>
                      <p className="text-zinc-300 text-sm leading-relaxed">{bunker.items.map(item => item.label).join(', ')}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: map — square (width-driven), sticky */}
              {stage >= S.MAP && hasMap && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 animate-fade-in-up sticky top-[60px]">
                  <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-3">
                    <Map size={13} /> Карта бункера
                  </p>
                  <BunkerMap grid={bunker.grid} />
                </div>
              )}
            </div>

            {/* Players list */}
            {stage >= S.PLAYERS && players.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 animate-fade-in-up">
                <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-3">
                  <Users size={13} /> Участники ({players.length})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {players.map(p => (
                    <div key={p.id} className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.is_active ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                      <span className="text-zinc-300 text-sm truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Continue button */}
            {stage >= S.BUTTON && (
              <div className="flex justify-center pt-2 animate-fade-in-up">
                <button
                  onClick={e => { e.stopPropagation(); onContinue(); }}
                  className="btn-primary flex items-center gap-2 px-7 py-3 text-zinc-100 font-semibold rounded-xl text-sm cursor-pointer"
                >
                  Продолжить <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
