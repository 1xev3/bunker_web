import type { Player, ClientMessage, AttributeKey } from '../types/game';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../types/game';

interface Props {
  player: Player;
  send: (msg: ClientMessage) => void;
}

export default function CharacterCard({ player, send }: Props) {
  const unrevealed = ATTRIBUTE_KEYS.filter(k => !player.revealed_attributes[k]);
  const allRevealed = unrevealed.length === 0;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <h2 className="font-semibold text-gray-300 mb-3">Ваш персонаж</h2>

      {player.description && (
        <p className="text-gray-400 text-sm italic mb-3 pb-3 border-b border-gray-700">{player.description}</p>
      )}

      <div className="space-y-2 mb-4">
        {ATTRIBUTE_KEYS.map(key => {
          const revealed = player.revealed_attributes[key];
          const value = player.attributes[key];
          return (
            <div key={key} className="flex items-start gap-2">
              <span className="text-gray-500 text-sm w-24 shrink-0">{ATTRIBUTE_LABELS[key]}:</span>
              <span className="text-gray-200 text-sm flex-1">{value?.display ?? '?'}</span>
              {!revealed && (
                <button
                  className="text-xs text-blue-400 hover:text-blue-300 shrink-0 transition-colors"
                  onClick={() => send({ type: 'reveal_attribute', attribute: key as AttributeKey })}
                >
                  Открыть
                </button>
              )}
              {revealed && (
                <span className="text-xs text-green-500 shrink-0">✓</span>
              )}
            </div>
          );
        })}
      </div>

      {!allRevealed && (
        <button
          className="w-full bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-red-300 text-sm py-2 rounded-lg transition-colors"
          onClick={() => send({ type: 'reveal_all' })}
        >
          Открыть всё сразу
        </button>
      )}
    </div>
  );
}
