import type { ReactNode } from 'react';

interface ModalProps {
  children: ReactNode;
  className?: string;
  onClose?: () => void;
  ariaLabel?: string;
}

export default function Modal({ children, className = '', onClose, ariaLabel }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={ariaLabel} className={`w-full max-w-lg rounded-2xl border border-zinc-700/80 bg-zinc-900 p-5 shadow-2xl animate-fade-in-up ${className}`.trim()}>
        {children}
      </div>
    </div>
  );
}
