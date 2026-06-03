import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Boxes, FileJson, FolderKanban, Package, ShieldAlert } from 'lucide-react';
import type { PackListing, PackStats, PackStatsSection } from '../types/game';

interface Props {
  packId: string;
  onBack: () => void;
  onOpenPack: (packId: string) => void;
}

export default function PackEditorPage({ packId, onBack, onOpenPack }: Props) {
  const [packs, setPacks] = useState<PackListing[]>([]);
  const [stats, setStats] = useState<PackStats | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/packs')
      .then((response) => response.json())
      .then((list: PackListing[]) => setPacks(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError('');

    fetch(`/api/packs/${encodeURIComponent(packId)}/stats`)
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error ?? 'Не удалось загрузить статистику пака');
        }
        return response.json();
      })
      .then((data: PackStats) => {
        if (isCancelled) return;
        setStats(data);
      })
      .catch((fetchError: Error) => {
        if (isCancelled) return;
        setStats(null);
        setError(fetchError.message);
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [packId]);

  useEffect(() => {
    const color = stats?.meta.color ?? '#f59e0b';
    document.documentElement.style.setProperty('--accent', color);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  }, [stats?.meta.color]);

  const groupedSections = useMemo(() => {
    return (stats?.sections ?? []).reduce<Record<string, PackStatsSection[]>>((acc, section) => {
      if (!acc[section.group]) acc[section.group] = [];
      acc[section.group].push(section);
      return acc;
    }, {});
  }, [stats?.sections]);

  return (
    <div
      className="min-h-screen px-4 py-6 sm:px-6 lg:px-10"
      style={{
        backgroundImage: `
          radial-gradient(circle at top left, rgba(var(--accent-rgb), 0.14), transparent 28%),
          radial-gradient(circle at bottom right, rgba(var(--accent-rgb), 0.10), transparent 34%),
          linear-gradient(180deg, rgba(9, 9, 11, 0.98), rgba(9, 9, 11, 0.94))
        `,
      }}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-72">
          <div className="card glow-card p-4">
            <button
              type="button"
              onClick={onBack}
              className="mb-4 flex w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
            >
              <ArrowLeft size={16} />
              Назад к игре
            </button>

            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Редактор паков</p>
              <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Статистика</h1>
              <p className="mt-1 text-sm text-zinc-500">Сейчас доступен только обзор содержимого пака.</p>
            </div>

            <div className="space-y-2">
              {packs.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => onOpenPack(pack.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    pack.id === packId
                      ? 'border-accent bg-zinc-800/80 text-zinc-100'
                      : 'border-zinc-800 bg-zinc-900/55 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: pack.meta.color }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{pack.meta.name}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {isLoading ? (
            <div className="card glow-card p-6 text-zinc-400">Загружаю статистику пака...</div>
          ) : error ? (
            <div className="card glow-card p-6">
              <div className="flex items-start gap-3 text-red-300">
                <ShieldAlert size={18} className="mt-0.5 shrink-0" />
                <div>
                  <h2 className="text-lg font-semibold text-zinc-100">Пак не удалось открыть</h2>
                  <p className="mt-1 text-sm text-red-300/90">{error}</p>
                </div>
              </div>
            </div>
          ) : stats ? (
            <div className="space-y-6">
              <section className="card glow-card overflow-hidden">
                <div className="border-b border-zinc-800 px-6 py-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="h-4 w-4 rounded-full" style={{ backgroundColor: stats.meta.color }} />
                        <h2 className="text-2xl font-semibold text-zinc-100">{stats.meta.name}</h2>
                      </div>
                      <p className="mt-2 text-sm text-zinc-500">
                        ID: <span className="text-zinc-300">{stats.id}</span>
                        {stats.meta.author ? ` • Автор: ${stats.meta.author}` : ''}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-right">
                      <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">Всего записей</div>
                      <div className="mt-1 text-3xl font-semibold text-zinc-100">{stats.summary.total_entries}</div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 px-6 py-5 sm:grid-cols-3">
                  <SummaryCard icon={<Boxes size={18} />} label="Секций статистики" value={stats.sections.length} />
                  <SummaryCard icon={<Package size={18} />} label="Файлов пака" value={stats.summary.config_files} />
                  <SummaryCard icon={<FileJson size={18} />} label="Групп секций" value={stats.summary.section_groups} />
                </div>
              </section>

              {Object.entries(groupedSections).map(([group, items]) => (
                <section key={group} className="card glow-card p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <FolderKanban size={17} className="text-accent" />
                    <h3 className="text-lg font-semibold text-zinc-100">{group}</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((section) => (
                      <div key={section.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/65 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{section.label}</div>
                        <div className="mt-2 text-3xl font-semibold text-zinc-100">{section.count}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <section className="card glow-card p-5 text-sm text-zinc-500">
                Следующим этапом сюда можно добавить скачивание ZIP и загрузку пака с валидацией разрешенных файлов и лимитом размера до 1 МБ.
              </section>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <span className="text-xs uppercase tracking-[0.18em]">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-zinc-100">{value}</div>
    </div>
  );
}
