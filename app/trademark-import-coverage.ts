// The archive currently imported by this application ends on this day.
export const TRADEMARK_ARCHIVE_DAY = "2025-12-31";

export function trademarkImportRanges(today = new Date().toISOString().slice(0, 10)) {
  return [
    { product: "TRTDXFAP", from: "2026-01-01", to: today, priority: 1 },
    { product: "TRTYRAP", from: "2025-01-01", to: TRADEMARK_ARCHIVE_DAY, priority: 5 },
  ];
}

export function trademarkFileDay(file: { name: string; covers?: string }): string {
  const archive = /^apc\d{8}-(\d{4})(\d{2})(\d{2})-\d+\.zip$/i.exec(file.name);
  const daily = /^apc(\d{2})(\d{2})(\d{2})\.zip$/i.exec(file.name);
  const day = file.covers?.slice(0, 10) || (archive
    ? `${archive[1]}-${archive[2]}-${archive[3]}`
    : daily ? `20${daily[1]}-${daily[2]}-${daily[3]}` : "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)
      || !Number.isFinite(Date.parse(day))
      || new Date(day).toISOString().slice(0, 10) !== day) {
    throw new Error(`Missing or invalid coverage date for ${file.name}`);
  }
  return day;
}
