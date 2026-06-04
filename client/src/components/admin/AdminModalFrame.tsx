import type { ReactNode } from 'react';
import { X } from 'lucide-react';

// Shared chrome for every admin modal: centered card with a title/description
// header and a close button.
export default function AdminModalFrame({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-900 p-6 shadow-2xl animate-fade-in-up">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
            <p className="text-zinc-400 text-sm mt-1">{description}</p>
          </div>
          <button
            className="rounded-lg p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
