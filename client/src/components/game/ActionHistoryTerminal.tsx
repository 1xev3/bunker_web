import { useEffect, useRef } from 'react';
import { History, Minus, Square, X } from 'lucide-react';
import type { ActionHistoryEntry } from '../../types/game';

interface Props {
  entries: ActionHistoryEntry[];
}

export default function ActionHistoryTerminal({ entries }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = 0;
  }, [entries]);

  const newestFirst = [...entries].reverse();

  return (
    <section className="action-terminal shrink-0 overflow-hidden" aria-label="История действий">
      <div className="action-terminal__titlebar">
        <span className="action-terminal__title"><History size={13} /> История действий</span>
        <span className="action-terminal__controls" aria-hidden="true">
          <span><Minus size={10} /></span>
          <span><Square size={8} /></span>
          <span><X size={10} /></span>
        </span>
      </div>
      <div ref={viewportRef} className="action-terminal__viewport" role="log" aria-live="polite">
        {entries.length === 0 ? (
          <p><span className="action-terminal__prompt">C:\&gt;</span> Ожидание действий<span className="action-terminal__cursor" /></p>
        ) : newestFirst.map(entry => (
          <p key={entry.id} className={`action-terminal__line action-terminal__line--${entry.kind}`}>
            <time dateTime={new Date(entry.timestamp).toISOString()}>
              [{new Date(entry.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
            </time>{' '}
            <span>{entry.message}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
