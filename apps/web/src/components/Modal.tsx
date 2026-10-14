import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="card m-auto max-h-[85dvh] w-[92%] max-w-md overflow-y-auto p-0 backdrop:bg-tinta/40"
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="border-b border-linha px-4 py-3">
        <h2 className="text-base font-semibold text-tinta">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
      {footer}
    </dialog>
  );
}