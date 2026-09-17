import { useEffect, useRef, useState } from 'react';
import { Copy, Link, Users, Crown, ArrowLeft, Rocket, Clock, Check, Package, ShieldCheck, Settings, RotateCcw, UserX, Loader2, Bot, Sparkles, Zap, Warehouse } from 'lucide-react';
import type { RoomState, ClientMessage } from '../../types/game';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import ToggleSwitch from '../ui/ToggleSwitch';

interface Props {
  roomState: RoomState;
  myPlayerId: string;
  send: (msg: ClientMessage) => void;
  onLeave: () => void;
}

const MAX_PLAYERS = 12;
const SETTINGS_STORAGE_KEY = 'bunker_host_settings';

// Deterministic accent hue per player so avatars feel distinct.
function avatarStyle(id: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 55% 22%))`,
    color: `hsl(${hue} 80% 85%)`,
  };
}

export default function GameLobby({ roomState, myPlayerId, send, onLeave }: Props) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [activeTab, setActiveTab] = useState<'lobby' | 'settings'>('lobby');
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const defaultsRef = useRef(roomState.settings);
  const restoredRef = useRef(false);
  useEffect(() => {
    fetch('/api/capabilities').then(response => response.json()).then(data => setAiAvailable(data.ai_events === true)).catch(() => setAiAvailable(false));
  }, []);
  const isAdmin = roomState.admin_id === myPlayerId;
  const players = roomState.players.filter(player => player.is_active);
  const playerCount = players.length;
  // Server fills the room up to the minimum with bots on start, so the admin
  // can always start regardless of how many humans have joined.
  const canStart = isAdmin && (!roomState.settings.ai_bunker_generation || Boolean(roomState.settings.bunker_theme.trim()));
  const isStarting = roomState.game_start_pending;
  const applySettings = (settings: RoomState['settings'], persist = true) => {
    if (!isAdmin) return;
    if (persist) localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    send({ type: 'update_room_settings', settings });
  };
  const updateSetting = <K extends keyof RoomState['settings'],>(key: K, value: RoomState['settings'][K]) => {
    applySettings({ ...roomState.settings, [key]: value });
  };

  useEffect(() => {
    if (!isAdmin || aiAvailable === null || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        const settings = { ...roomState.settings, ...saved };
        if (!aiAvailable) Object.assign(settings, { ai_enabled: false, ai_event_consequences: false, ai_bunker_generation: false, bunker_theme: '' });
        applySettings(settings, false);
      }
    } catch {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    }
  // Restore once for the room author; subsequent room state updates come from the server.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, aiAvailable]);

  const resetSettings = () => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    applySettings({ ...defaultsRef.current, ...(!aiAvailable && { ai_enabled: false, ai_event_consequences: false, ai_bunker_generation: false, bunker_theme: '' }) }, false);
  };

  const copy = (kind: 'code' | 'link') => {
    const text = kind === 'code' ? roomState.room_code : window.location.href;
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else {
      fallback();
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col relative isolate overflow-hidden">
      <div
        className="absolute inset-0 scale-105 blur-sm pointer-events-none"
        style={{
          backgroundImage: `
          radial-gradient(ellipse at 0% 0%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          radial-gradient(ellipse at 100% 100%, rgba(var(--accent-rgb), 0.13) 0%, transparent 45%),
          linear-gradient(rgba(9, 9, 11, 0.75), rgba(9, 9, 11, 0.85)),
          radial-gradient(ellipse at 50% 0%, rgba(var(--accent-rgb),0.16) 0%, transparent 50%),
          url('/images/nuclear-apocalypse-poster.png')
        `,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <header className="topbar relative z-10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 text-sm">☢</span>
          <span className="text-zinc-300 font-semibold text-sm">Бункер</span>
        </div>
        <Button
          variant="ghost"
          onClick={onLeave}
          className="px-3 py-1.5"
        >
          <ArrowLeft size={14} /> Выйти
        </Button>
      </header>

      <div className="relative z-10 flex-1 flex justify-center p-4 pb-10 pt-8 md:pt-14">
        <div className="w-full max-w-5xl animate-fade-in-up">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="term-label mb-2">Комната {roomState.room_code}</p>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Подготовка к выживанию</h1>
              <p className="mt-1 text-sm text-zinc-500">Пригласите игроков, настройте сценарий и начинайте.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="ready-dot h-2 w-2 rounded-full" />
              {playerCount} {playerCount === 1 ? 'игрок' : playerCount < 5 ? 'игрока' : 'игроков'} в комнате
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 rounded-xl border border-zinc-800 bg-zinc-950/75 p-1 shadow-lg shadow-black/20">
            {(['lobby', 'settings'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'}`}>
                {tab === 'lobby' ? <><Users size={14} className="mr-2 inline" />Лобби</> : <><Settings size={14} className="mr-2 inline" />Настройки</>}
              </button>
            ))}
          </div>

          {activeTab === 'lobby' ? <div className="grid md:grid-cols-5 gap-4">
            {/* Left: invite + meta */}
            <div className="md:col-span-2 space-y-4">
              <div className="card glow-card p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="term-label">
                    <Copy size={11} /> Код комнаты
                  </p>
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md border flex items-center gap-1"
                    style={{
                      color: roomState.pack_meta.color,
                      borderColor: `color-mix(in srgb, ${roomState.pack_meta.color} 45%, transparent)`,
                      background: `color-mix(in srgb, ${roomState.pack_meta.color} 14%, transparent)`,
                    }}
                  >
                    <Package size={10} /> {roomState.pack_meta.name}
                  </span>
                </div>
                <div className="text-center mb-5">
                  <span
                    className="text-5xl font-mono font-bold tracking-[0.25em] text-zinc-100 select-all"
                    style={{ textShadow: '0 0 30px rgba(var(--accent-rgb),0.45)' }}
                  >
                    {roomState.room_code}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copy('code')}
                    className={`flex-1 py-2 rounded-xl text-sm border transition-all flex items-center justify-center gap-1.5 ${
                      copied === 'code'
                        ? 'border-emerald-700/60 text-emerald-400 bg-emerald-950/30'
                        : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60'
                    }`}
                  >
                    {copied === 'code' ? <Check size={13} /> : <Copy size={13} />} {copied === 'code' ? 'Скопировано' : 'Код'}
                  </button>
                  <button
                    onClick={() => copy('link')}
                    className={`flex-1 py-2 rounded-xl text-sm border transition-all flex items-center justify-center gap-1.5 ${
                      copied === 'link'
                        ? 'border-emerald-700/60 text-emerald-400 bg-emerald-950/30'
                        : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-700/60'
                    }`}
                  >
                    {copied === 'link' ? <Check size={13} /> : <Link size={13} />} {copied === 'link' ? 'Скопировано' : 'Ссылка'}
                  </button>
                </div>
                <p className="text-zinc-600 text-xs text-center mt-4 leading-relaxed">
                  Поделитесь кодом или ссылкой с друзьями, чтобы&nbsp;они присоединились к&nbsp;игре.
                </p>
              </div>

              {/* Start / wait */}
              {isAdmin ? (
                <button
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                    canStart && !isStarting ? 'btn-primary text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
                  }`}
                  disabled={!canStart || isStarting}
                  onClick={event => { event.currentTarget.disabled = true; send({ type: 'start_game' }); }}
                >
                  {isStarting ? (
                    <><Loader2 size={15} className="animate-spin" /> {roomState.settings.ai_bunker_generation ? 'ИИ создаёт тему бункера…' : 'Игра запускается…'}</>
                  ) : canStart ? (
                    <><Rocket size={15} /> Начать игру</>
                  ) : (
                    <><Clock size={15} /> Укажите тему бункера</>
                  )}
                </button>
              ) : (
                <div className="card p-4 text-center">
                  <p className="text-zinc-400 text-sm flex items-center justify-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full ready-dot animate-pulse"></span>
                    Ожидаем, пока ведущий начнёт игру…
                  </p>
                </div>
              )}
            </div>

            {/* Right: players */}
            <div className="md:col-span-3 card p-5 flex flex-col">
              <p className="mb-4 flex items-center justify-between">
                <span className="term-label">
                  <Users size={11} /> Игроки в комнате
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  <span className="text-zinc-300">{playerCount}</span> / {MAX_PLAYERS}
                </span>
              </p>

              <div className="grid sm:grid-cols-2 gap-2 content-start flex-1">
                {players.map((p, i) => {
                  const isMe = p.id === myPlayerId;
                  const isRoomAdmin = p.id === roomState.admin_id;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        isMe ? 'player-row-me' : 'border-zinc-800/70 bg-zinc-900/40 hover:bg-zinc-800/40'
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 shadow-inner"
                        style={isMe ? undefined : avatarStyle(p.id)}
                      >
                        <span className={isMe ? 'player-avatar-me w-full h-full rounded-full flex items-center justify-center' : ''}>
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-sm font-medium truncate ${isMe ? 'player-name-me' : 'text-zinc-200'}`}>
                            {p.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {isRoomAdmin && (
                            <span className="admin-badge text-[10px] border px-1.5 py-0.5 rounded-md flex items-center gap-1">
                              <Crown size={9} /> ведущий
                            </span>
                          )}
                          {isMe && !isRoomAdmin && (
                            <span className="text-[10px] text-zinc-500 border border-zinc-700/50 px-1.5 py-0.5 rounded-md">вы</span>
                          )}
                          {!isRoomAdmin && !isMe && (
                            <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                              <ShieldCheck size={9} /> готов
                            </span>
                          )}
                        </div>
                      </div>
                      {isAdmin && !isMe ? (
                        <button title={`Исключить ${p.name}`} aria-label={`Исключить ${p.name}`} onClick={() => send({ type: 'kick_player', player_id: p.id })} className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-red-950/50 hover:text-red-400">
                          <UserX size={15} />
                        </button>
                      ) : <span className="text-zinc-700 text-xs shrink-0 font-mono">#{i + 1}</span>}
                    </div>
                  );
                })}

                {/* Empty slot hint while waiting for enough players */}
                {playerCount < 4 && (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-zinc-800 text-zinc-600">
                    <div className="w-9 h-9 rounded-full border border-dashed border-zinc-700 flex items-center justify-center shrink-0">
                      <Users size={14} className="text-zinc-700" />
                    </div>
                    <span className="text-sm">Ждём игроков…</span>
                  </div>
                )}
              </div>
            </div>
          </div> : (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card p-5 md:p-6">
                <div className="mb-5 flex items-start gap-3">
                  <span className="ability-card-icon"><Users size={17} /></span>
                  <div><h2 className="font-semibold text-zinc-100">Состав игры</h2><p className="mt-1 text-xs text-zinc-500">Кто играет и сколько мест в бункере.</p></div>
                </div>
                <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-zinc-800/80 py-4 text-sm text-zinc-200">
                  <span><span className="flex items-center gap-2 font-medium"><Bot size={15} className="text-zinc-500" />Заполнить ботами</span><span className="mt-1 block text-xs leading-relaxed text-zinc-500">Свободные места займут компьютерные игроки.</span></span>
                  <ToggleSwitch ariaLabel="Заполнить ботами" checked={roomState.settings.fill_with_bots} disabled={!isAdmin} onChange={checked => updateSetting('fill_with_bots', checked)} />
                </label>
                <label className="flex items-center justify-between gap-4 py-4 text-sm text-zinc-200">
                  <span><span className="flex items-center gap-2 font-medium"><Warehouse size={15} className="text-zinc-500" />Вместимость</span><span className="mt-1 block text-xs text-zinc-500">Число выживших, которое примет бункер.</span></span>
                  <span className="flex gap-2">
                    <Select aria-label="Режим вместимости" value={roomState.settings.capacity_mode} disabled={!isAdmin} onChange={event => updateSetting('capacity_mode', event.target.value as 'auto' | 'manual')}><option value="auto">Авто</option><option value="manual">Вручную</option></Select>
                    {roomState.settings.capacity_mode === 'manual' && <Input aria-label="Количество мест" className="w-16" type="number" min="1" max="12" value={roomState.settings.manual_capacity} disabled={!isAdmin} onChange={event => updateSetting('manual_capacity', Number(event.target.value))} />}
                  </span>
                </label>
              </section>

              <section className="card p-5 md:p-6">
                <div className="mb-5 flex items-start gap-3">
                  <span className="ability-card-icon"><Zap size={17} /></span>
                  <div><h2 className="font-semibold text-zinc-100">Динамика событий</h2><p className="mt-1 text-xs text-zinc-500">Как часто история будет вмешиваться в игру.</p></div>
                </div>
                <label className="block py-4 text-sm text-zinc-200">
                  <span className="flex items-center justify-between"><span className="font-medium">Частота событий</span><strong className="text-accent font-mono text-sm">{Math.round(roomState.settings.event_frequency * 100)}%</strong></span>
                  <Input aria-label="Частота событий" className="mt-4 w-full p-0" type="range" min="0" max="1" step="0.05" value={roomState.settings.event_frequency} disabled={!isAdmin} onChange={event => updateSetting('event_frequency', Number(event.target.value))} />
                  <span className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-zinc-600"><span>Спокойно</span><span>Хаос</span></span>
                </label>
              </section>

              {aiAvailable && <section className="card p-5 md:col-span-2 md:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3"><span className="ability-card-icon"><Sparkles size={17} /></span><div><h2 className="font-semibold text-zinc-100">ИИ-сценарист</h2><p className="mt-1 text-xs text-zinc-500">Создаёт тему и связывает события в одну историю.</p></div></div>
                  <ToggleSwitch ariaLabel="ИИ-сценарист" checked={roomState.settings.ai_enabled} disabled={!isAdmin} onChange={checked => applySettings({ ...roomState.settings, ai_enabled: checked, ...(!checked && { ai_event_consequences: false, ai_bunker_generation: false }) })} />
                </div>
                {roomState.settings.ai_enabled && <div className="mt-5 grid gap-3 border-t border-zinc-800 pt-5 md:grid-cols-2">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300"><span>Последствия событий</span><ToggleSwitch ariaLabel="Последствия событий от ИИ" checked={roomState.settings.ai_event_consequences} disabled={!isAdmin} onChange={checked => updateSetting('ai_event_consequences', checked)} /></label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300"><span>Создать тему бункера</span><ToggleSwitch ariaLabel="Создать тему бункера с ИИ" checked={roomState.settings.ai_bunker_generation} disabled={!isAdmin} onChange={checked => updateSetting('ai_bunker_generation', checked)} /></label>
                  {roomState.settings.ai_bunker_generation && <label className="block text-sm text-zinc-400 md:col-span-2">Тема бункера<Input className="mt-2 w-full" maxLength={200} placeholder="Например: мир после восстания роботов" value={roomState.settings.bunker_theme} disabled={!isAdmin} onChange={event => updateSetting('bunker_theme', event.target.value)} /></label>}
                </div>}
              </section>}

              {isAdmin && <div className="flex justify-end lg:col-span-2"><Button variant="ghost" onClick={resetSettings}><RotateCcw size={14} /> Сбросить настройки</Button></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
