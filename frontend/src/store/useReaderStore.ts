import { create } from 'zustand';
import { MergedBook } from '@/types';

export interface ReaderProgressEntry {
  cfi?: string;
  page?: number;
  percentage: number;
  completed?: boolean;
  updatedAt: number;
}

interface ReaderState {
  book: MergedBook | null;
  open: (book: MergedBook) => void;
  close: () => void;
}

export const useReaderStore = create<ReaderState>((set) => ({
  book: null,
  open: (book) => set({ book }),
  close: () => set({ book: null }),
}));
