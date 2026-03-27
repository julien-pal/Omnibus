'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, X, AlertCircle } from 'lucide-react';
import { useToastStore } from '@/store/useToastStore';

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || !toasts.length) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg pointer-events-auto text-sm font-medium
            transition-all duration-300 ease-out
            ${t.visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6'}
            ${t.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
        >
          {t.type === 'success' ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="ml-1 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
