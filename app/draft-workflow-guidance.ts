/** Navigation hints only. Workflow gates remain the authority for moving on. */
export type DraftTask = { label: string; task?: string; done: boolean; pending?: boolean; optional?: boolean; report?: boolean };
export type DraftTaskProduct = { index: number; name: string; reachable: boolean; rows: DraftTask[] };

export function unfinishedDraftTask(products: DraftTaskProduct[]) {
  for (const product of products) {
    if (!product.reachable) continue;
    const row = product.rows.find(row => row.task && !row.done && !row.pending && !row.optional && !row.report);
    if (row) return { index: product.index, name: product.name, task: row.task!, label: row.label };
  }
  return null;
}

export function draftTaskSummary(rows: DraftTask[]) {
  const tasks = rows.filter(row => row.task && !row.report && !row.optional);
  if (!tasks.length) return "Open product";
  if (tasks.some(row => row.pending)) return "Checking saved work…";
  const remaining = tasks.filter(row => !row.done).length;
  return remaining ? `${remaining} ${remaining === 1 ? "section" : "sections"} to finish` : "Ready to continue";
}

/** Keep one work surface visible: the seller's explicit choice wins, otherwise
 * open only the first real requirement. Fully ready products stay compact. */
export function focusedDraftTask(rows: DraftTask[], activeTask = "") {
  if (activeTask && rows.some(row => row.task === activeTask)) return activeTask;
  return rows.find(row => row.task && !row.done && !row.pending && !row.optional && !row.report)?.task || "";
}
