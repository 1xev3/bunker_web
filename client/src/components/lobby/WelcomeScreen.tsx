import { useState, useEffect } from 'react';
import { User, Hash, Plus, LogIn, Users, Clock, Gamepad2, Package } from 'lucide-react';
import type { ClientMessage, RoomListing, PackListing } from '../../types/game';

interface Props {
  onConnect: (msg: ClientMessage) => void;
  onOpenPackEditor: (packId: string) => void;
  serverError?: string;
}

export default function WelcomeScreen({ onConnect, onOpenPackEditor, serverError }: Props) {
  const [nickname, setNickname] = useState(() => localStorage.getItem('bunker_nickname') ?? '');
  const [roomCode, setRoomCode] = useState('');
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [packs, setPacks] = useState<PackListing[]>([]);
  const [selectedPack, setSelectedPack] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'create' | 'join'>('create');

  const selectedPackMeta = packs.find((p) => p.id === selectedPack)?.meta;

  useEffect(() => {
    if (selectedPackMeta?.color) {
      const hex = selectedPackMeta.color;
      document.documentElement.style.setProperty('--accent', hex);
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    }
  }, [selectedPackMeta?.color]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('room');
    if (codeFromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill the join form from the room code in the URL on mount
      setRoomCode(codeFromUrl.toUpperCase());
      setTab('join');
    }

    fetch('/api/packs').then(r => r.json()).then((list: PackListing[]) => {
      setPacks(list);
      if (list.length > 0) {
        const ids = list.map((p) => p.id);
        setSelectedPack(currentPack => (currentPack && ids.includes(currentPack) ? currentPack : list[0].id));
      }
    }).catch(() => {});

    const fetchRooms = () =>
      fetch('/api/rooms').then(r => r.json()).then(setRooms).catch(() => {});

    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  const validate = () => {
    if (nickname.trim().length < 2) {
      setError('Никнейм — минимум 2 символа');
      return false;
    }
    setError('');
    return true;
  };

  const handleCreate = () => {
    if (!validate()) return;
    if (!selectedPack) {
      setError('Нет доступных паков конфигурации');
      return;
    }
    onConnect({ type: 'join', nickname: nickname.trim(), pack: selectedPack });
  };

  const handleJoin = (code: string) => {
    if (!validate()) return;
    if (!code.trim()) { setError('Введи код комнаты'); return; }
    onConnect({ type: 'join', nickname: nickname.trim(), room_code: code.trim().toUpperCase() });
  };

  return (
    <div
      className="min-h-screen bg-zinc-950 flex items-center justify-center p-4"
      style={{
        backgroundImage: `
          radial-gradient(ellipse at 0% 0%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          radial-gradient(ellipse at 100% 100%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          linear-gradient(rgba(9, 9, 11, 0.70), rgba(9, 9, 11, 0.80)),
          radial-gradient(ellipse at 50% 0%, rgba(var(--accent-rgb),0.18) 0%, transparent 60%),
          url('/images/bunker-hero.png')
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="w-full max-w-sm space-y-5 animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="radiation-icon text-accent text-4xl mb-3 select-none">☢</div>
          <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">Бункер</h1>
          <p className="text-zinc-500 text-sm mt-1.5">Последний шанс выжить</p>
        </div>

        {/* Form */}
        <div className="card glow-card p-5 space-y-4">
          <div>
            <label className="block text-zinc-500 text-xs uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <User size={12} className="text-zinc-500" /> Никнейм
            </label>
            <input
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none transition-all accent-input"
              placeholder="Введи никнейм"
              value={nickname}
              onChange={e => { setNickname(e.target.value); localStorage.setItem('bunker_nickname', e.target.value); }}
              maxLength={20}
              onKeyDown={e => e.key === 'Enter' && (tab === 'create' ? handleCreate() : handleJoin(roomCode))}
            />
          </div>

          {/* Tabs */}
          <div className="flex bg-zinc-800/60 rounded-xl p-1 gap-1">
            <TabBtn active={tab === 'create'} onClick={() => setTab('create')} icon={<Plus size={13} />}>
              Создать
            </TabBtn>
            <TabBtn active={tab === 'join'} onClick={() => setTab('join')} icon={<Hash size={13} />}>
              По коду
            </TabBtn>
          </div>

          {tab === 'create' ? (
            <div className="space-y-2">
              <div>
                <label className="block text-zinc-500 text-xs uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Package size={12} className="text-zinc-500" /> Пак
                </label>
                <div className="space-y-1.5">
                  {packs.map(pack => (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => setSelectedPack(pack.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-sm transition-all text-left ${
                        selectedPack === pack.id
                          ? 'border-accent bg-zinc-800/80 text-zinc-100'
                          : 'border-zinc-700 bg-zinc-800/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                      }`}
                      style={selectedPack === pack.id ? { borderColor: `color-mix(in srgb, ${pack.meta.color} 50%, transparent)` } : {}}
                    >
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: pack.meta.color }}
                      />
                      <span className="font-medium">{pack.meta.name}</span>
                      {pack.meta.author && (
                        <span className="text-zinc-600 text-xs ml-auto">{pack.meta.author}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="btn-primary w-full text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                onClick={handleCreate}
              >
                <Plus size={15} /> Создать комнату
              </button>
              <button
                type="button"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900/60 px-3.5 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => selectedPack && onOpenPackEditor(selectedPack)}
                disabled={!selectedPack}
              >
                Редактировать выбранный пак
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none transition-all accent-input uppercase tracking-[0.2em] font-mono text-center"
                placeholder="ABCD12"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && handleJoin(roomCode)}
              />
              <button
                className="btn-primary w-full text-white font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2"
                onClick={() => handleJoin(roomCode)}
              >
                <LogIn size={15} /> Войти в комнату
              </button>
            </div>
          )}

          {(error || serverError) && (
            <p className="text-red-400 text-xs flex items-center gap-1.5">
              <span className="text-red-400">⚠</span> {error || serverError}
            </p>
          )}
        </div>

        {/* Room list */}
        {rooms.length > 0 && (
          <div className="space-y-2">
            <p className="text-zinc-600 text-xs uppercase tracking-widest px-1 flex items-center gap-2">
              <span className="inline-block w-4 h-px bg-zinc-800"></span>
              Активные комнаты
              <span className="inline-block flex-1 h-px bg-zinc-800"></span>
            </p>
            {rooms.map(room => (
              <button
                key={room.room_code}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/20 hover:bg-zinc-800/60 hover:border-zinc-600 px-4 py-3 flex items-center justify-between transition-all group"
                onClick={() => { setRoomCode(room.room_code); setTab('join'); }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-zinc-200 tracking-widest group-hover:text-accent transition-colors room-code-hover">{room.room_code}</span>
                  <span className="text-zinc-500 text-xs flex items-center gap-1">
                    <Users size={11} className="text-zinc-500" /> {room.player_count}
                  </span>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium flex items-center gap-1 ${
                  room.status === 'waiting'
                    ? 'badge-waiting'
                    : 'border-zinc-700 text-zinc-500 bg-zinc-900/50'
                }`}>
                  {room.status === 'waiting'
                    ? <><Clock size={10} /> ожидание</>
                    : <><Gamepad2 size={10} /> в игре</>
                  }
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
        active ? 'tab-active' : 'text-zinc-500 hover:text-zinc-300'
      }`}
      onClick={onClick}
    >
      {icon} {children}
    </button>
  );
}
