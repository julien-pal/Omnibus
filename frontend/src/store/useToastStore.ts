import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}

interface ToastStore {
  toasts: Toast[];
  show: (message: string, type?: 'success' | 'error') => void;
  dismiss: (id: number) => void;
  _hide: (id: number) => void;
}

let nextId = 0;
const ANIM_MS = 300;
const DURATION_MS = 3500;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (message, type = 'success') => {
    const id = ++nextId;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, visible: false }] }));
    // Next tick: flip visible to trigger enter animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, visible: true } : t)) }));
      });
    });
    setTimeout(() => get().dismiss(id), DURATION_MS);
  },
  _hide: (id) =>
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, visible: false } : t)) })),
  dismiss: (id) => {
    get()._hide(id);
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ANIM_MS);
  },
}));

export const toast = {
  success: (msg: string) => useToastStore.getState().show(msg, 'success'),
  error: (msg: string) => useToastStore.getState().show(msg, 'error'),
};
