import { useState, useEffect } from 'react';
import { AlertTriangle, Building2, Ruler, Timer, Wheat, Package, ArrowRight, Map, ArrowLeft, Users } from 'lucide-react';
import type { BunkerInfo, Player } from '../../types/game';
import BunkerMap from './BunkerMap';
import { parseHighlightSegments, highlightVisibleLength, renderHighlightSegments } from '../event/eventUtils';

interface Props {
  bunker: BunkerInfo;
  players: Player[];
  bunkerCapacity: number | null;
  onContinue: () => void;
  onLeave: () => void;
}

// Typewriter over text that may carry highlight markers ("<<event-highlight>>").
// It counts/reveals visible characters (markers stripped) and renders the
// revealed prefix with accent-colored segments.
function useTypewriter(text: string, speedMs: number, active: boolean, skip: boolean) {
  const segments = parseHighlightSegments(text);
  const total = highlightVisibleLength(text);
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- empty text reveals instantly
    if (!text) { setDone(true); return; }

    if (skip) {
      setCount(total);
      setDone(true);
      return;
    }

    setCount(0);
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setCount(i);
      if (i >= total) { clearInterval(id); setDone(true); }
    }, speedMs);
    return () => clearInterval(id);
  }, [active, skip]);

  return { displayed: renderHighlightSegments(segments, count), done };
}

const S = { FLASH: 0, TITLE: 1, DISASTER: 2, BUNKER: 3, STATS: 4, MAP: 5, PLAYERS: 6, BUTTON: 7 };

export default function BunkerIntroScreen({ bunker, players, bunkerCapacity, onContinue, onLeave }: Props) {
  const [stage, setStage] = useState(S.FLASH);
  const [skipped, setSkipped] = useState(false);
  const [imageError, setImageError] = useState(false);
  const themeImage = bunker.theme.image;
  const bunkerCapacityDisplay = Math.max(1, bunkerCapacity ?? players.filter(player => player.is_active).length);
  const totalFood = bunker.food.amount * bunkerCapacityDisplay;
  const approxFoodMonths = Math.floor(totalFood / (bunkerCapacityDisplay * 90));

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intro animation state machine advances on typewriter completion
    if (title.done && stage === S.TITLE) setStage(bunker.disaster_info ? S.DISASTER : S.BUNKER);
  }, [title.done, stage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intro animation state machine advances on typewriter completion
    if (disaster.done && stage === S.DISASTER) setStage(bunker.bunker_info ? S.BUNKER : S.STATS);
  }, [disaster.done, stage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intro animation state machine advances on typewriter completion
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

  const cursor = <span className="inline-block w-0.5 h-4 intro-cursor ml-0.5 align-middle animate-pulse" />;
  const hasMap = (bunker.layout?.rooms?.length ?? 0) > 0;

  // Shelter description — placed in the map column when a map exists, otherwise
  // it stays in the single info column.
  const shelterCard = stage >= S.BUNKER ? (
    <div className="card p-4 animate-fade-in-up">
      <p className="flex items-center gap-2 text-zinc-400/70 text-xs uppercase tracking-widest mb-2.5">
        <Building2 size={11} /> Убежище
      </p>
      <p className="text-zinc-300 text-sm leading-relaxed">
        {desc.displayed}
        {stage === S.BUNKER && cursor}
      </p>
    </div>
  ) : null;

  return (
    <div
      className="h-screen overflow-hidden bg-zinc-950 flex flex-col"
      style={{
        backgroundImage: `
          radial-gradient(ellipse at 0% 0%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          radial-gradient(ellipse at 100% 100%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%)
        `,
      }}
    >
      <div
        className={`flex-1 min-h-0 overflow-y-auto flex justify-center p-4 sm:p-6 relative ${stage < S.BUTTON ? 'cursor-pointer' : ''}`}
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
          <div className="text-center space-y-5 select-none my-auto">
            <div className="text-7xl animate-emergency-flash">☢</div>
            <div className="text-2xl sm:text-3xl font-bold tracking-[0.3em] uppercase animate-emergency-flash">
              Экстренное уведомление
            </div>
          </div>
        )}

        {stage > S.FLASH && (
          <div className="max-w-6xl w-full space-y-5 my-auto">
            {/* Scenario title — shown standalone only when there is no
                "Ситуация снаружи" card to host it (see disaster header below). */}
            {!bunker.disaster_info && (
              <div className="text-center animate-fade-in-up">
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 leading-tight min-h-[2.5rem]">
                  {title.displayed}
                  {stage === S.TITLE && cursor}
                </h1>
              </div>
            )}

            {/* Two-column layout: situation + stats left, shelter + map right */}
            <div className={`grid gap-5 items-stretch ${hasMap ? 'grid-cols-1 lg:grid-cols-[3fr_2fr]' : 'grid-cols-1'}`}>
              {/* Left: situation outside + stats */}
              <div className="space-y-4">
                {bunker.disaster_info && stage >= S.TITLE && (
                  <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-4 animate-fade-in-up">
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2.5">
                      <span className="flex items-center gap-2 text-red-400/70 text-xs uppercase tracking-widest">
                        <AlertTriangle size={11} /> Ситуация снаружи
                      </span>
                      <span className="text-zinc-100 text-base font-semibold leading-tight">
                        {title.displayed}
                        {stage === S.TITLE && cursor}
                      </span>
                    </p>
                    {themeImage && !imageError && (
                      <img
                        src={themeImage}
                        alt={bunker.theme.label}
                        onError={() => setImageError(true)}
                        className="w-full max-h-[28vh] object-cover rounded-lg border border-red-900/40 shadow-lg mb-3"
                      />
                    )}
                    {stage >= S.DISASTER && (
                      <p className="text-zinc-300 text-sm leading-relaxed">
                        {disaster.displayed}
                        {stage === S.DISASTER && cursor}
                      </p>
                    )}
                  </div>
                )}

                {!hasMap && shelterCard}

                {stage >= S.STATS && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        { icon: <Ruler size={13} />, label: 'Размер',           value: renderHighlightSegments(parseHighlightSegments(bunker.size.label)), delay: '0ms'   },
                        { icon: <Timer size={13} />, label: 'Время проживания', value: bunker.duration.label, delay: '80ms'  },
                        { icon: <Users size={13} />, label: 'Вместимость',      value: `${bunkerCapacityDisplay} чел.`, delay: '160ms' },
                        { icon: <Wheat size={13} />, label: 'Еда',              value: `${bunker.food.label} (${bunker.food.amount} на человека, ~${approxFoodMonths} мес. на ${bunkerCapacityDisplay})`, delay: '240ms' },
                      ].map(({ icon, label, value, delay }) => (
                        <div
                          key={label}
                          className="card p-3 animate-fade-in-up"
                          style={{ animationDelay: delay }}
                        >
                          <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">{icon}{label}</p>
                          <p className="text-zinc-200 text-sm font-medium">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="card p-3 animate-fade-in-up" style={{ animationDelay: '320ms' }}>
                      <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">
                        <Package size={13} /> Инвентарь бункера
                      </p>
                      <p className="text-zinc-300 text-sm leading-relaxed">{bunker.items.map(item => item.label).join(', ')}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: shelter description + bunker map */}
              {hasMap && stage >= S.BUNKER && (
                <div className="flex flex-col gap-4">
                  {shelterCard}
                  {stage >= S.MAP && (
                    <div className="card p-3 animate-fade-in-up flex flex-1 min-h-0 flex-col">
                      <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-3 shrink-0">
                        <Map size={13} /> Карта бункера
                      </p>
                      <div className="flex-1 min-h-0 relative">
                        <BunkerMap layout={bunker.layout} svgClassName="absolute inset-0 w-full h-full" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Players list */}
            {stage >= S.PLAYERS && players.length > 0 && (
              <div className="card p-4 animate-fade-in-up">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {players.map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex min-w-0 items-center gap-2.5 border px-2.5 py-2 ${
                        p.is_active
                          ? 'border-zinc-700 bg-zinc-900/50'
                          : 'border-zinc-800 bg-zinc-950/40 opacity-50'
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-zinc-700 bg-zinc-800 text-xs font-bold uppercase text-zinc-300">
                        {p.name.trim().charAt(0) || '?'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{p.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-600">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action row: leave + continue */}
            {stage >= S.BUTTON && (
              <div className="flex items-center justify-center gap-3 pt-2 animate-fade-in-up">
                <button
                  onClick={e => { e.stopPropagation(); onLeave(); }}
                  className="flex items-center gap-2 border border-zinc-700 bg-zinc-900/60 px-5 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-500 hover:text-zinc-100 cursor-pointer"
                >
                  <ArrowLeft size={15} /> Выйти
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onContinue(); }}
                  className="btn-primary flex items-center gap-2 px-7 py-3 text-zinc-100 font-semibold text-sm cursor-pointer"
                >
                  <ArrowRight size={15} /> Продолжить
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
