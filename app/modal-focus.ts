/** Contain keyboard focus in an already-mounted modal and restore its opener. */
export function containModalFocus(label: string, restoreTarget?: HTMLElement | null) {
  const opener = restoreTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]')].find(node => node.getAttribute("aria-label") === label || node.getAttribute("aria-labelledby") === label);
  if (!dialog) return () => {};
  const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length);
  if (!dialog.contains(document.activeElement)) controls()[0]?.focus();
  const trap = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const items = controls(), first = items[0], last = items.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (!dialog.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault(); (event.shiftKey ? last : first)?.focus();
    }
  };
  window.addEventListener("keydown", trap);
  return () => { window.removeEventListener("keydown", trap); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
}
