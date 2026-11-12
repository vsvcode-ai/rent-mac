'use client';
import { useEffect } from 'react';

export function Modal({
  open,
  onClose,
  children,
  center,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  center?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <div
      className={`modal-bg${open ? ' on' : ''}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        style={center ? { textAlign: 'center' } : undefined}
      >
        <button className="x" onClick={onClose} aria-label="关闭">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
