import { X, Vote, Boxes, Dice5, Sparkles } from 'lucide-react';

interface Props {
  onClose: () => void;
}

// A side-by-side reference card explaining how the event phase works. Shown
// next to an event window when the player toggles the info button; its own
// open/closed state is persisted per-device by the host card.
export default function EventHelpPanel({ onClose }: Props) {
  return (
    <div className="flex h-full w-full flex-col rounded-2xl border border-zinc-700/40 bg-zinc-900 shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 p-5">
        <div className="flex items-start gap-3">
          <Sparkles size={22} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Как работают события</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              Пока вы живёте в бункере, случаются события. Совет выживших решает, как
              на них ответить — от этого зависит, кто доживёт до конца.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть помощь"
          className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 text-sm leading-relaxed text-zinc-400">
        <section className="flex gap-3">
          <Vote size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <h3 className="font-semibold text-zinc-200">Решение совета</h3>
            <p className="mt-1">
              У события есть несколько вариантов ответа. Каждый игрок голосует за
              один из них. Когда выскажутся все, побеждает вариант с большинством
              голосов — его и будет отыгрывать совет.
            </p>
          </div>
        </section>

        <section className="flex gap-3">
          <Dice5 size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <h3 className="font-semibold text-zinc-200">Шансы и последствия</h3>
            <p className="mt-1">
              Под каждым вариантом видно, что может произойти. Полоса и проценты
              показывают вероятности исходов:
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <span className="text-zinc-400"><span className="text-emerald-300">зелёный</span> — благоприятный исход</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                <span className="text-zinc-400"><span className="text-red-300">красный</span> — опасный исход</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-500" />
                <span className="text-zinc-400"><span className="text-zinc-300">серый</span> — нейтральный исход</span>
              </li>
            </ul>
            <p className="mt-2">
              Подпись «точно» означает гарантированный исход, а чипы рядом —
              что именно изменится (здоровье, рассудок, припасы и т.д.).
            </p>
          </div>
        </section>

        <section className="flex gap-3">
          <Boxes size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <h3 className="font-semibold text-zinc-200">Как выбирать</h3>
            <p className="mt-1">
              Некоторые варианты после голосования просят кого-то выбрать —
              человека, профессию или предметы со склада. Чем больше подходящих
              предметов и профессий вы задействуете, тем выше шанс на успех.
            </p>
            <p className="mt-2">
              Профессии помогают по-разному: чем выше уровень навыка, тем сильнее
              вклад. Если задействован хотя бы один ресурс каждого нужного вида,
              шанс может вырасти до 100%.
            </p>
            <p className="mt-2 text-zinc-500">
              Совет подтверждает решение кнопкой внизу — после этого исход
              разыгрывается, и его уже не отменить.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
