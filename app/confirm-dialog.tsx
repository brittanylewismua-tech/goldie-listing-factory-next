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

/* ===========================================================================
 * D1594 · A MODULE-LEVEL SINGLETON IS NOT A SINGLETON.
 *
 * `announce` was a module variable: `ConfirmHost` set it on mount and
 * `confirmAction` read it. That works only while every caller and the host
 * share ONE instance of this module, and nothing guarantees that. Measured on
 * the deployed build: the identical call showed a dialog on Batch History and
 * silently returned false inside the Listing Factory workflow, reproducibly,
 * with no console error and one shared chunk on disk.
 *
 * The failure mode was the worst available. `confirmAction` answered "the
 * person said no", so every guarded control became a button that does nothing:
 * "Reload saved batch here" was the ONLY way out of a paused batch, and it did
 * nothing at all. A member in that state was stuck with no way forward and no
 * message explaining why.
 *
 * So the coupling is gone rather than patched. A request is a DOM event on
 * `window` — one object per page, shared by every module instance, every
 * chunk and every React root by construction. Whoever is mounted answers.
 *
 * AND IT FAILS CLOSED, LOUDLY. If nothing answers, the action still does not
 * run — but the person is told, instead of watching a button do nothing.
 * ======================================================================== */
export const CONFIRM_REQUEST_EVENT = "goldie:confirm-request";

type ConfirmEventDetail = ConfirmRequest & {
  resolve: (answer: boolean) => void;
  /* Set by a mounted host. If it is still false after dispatch, nothing was
     listening and the caller must not proceed. */
  handled: boolean;
};

/** Shown when the confirmation UI is unreachable. Never silently cancelled. */
export function confirmationUnavailableMessage(title: string) {
  return `"${title}" needs a confirmation step, and it could not be opened. `
    + "Nothing was changed. Reload the page and try again.";
}

let reportUnavailable: ((message: string) => void) | null = null;

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const once = (answer: boolean) => { if (!settled) { settled = true; resolve(answer) } };
    const detail: ConfirmEventDetail = { ...request, resolve: once, handled: false };
    window.dispatchEvent(new CustomEvent(CONFIRM_REQUEST_EVENT, { detail }));
    if (!detail.handled) {
      /* Nothing is mounted to ask with. The action does not run, and the
         person is told why rather than left pressing a dead control. */
      const message = confirmationUnavailableMessage(request.title);
      if (reportUnavailable) reportUnavailable(message);
      else if (typeof alert === "function") alert(message);
      once(false);
    }
  });
}

export default function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  const [unavailable, setUnavailable] = useState("");

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<Pending & { handled: boolean }>).detail;
      if (!detail || detail.handled) return;
      /* Claimed synchronously, inside the dispatch, so the caller knows before
         it returns that somebody will answer. */
      detail.handled = true;
      setPending(detail);
    };
    window.addEventListener(CONFIRM_REQUEST_EVENT, onRequest);
    reportUnavailable = setUnavailable;
    /* Only surrender the reporter if it is still ours: two hosts mounting and
       one unmounting must not leave the survivor unable to report. */
    return () => {
      window.removeEventListener(CONFIRM_REQUEST_EVENT, onRequest);
      if (reportUnavailable === setUnavailable) reportUnavailable = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { pending.resolve(false); setPending(null) }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (typeof document === "undefined") return null;

  /* The fail-closed notice. It exists so a confirmation that cannot be shown
     is visible rather than silent; nothing has been changed when it appears. */
  if (!pending && unavailable)
    return createPortal(
      <div className="publish-confirm-backdrop" role="presentation"
        onMouseDown={(event) => { if (event.target === event.currentTarget) setUnavailable("") }}>
        <section className="publish-confirm confirm-action-modal" role="alertdialog" aria-modal="true">
          <span className="publish-confirm-icon" aria-hidden="true">!</span>
          <p className="mini-label">NOTHING WAS CHANGED</p>
          <h2>This needs a confirmation step</h2>
          <p>{unavailable}</p>
          <div className="confirm-action-actions">
            <button type="button" className="confirm-action-go" onClick={() => setUnavailable("")}>
              Close
            </button>
          </div>
        </section>
      </div>,
      document.body,
    );

  if (!pending) return null;
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
