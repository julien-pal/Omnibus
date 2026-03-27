'use client';
import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import { IndexerCategory } from '../types';
import { useT } from '@/i18n';

interface CategoryPickerModalProps {
  indexerName: string;
  available: IndexerCategory[];
  selected: number[];
  onConfirm: (ids: number[]) => void;
  onClose: () => void;
}

export default function CategoryPickerModal({
  indexerName,
  available,
  selected,
  onConfirm,
  onClose,
}: CategoryPickerModalProps) {
  const t = useT();
  const [checked, setChecked] = useState<Set<number>>(new Set(selected));
  const [filter, setFilter] = useState('');

  const visible = available.filter(
    (c) => c.name.toLowerCase().includes(filter.toLowerCase()) || String(c.id).includes(filter),
  );

  function childrenOf(parentId: number): IndexerCategory[] {
    return available.filter((c) => c.parentId === parentId);
  }

  function toggle(cat: IndexerCategory) {
    setChecked((prev) => {
      const next = new Set(prev);
      const children = childrenOf(cat.id);
      if (next.has(cat.id)) {
        next.delete(cat.id);
        children.forEach((c) => next.delete(c.id));
      } else {
        next.add(cat.id);
        children.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function selectAll() {
    setChecked(new Set(visible.map((c) => c.id)));
  }

  function clearAll() {
    setChecked((prev) => {
      const next = new Set(prev);
      visible.forEach((c) => next.delete(c.id));
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <h3 className="text-white font-semibold text-sm">{indexerName}</h3>
            <p className="text-gray-400 text-xs mt-0.5">
              {t('categories_selected').replace('{n}', String(checked.size))}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('categories_filter_placeholder')}
              className="input pl-8 py-1.5 text-sm"
              autoFocus
            />
          </div>
          <div className="flex gap-3 mt-2 text-xs">
            <button onClick={selectAll} className="text-blue-400 hover:text-blue-300">
              {t('categories_select_all')}
            </button>
            <button onClick={clearAll} className="text-gray-400 hover:text-gray-300">
              {t('categories_clear_all')}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-4 py-2">
          {visible.length === 0 && (
            <p className="text-gray-500 text-sm py-4 text-center">{t('categories_none_found')}</p>
          )}
          {visible.map((cat) => (
            <label
              key={cat.id}
              className={`flex items-center gap-3 py-1.5 cursor-pointer hover:bg-gray-700/40 rounded px-1 -mx-1 ${cat.parentId ? 'pl-6' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked.has(cat.id)}
                onChange={() => toggle(cat)}
                className="accent-blue-500 w-4 h-4 shrink-0"
              />
              <span
                className={`text-sm flex-1 ${cat.parentId ? 'text-gray-400' : 'text-gray-200'}`}
              >
                {cat.name}
              </span>
              <span className="text-xs text-gray-500 font-mono">{cat.id}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button onClick={onClose} className="btn-secondary text-sm">
            {t('categories_cancel')}
          </button>
          <button onClick={() => onConfirm([...checked])} className="btn-primary text-sm">
            {t('categories_confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
