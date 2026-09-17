import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

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
    <Modal onClose={onClose} ariaLabel={title}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
            <p className="text-zinc-400 text-sm mt-1">{description}</p>
          </div>
          <Button
            variant="ghost"
            className="p-2"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={16} />
          </Button>
        </div>
        {children}
    </Modal>
  );
}
