import { useEffect } from 'react';

const TYPE_CLASSES = {
  info: 'border-l-accent-purple',
  success: 'border-l-accent-green',
  error: 'border-l-accent-red',
};

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose?.(toast.id);
    }, 3000);

    return () => clearTimeout(timer);
  }, [toast.id, onClose]);

  return (
    <div
      className={`animate-slideIn rounded-lg border border-border bg-bg-card p-4 shadow-xl ${
        TYPE_CLASSES[toast.type] || TYPE_CLASSES.info
      } border-l-4`}
    >
      <p className="text-sm text-text-primary">{toast.message}</p>
    </div>
  );
}
