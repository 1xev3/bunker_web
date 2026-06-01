import { useState, useEffect } from 'react';
import { AlertTriangle, Building2, Ruler, Timer, Wheat, Package, ChevronRight, Map } from 'lucide-react';
import type { BunkerInfo } from '../types/game';
import BunkerMap from './BunkerMap';

interface Props {
  bunker: BunkerInfo;
  onContinue: () => void;
}

function useTypewriter(text: string, speedMs: number, active: boolean) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    if (!text) { setDone(true); return; }

    setDisplayed('');
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setDone(true); }
    }, speedMs);
    return () => clearInterval(id);
  }, [active]);

  return { displayed, done };
}

const S = { TITLE: 0, DISASTER: 1, BUNKER: 2, STATS: 3, MAP: 4, BUTTON: 5 };

export default function BunkerIntroScreen({ bunker, onContinue }: Props) {
  const [stage, setStage] = useState(S.TITLE);

  const title    = useTypewriter(bunker.theme,        45, stage >= S.TITLE);
  const disaster = useTypewriter(bunker.disaster_info, 14, stage >= S.DISASTER);
  const desc     = useTypewriter(bunker.bunker_info,   14, stage >= S.BUNKER);

  useEffect(() => {
    if (title.done    && stage === S.TITLE)    setStage(bunker.disaster_info ? S.DISASTER : S.BUNKER);
  }, [title.done, stage]);

  useEffect(() => {
    if (disaster.done && stage === S.DISASTER) setStage(bunker.bunker_info ? S.BUNKER : S.STATS);
  }, [disaster.done, stage]);

  useEffect(() => {
    if (desc.done     && stage === S.BUNKER)   setStage(S.STATS);
  }, [desc.done, stage]);

  useEffect(() => {
    if (stage === S.STATS) {
      const t = setTimeout(() => setStage(S.MAP), 700);
      return () => clearTimeout(t);
    }
  }, [stage]);

  useEffect(() => {
    if (stage === S.MAP) {
      const t = setTimeout(() => setStage(S.BUTTON), 600);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const cursor = <span className="inline-block w-0.5 h-4 bg-amber-400 ml-0.5 align-middle animate-pulse" />;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-2xl w-full space-y-5">

        {/* Badge */}
        <div className="flex items-center justify-center gap-2.5 text-amber-500/60 text-xs tracking-[0.25em] uppercase animate-fade-in-up">
          <span className="radiation-icon text-base">☢</span>
          <span>Экстренное уведомление</span>
          <span className="radiation-icon text-base">☢</span>
        </div>

        {/* Title */}
        <div className="text-center animate-fade-in-up">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-100 leading-tight min-h-[2.5rem]">
            {title.displayed}
            {stage === S.TITLE && cursor}
          </h1>
        </div>

        {/* Disaster info */}
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

        {/* Bunker description */}
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

        {/* Stats */}
        {stage >= S.STATS && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: <Ruler size={13} />, label: 'Размер',              value: bunker.size,     delay: '0ms'   },
                { icon: <Timer size={13} />, label: 'Время проживания',    value: bunker.duration, delay: '80ms'  },
                { icon: <Wheat size={13} />, label: 'Еда',                 value: bunker.food,     delay: '160ms' },
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
            <div
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 animate-fade-in-up"
              style={{ animationDelay: '240ms' }}
            >
              <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-1.5">
                <Package size={13} /> Инвентарь бункера
              </p>
              <p className="text-zinc-300 text-sm leading-relaxed">{bunker.items.join(', ')}</p>
            </div>
          </div>
        )}

        {/* Bunker map */}
        {stage >= S.MAP && bunker.grid?.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 animate-fade-in-up">
            <p className="flex items-center gap-1.5 text-zinc-500 text-xs mb-3">
              <Map size={13} /> Карта бункера
            </p>
            <BunkerMap grid={bunker.grid} />
          </div>
        )}

        {/* Continue button */}
        {stage >= S.BUTTON && (
          <div className="flex justify-center pt-2 animate-fade-in-up">
            <button
              onClick={onContinue}
              className="btn-primary flex items-center gap-2 px-7 py-3 text-zinc-100 font-semibold rounded-xl text-sm cursor-pointer"
            >
              Продолжить <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
