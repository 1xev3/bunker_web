import React from 'react';
import { Eye, User, Globe, Dumbbell, Sparkles, Briefcase, Heart, Gamepad2, AlertTriangle, Package, Backpack, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AttributeValue, Player, ClientMessage, AttributeKey } from '../types/game';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../types/game';

const ATTRIBUTE_ICONS: Record<AttributeKey, LucideIcon> = {
  gender: User,
  race: Globe,
  body: Dumbbell,
  trait: Sparkles,
  profession: Briefcase,
  health: Heart,
  hobby: Gamepad2,
  phobia: AlertTriangle,
  inventory: Package,
  backpack: Backpack,
  additional: Plus,
};
import { getProfessionIcon } from '../config/professions';
import { getGenderIcons, getRaceIcon } from '../config/genders';

interface Props {
  players: Player[];
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
}

const INLINE_ICON_STYLE: React.CSSProperties = { display: 'inline', verticalAlign: '-3px', marginRight: '4px', opacity: 0.75 };

function AttrValue({ attrKey, value, className }: { attrKey: AttributeKey; value: AttributeValue; className: string }) {
  if (attrKey === 'profession') {
    const Icon = getProfessionIcon(value.value);
    return (
      <span className={className}>
        {Icon && <Icon size={15} style={INLINE_ICON_STYLE} />}
        {value.display}
      </span>
    );
  }

  if (attrKey === 'gender') {
    const { genderIcon: GIcon, affixIcon: AIcon } = getGenderIcons(value.value);
    return (
      <span className={className}>
        {GIcon && <GIcon size={15} style={INLINE_ICON_STYLE} />}
        {AIcon && <AIcon size={15} style={{ ...INLINE_ICON_STYLE, marginRight: '4px' }} />}
        {value.display}
      </span>
    );
  }

  if (attrKey === 'race') {
    const Icon = getRaceIcon(value.value);
    return (
      <span className={className}>
        {Icon && <Icon size={15} style={INLINE_ICON_STYLE} />}
        {value.display}
      </span>
    );
  }

  return <span className={className}>{value.display}</span>;
}

export default function StatusTable({ players, myPlayerId, send }: Props) {
  const myPlayer = players.find(p => p.id === myPlayerId);
  const activePlayers = players.filter(player => player.is_active);
  const hasAnyUnrevealed = myPlayer
    ? ATTRIBUTE_KEYS.some(k => !myPlayer.revealed_attributes[k])
    : false;

  return (
    <div className="card overflow-x-auto shadow-[0_10px_30px_rgba(0,0,0,0.16)]">
      <table className="w-full" style={{ tableLayout: 'fixed', minWidth: '1240px' }}>
        <colgroup>
          <col style={{ width: '30px' }} />
          <col style={{ width: '105px' }} />
          {ATTRIBUTE_KEYS.map(k => {
            const w: Partial<Record<AttributeKey, string>> = { race: '82px', trait: '82px', backpack: '130px' };
            return <col key={k} style={{ width: w[k] ?? '105px' }} />;
          })}
        </colgroup>

        <thead>
          <tr className="bg-zinc-900/80 border-b border-zinc-800">
            <th className="px-3 py-3 text-left text-zinc-600 font-medium text-sm">#</th>
            <th className="px-3 py-3 text-left text-zinc-400 font-semibold text-sm uppercase tracking-widest">Игрок</th>
            {ATTRIBUTE_KEYS.map(k => {
              const Icon = ATTRIBUTE_ICONS[k];
              return (
                <th key={k} className="px-3 py-3 text-left text-zinc-500 font-medium text-sm">
                  <span className="flex items-center gap-1">
                    <Icon size={12} className="shrink-0" />
                    {ATTRIBUTE_LABELS[k]}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {activePlayers.map((player, i) => {
            const isMe = player.id === myPlayerId;

            return [
              <tr
                key={player.id}
                className={`border-b border-zinc-800/40 transition-colors ${
                  isMe
                    ? 'status-row-me'
                    : 'hover:bg-zinc-900/40'
                }`}
              >
                <td className="px-3 py-3 text-zinc-700 text-sm align-top font-mono">{i + 1}</td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-start gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                      isMe ? 'status-avatar-me' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className={`font-semibold break-words leading-snug text-sm ${
                        isMe ? 'status-name-me' : 'text-zinc-100'
                      }`}>
                        {player.name}
                      </span>
                    </div>
                  </div>
                </td>
                {ATTRIBUTE_KEYS.map(key => {
                  const val = player.attributes[key];
                  const revealed = player.revealed_attributes[key];

                  if (isMe && val) {
                    return (
                      <td key={key} className="px-3 py-3 align-top">
                        {revealed ? (
                          <AttrValue attrKey={key} value={val} className="text-emerald-400 text-sm leading-relaxed break-words" />
                        ) : (
                          <span
                            className="text-zinc-400 text-sm leading-relaxed break-words cursor-pointer status-link transition-colors underline decoration-dotted underline-offset-2"
                            title="Нажми, чтобы открыть"
                            onClick={() => send({ type: 'reveal_attribute', attribute: key as AttributeKey })}
                          >
                            <AttrValue attrKey={key} value={val} className="" />
                          </span>
                        )}
                      </td>
                    );
                  }

                  return (
                    <td key={key} className="px-3 py-3 align-top">
                      {val
                        ? <AttrValue attrKey={key} value={val} className="text-zinc-300 text-sm leading-relaxed break-words" />
                        : <span className="text-zinc-700">—</span>
                      }
                    </td>
                  );
                })}
              </tr>,

              isMe && hasAnyUnrevealed && (
                <tr key={player.id + '_ctrl'} className="border-b border-zinc-800/30 status-ctrl-row">
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5" colSpan={1}>
                    <span
                      className="text-xs text-zinc-600 status-ctrl-btn transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1"
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
