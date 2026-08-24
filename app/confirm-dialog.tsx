"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/* D452 - the app asked for confirmation two different ways.
 *
 * Destructive actions - deleting a keyword bank, removing a batch, clearing a
 * design - used the browser's own confirm(), while everything else in the same
 * product used a styled modal. So the moments that matter most, the ones that
 * throw work away, were the ones that looked least like Goldie. A raw confirm()
 * also blocks the whole page while it is open, which is why one of them froze a
 * session mid-test.
 *
 * This is the same modal the rest of the app already uses, behind a promise, so
 * a call site reads almost exactly as confirm() did:
 *
 *   if (!await confirmAction({ ... })) return;
 */

type ConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  eyebrow?: string;
  destructive?: boolean;
};

type Pending = ConfirmRequest & { resolve: (answer: boolean) => void };

let announce: ((pending: Pending | null) => void) | null = null;

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  // Without the host mounted there is nothing to ask with, and silently
  // proceeding with a destructive action would be the worst possible answer.
  if (!announce) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => announce?.({ ...request, resolve }));
}

export default function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    announce = setPending;
    return () => { announce = null };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { pending.resolve(false); setPending(null) }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending || typeof document === "undefined") return null;
  const settle = (answer: boolean) => { pending.resolve(answer); setPending(null) };

  return createPortal(
    <div className="publish-confirm-backdrop" role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) settle(false) }}>
      <section className="publish-confirm confirm-action-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-action-title">
        <button type="button" className="missing-photo-close" aria-label="Close" onClick={() => settle(false)}>×</button>
        <span className="publish-confirm-icon" aria-hidden="true">{pending.destructive ? "!" : "?"}</span>
        <p className="mini-label">{pending.eyebrow || (pending.destructive ? "THIS CANNOT BE UNDONE" : "PLEASE CONFIRM")}</p>
        <h2 id="confirm-action-title">{pending.title}</h2>
        {pending.body ? <p>{pending.body}</p> : null}
        <div className="confirm-action-actions">
          <button type="button" className="confirm-action-cancel" onClick={() => settle(false)} autoFocus>
            {pending.cancelLabel || "Cancel"}
          </button>
          <button type="button" className={pending.destructive ? "confirm-action-go destructive" : "confirm-action-go"} onClick={() => settle(true)}>
            {pending.confirmLabel || "Continue"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
