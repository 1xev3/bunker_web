import { LockKeyhole, Skull, UserRound } from 'lucide-react';
import type { AttributeKey, ClientMessage, Player } from '../../types/game';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../../types/game';
import { ATTRIBUTE_ICONS, AttrValue } from './StatusTable';

interface Props {
  players: Player[];
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}

export default function CharacterDossiers({ players, myPlayerId, send }: Props) {
  return (
    <div className="min-h-0 flex-1 overflow-auto pb-1">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {players.map((player, index) => {
          const isMe = player.id === myPlayerId;
          const inactive = !player.is_active;

          return (
            <article
              key={player.id}
              className={`card relative overflow-hidden border-zinc-800/80 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.2)] ${
                inactive ? 'grayscale' : ''
              } ${isMe ? 'dossier-card-me' : ''}`}
            >
              <div className="absolute right-3 top-2 font-mono text-4xl font-black text-zinc-800/60">
                {String(index + 1).padStart(2, '0')}
              </div>

              <header className="relative mb-3 flex items-start gap-3 border-b border-zinc-800/80 pb-2 pr-10">
                <div className={`grid size-10 shrink-0 place-items-center rounded-lg border border-zinc-700 bg-zinc-900 ${isMe ? 'status-name-me' : 'text-zinc-500'}`}>
                  {inactive ? <Skull size={20} /> : <UserRound size={20} />}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 ${inactive ? 'line-through' : ''}`}>
                    {player.name} {isMe && <span className="status-name-me">· Вы</span>}
                  </p>
                  <h2 className={`mt-1 break-words text-base font-semibold leading-tight ${inactive ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                    {player.full_name ?? <span className="inline-flex items-center gap-1 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600"><LockKeyhole size={10} /> Засекречено</span>}
                  </h2>
                </div>
              </header>

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-4">
                {[0, 1].map(column => <div key={column} className="flex min-w-0 flex-col gap-2">
                {ATTRIBUTE_KEYS.filter((_, index) => index % 2 === column).map(key => {
                  const value = player.attributes[key];
                  const revealed = player.revealed_attributes[key];
                  const Icon = ATTRIBUTE_ICONS[key];
                  const canReveal = isMe && value && !revealed;

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!canReveal}
                      onClick={() => canReveal && send({ type: 'reveal_attribute', attribute: key as AttributeKey })}
                      className={`group flex min-w-0 items-center gap-2 text-left ${canReveal ? 'cursor-pointer' : 'cursor-default'}`}
                      title={canReveal ? 'Нажми, чтобы открыть' : undefined}
                    >
                      <Icon size={17} className="shrink-0 text-zinc-600" />
                      <span className="min-w-0 flex-1">
                        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                          {ATTRIBUTE_LABELS[key]}
                        </span>
                        {value ? (
                          <span
                            className={`block w-full break-words text-left text-sm leading-snug transition-colors ${
                              revealed && isMe && !inactive ? 'text-emerald-400' : inactive ? 'text-zinc-500' : 'text-zinc-300'
                            } ${canReveal ? 'group-hover:text-[var(--accent)]' : ''}`}
                          >
                            <AttrValue attrKey={key} value={value} className="block" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                            <LockKeyhole size={10} /> Засекречено
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
                </div>)}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
