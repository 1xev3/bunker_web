import { DoorOpen } from 'lucide-react';
import type { BunkerLayout } from '../types/game';

interface Props {
  layout: BunkerLayout | undefined | null;
  compact?: boolean;
  svgClassName?: string;
}

// User-space units (the SVG viewBox scales to fit the container).
const CELL = 100;          // node spacing
const ROOM = 74;           // room square size
const OFFSET = (CELL - ROOM) / 2;
const CORRIDOR = 26;       // corridor thickness
const OVERLAP = 0;         // corridors meet rooms flush, never tucking under them

const roomX = (gx: number) => gx * CELL + OFFSET;
const roomY = (gy: number) => gy * CELL + OFFSET;

export default function BunkerMap({ layout, compact = false, svgClassName }: Props) {
  if (!layout || layout.rooms.length === 0) {
    return <p className="text-sm text-zinc-600">Карта недоступна</p>;
  }

  const { cols, rows, rooms, corridors } = layout;
  const W = cols * CELL;
  const H = rows * CELL;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={svgClassName ?? "w-full h-auto"}
      style={svgClassName ? undefined : { aspectRatio: `${W} / ${H}` }}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Карта бункера"
    >
      {/* Corridors first, so rooms sit on top of the joints. */}
      {corridors.map((c, i) => {
        const horizontal = c.ay === c.by;
        let x: number, y: number, w: number, h: number;
        if (horizontal) {
          const left = Math.min(c.ax, c.bx);
          x = left * CELL + OFFSET + ROOM - OVERLAP;
          w = CELL - ROOM + OVERLAP * 2;
          y = c.ay * CELL + (CELL - CORRIDOR) / 2;
          h = CORRIDOR;
        } else {
          const top = Math.min(c.ay, c.by);
          y = top * CELL + OFFSET + ROOM - OVERLAP;
          h = CELL - ROOM + OVERLAP * 2;
          x = c.ax * CELL + (CELL - CORRIDOR) / 2;
          w = CORRIDOR;
        }
        return <rect key={`c${i}`} className="bm-corridor" x={x} y={y} width={w} height={h} rx={3} />;
      })}

      {/* Rooms. */}
      {rooms.map((room) => {
        const x = roomX(room.x);
        const y = roomY(room.y);
        const label = room.isEntrance
          ? 'Вход'
          : room.items.length
            ? room.items.map((it) => it.label).join(', ')
            : 'Комната';

        return (
          <g key={room.id}>
            <rect
              className={room.isEntrance ? 'bm-entrance' : 'bm-room'}
              x={x}
              y={y}
              width={ROOM}
              height={ROOM}
              rx={6}
            >
              <title>{label}</title>
            </rect>
            <foreignObject x={x} y={y} width={ROOM} height={ROOM} pointerEvents="none">
              <div
                {...{ xmlns: 'http://www.w3.org/1999/xhtml' }}
                className="w-full h-full flex flex-col items-center justify-center text-center px-1 leading-tight overflow-hidden"
                style={{ fontSize: compact ? 9 : 11 }}
              >
                {room.isEntrance ? (
                  <>
                    <DoorOpen size={compact ? 14 : 18} className="mb-0.5 shrink-0 bm-door" />
                    <span className="bm-door-text font-medium">Вход</span>
                  </>
                ) : (
                  <span
                    className="text-zinc-300 break-words"
                    style={{
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 3,
                      overflow: 'hidden',
                    }}
                  >
                    {label}
                  </span>
                )}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
