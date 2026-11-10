import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

// Stack of open modals so Escape only closes the top-most one.
const stack = [];

export function anyModalOpen() {
  return stack.length > 0;
}

export default function Modal({ title, onClose, children, footer, width = 520, className = '' }) {
  const id = useId();
  const boxRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    stack.push(id);
    const prevFocus = document.activeElement;
    const onKey = (e) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current?.();
      }
      if (e.key === 'Tab' && boxRef.current) {
        // Keep keyboard focus inside the dialog.
        const f = boxRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = Array.from(f).filter((el) => !el.disabled && el.offsetParent !== null);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    // Focus the first field unless a child already took focus with autoFocus.
    requestAnimationFrame(() => {
      if (boxRef.current && !boxRef.current.contains(document.activeElement)) {
        const el = boxRef.current.querySelector('[data-autofocus], input:not([disabled]), select, textarea, button.primary');
        el?.focus();
      }
    });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
  }, [id]);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`modal ${className}`} style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title} ref={boxRef}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
