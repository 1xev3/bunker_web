import { Eye } from 'lucide-react';
import type { Player, ClientMessage, AttributeKey } from '../types/game';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../types/game';

interface Props {
  players: Player[];
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}

export default function StatusTable({ players, myPlayerId, send }: Props) {
  const myPlayer = players.find(p => p.id === myPlayerId);
  const hasAnyUnrevealed = myPlayer
    ? ATTRIBUTE_KEYS.some(k => !myPlayer.revealed_attributes[k])
    : false;

  return (
    <div className="rounded-xl border border-zinc-800 overflow-x-auto bg-zinc-900/20">
      <table className="w-full" style={{ tableLayout: 'fixed', minWidth: '1100px' }}>
        <colgroup>
          <col style={{ width: '30px' }} />
          <col style={{ width: '130px' }} />
          {ATTRIBUTE_KEYS.map(k => (
            <col key={k} style={{ width: '95px' }} />
          ))}
        </colgroup>

        <thead>
          <tr className="bg-zinc-900/80 border-b border-zinc-800">
            <th className="px-3 py-3 text-left text-zinc-600 font-medium text-xs">#</th>
            <th className="px-3 py-3 text-left text-zinc-400 font-semibold text-xs uppercase tracking-widest">Игрок</th>
            {ATTRIBUTE_KEYS.map(k => (
              <th key={k} className="px-3 py-3 text-left text-zinc-500 font-medium text-xs uppercase tracking-wide">
                {ATTRIBUTE_LABELS[k]}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {players.map((player, i) => {
            const isMe = player.id === myPlayerId;
            const eliminated = !player.is_active;

            return [
              <tr
                key={player.id}
                className={`border-b border-zinc-800/40 transition-colors ${
                  eliminated
                    ? 'opacity-35'
                    : isMe
                    ? 'bg-amber-950/15 border-l-2 border-l-amber-700/40'
                    : 'hover:bg-zinc-900/40'
                }`}
              >
                <td className="px-3 py-3 text-zinc-700 text-sm align-top font-mono">{i + 1}</td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-start gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                      eliminated ? 'bg-zinc-800 text-zinc-600' : isMe ? 'bg-amber-900/60 text-amber-300' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className={`font-semibold break-words leading-snug text-sm ${
                        eliminated ? 'line-through text-zinc-600' : isMe ? 'text-amber-300' : 'text-zinc-100'
                      }`}>
                        {player.name}
                      </span>
                      {eliminated && <div className="text-zinc-600 text-xs mt-0.5">выбыл</div>}
                    </div>
                  </div>
                </td>
                {ATTRIBUTE_KEYS.map(key => {
                  const val = player.attributes[key];
                  const revealed = player.revealed_attributes[key];

                  if (isMe && !eliminated && val) {
                    return (
                      <td key={key} className="px-3 py-3 align-top">
                        {revealed ? (
                          <span className="text-emerald-400 text-sm leading-relaxed break-words">{val}</span>
                        ) : (
                          <span
                            className="text-zinc-400 text-sm leading-relaxed break-words cursor-pointer hover:text-amber-300 transition-colors underline decoration-dotted underline-offset-2"
                            title="Нажми, чтобы открыть"
                            onClick={() => send({ type: 'reveal_attribute', attribute: key as AttributeKey })}
                          >
                            {val}
                          </span>
                        )}
                      </td>
                    );
                  }

                  return (
                    <td key={key} className="px-3 py-3 align-top">
                      {val
                        ? <span className="text-zinc-300 text-sm leading-relaxed break-words">{val}</span>
                        : <span className="text-zinc-700">—</span>
                      }
                    </td>
                  );
                })}
              </tr>,

              isMe && !eliminated && hasAnyUnrevealed && (
                <tr key={player.id + '_ctrl'} className="border-b border-zinc-800/30 bg-amber-950/10">
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5" colSpan={1}>
                    <span
                      className="text-xs text-zinc-600 hover:text-amber-400 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1"
                      onClick={() => send({ type: 'reveal_all' })}
                    >
                      <Eye size={11} className="text-zinc-600" /> открыть всё
                    </span>
                  </td>
                  {ATTRIBUTE_KEYS.map(key => <td key={key} className="px-3 py-1.5" />)}
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
