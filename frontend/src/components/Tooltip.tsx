'use client';
import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';

interface TooltipProps {
  text: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom';
  className?: string;
}

export default function Tooltip({ text, children, position = 'top', className }: TooltipProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);

  function show() {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setCoords({
      x: rect.left + rect.width / 2,
      y: position === 'top' ? rect.top - 6 : rect.bottom + 6,
    });
  }

  function hide() {
    setCoords(null);
  }

  const tooltip = coords
    ? ReactDOM.createPortal(
        <span
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            transform: position === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            zIndex: 99999,
            pointerEvents: 'none',
          }}
          className="whitespace-nowrap rounded bg-surface-elevated border border-surface-border px-2 py-1 text-[11px] text-ink-dim shadow-md"
        >
          {text}
        </span>,
        document.body,
      )
    : null;

  return (
    <div
      ref={wrapperRef}
      className={`inline-flex ${className ?? ''}`}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {tooltip}
    </div>
  );
}
