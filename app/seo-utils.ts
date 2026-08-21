export function parseCsvRow(line: string) {
  const cells: string[] = [];
  let value = "", quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (character === '"') quoted = !quoted;
    else if ((character === "," || character === "\t") && !quoted) { cells.push(value.trim()); value = ""; }
    else value += character;
  }
  cells.push(value.trim());
  return cells;
}

const HEADER = /^(keyword|keywords|phrase|search term|tag|title)$/i;

export function phrasesFromErank(raw: string) {
  const rows = raw.split(/\r?\n/).map((line) => parseCsvRow(line)).filter((row) => row.some(Boolean));
  if (!rows.length) return [];
  const headerIndex = rows[0].findIndex((cell) => HEADER.test(cell.trim()));
  let values: string[];
  if (headerIndex >= 0) values = rows.slice(1).map((row) => row[headerIndex] || "");
  else if (rows.length > 1 && rows.filter((row) => row.length > 1 && row.slice(1).some((cell) => /^[$%\d,.]+$/.test(cell))).length >= Math.ceil(rows.length / 2)) values = rows.map((row) => row[0]);
  else values = rows.flat();
  return [...new Set(values.map((value) => value.trim()).filter((value) => value && !HEADER.test(value) && !/^[$%\d,.]+$/.test(value)))];
}

export function tagsFromTitle(title: string) {
  const phrases = title.split(/[,|]/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  // Etsy treats a tag as one phrase. Splitting a validated bank phrase creates
  // fragments the seller never researched, so long phrases stay title-only.
  return [...new Set(phrases.filter((phrase) => phrase.length > 1 && phrase.length <= 20))].slice(0, 13);
}

export function titlesFromCsv(raw: string) {
  const rows = raw.split(/\r?\n/).map((line) => parseCsvRow(line)).filter((row) => row.some(Boolean));
  if (!rows.length) return [];
  const titleIndex = rows[0].findIndex((cell) => /^title$/i.test(cell.trim()));
  return (titleIndex >= 0 ? rows.slice(1).map((row) => row[titleIndex]) : rows.map((row) => row[0]))
    .map((value) => value?.trim()).filter(Boolean) as string[];
}
