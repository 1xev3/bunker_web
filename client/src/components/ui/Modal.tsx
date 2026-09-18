import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from './Dialog';

interface ModalProps {
  children: ReactNode;
  className?: string;
  onClose?: () => void;
  ariaLabel?: string;
}

export default function Modal({ children, className = '', onClose, ariaLabel }: ModalProps) {
  return (
    <Dialog open onOpenChange={open => !open && onClose?.()}>
      <DialogContent className={className}>
        {ariaLabel && <DialogTitle className="sr-only">{ariaLabel}</DialogTitle>}
        {children}
      </DialogContent>
    </Dialog>
  );
}
