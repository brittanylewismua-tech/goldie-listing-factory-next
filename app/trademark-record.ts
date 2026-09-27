/**
 * READING ONE RECORD OF THE FEDERAL REGISTER.
 *
 * Split out from the database side on purpose: deciding whether a mark is
 * live, wordy and printed on something is the part that has to be right, and
 * it stays testable without Cloudflare, USPTO, or a database.
 */
import { allFields, field } from "./uspto-bulk.ts";

/**
 * The classes a print-on-demand seller prints into.
 *
 * 025 clothing, 016 paper and prints, 021 mugs and drinkware, 020 signs and
 * home, 024 textiles and blankets, 014 jewellery, 018 bags, 026 patches and
 * pins, 028 toys and ornaments. A mark registered only for software or
 * insurance is not a hazard to a sweatshirt, and keeping it would only add
 * noise to an answer a seller has to trust.
 */
export const PRINTED_CLASSES = new Set(["014", "016", "018", "020", "021", "024", "025", "026", "028"]);

/** Design-only marks have no words to collide with. */
const DESIGN_ONLY_DRAWING_CODE = "2";

export type RegisterHit = {
  mark: string;
  owner: string;
  serial: string;
  registration: string;
  classes: string[];
  registered: boolean;
};

/**
 * The form a phrase is matched in.
 *
 * Two marks collide when the words collide — "COZY SEASON", "Cozy Season."
 * and "cozy  season" are one mark for this purpose. Punctuation goes,
 * whitespace collapses, case goes.
 */
/**
 * The same phrase with its word boundaries removed.
 *
 * "HAUSLABS" and "HAUS LABS" are one mark to a buyer, to a brand owner, and
 * to whoever files the takedown — but not to a string comparison, so they were
 * never matched. Squeezing gives both forms one key.
 *
 * Used for EXACT equivalence only, never for containment. "ART" sits inside
 * "HEART" once the spaces are gone, and a containment test on squeezed text
 * would start reporting that as a hit. Containment stays on the word-boundary
 * form, where it means what it says.
 */
export const squeeze = (text: string): string => normalize(text).replace(/ /g, "");

export const normalize = (text: string): string =>
  text
    .toUpperCase()
    /* An apostrophe joins, it does not separate: MAMA'S is MAMAS, not MAMA S. */
    .replace(/['‘’"“”]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();


/** USPTO daily XML status codes, not numeric lifecycle ranges.
 * Source: https://www.uspto.gov/sites/default/files/products/TMDailyApp-Documentation-508.pdf
 * 800 is renewed, 602 is abandoned, and 718 is an extension request.
 */
export const INACTIVE_STATUS_CODES = [401,402,404,405,414,415,416,417,
  600,601,602,603,604,605,606,607,608,609,612,614,618,622,626,
  710,711,712,713,714,716,900,969,970];
const INACTIVE_STATUSES = new Set(INACTIVE_STATUS_CODES);
export function isLiveStatus(code: number): boolean {
  return code > 0 && (code < 900 || code === 973) && !INACTIVE_STATUSES.has(code);
}
export function isRegisteredStatus(code: number, registration = ""): boolean {
  if (!isLiveStatus(code)) return false;
  if ([624,700,701,702,703,704,705,800].includes(code)) return true;
  return Boolean(registration && !/^0+$/.test(registration)) && ![400,715].includes(code);
}

/** One record, reduced to what a seller's question needs. */
export function readRecord(xml: string): {
  serial: string;
  mark: string;
  owner: string;
  registration: string;
  statusCode: number;
  classes: string[];
  live: boolean;
  drawingCode: string;
} {
  const header = xml.slice(xml.indexOf("<case-file-header>"), xml.indexOf("</case-file-header>") + 1);
  const statusCode = Number(field(header, "status-code") || 0);
  const cancelled = /^[0-9]{8}$/.test(field(header, "cancellation-date")) && Number(field(header, "cancellation-date")) > 0;
  const classifications = xml.slice(xml.indexOf("<classifications>"), xml.indexOf("</classifications>") + 1);
  const classBlocks = allFields(classifications, "classification");
  const activeBlocks = classBlocks.filter(block => {
    const status = field(block, "status-code").replace(/^0+/, "");
    return !["1","2","3","4","5","7","8","9","A","B","C","D","E"].includes(status);
  });
  const activeClasses = classBlocks.length ? activeBlocks.flatMap(block => allFields(block, "international-code")) : allFields(classifications, "international-code");
  const owners = xml.slice(xml.indexOf("<case-file-owners>"), xml.indexOf("</case-file-owners>") + 1);
  const registration = field(xml, "registration-number");
  return {
    serial: field(xml, "serial-number"),
    mark: field(header, "mark-identification"),
    owner: field(owners, "party-name"),
    registration: registration === "0000000" ? "" : registration,
    statusCode,
    classes: [...new Set(activeClasses)].filter(Boolean),
    live: isLiveStatus(statusCode) && !cancelled && (!classBlocks.length || activeBlocks.length > 0),
    drawingCode: field(header, "mark-drawing-code"),
  };
}

/** Whether a record is worth a row: live, wordy, and printed on something. */
export function worthKeeping(record: ReturnType<typeof readRecord>): boolean {
  if (!record.live) return false;
  if (!record.mark || record.drawingCode === DESIGN_ONLY_DRAWING_CODE) return false;
  if (normalize(record.mark).length < 2) return false;
  /*
    CLASS IS NOT A FILTER. IT WAS, AND IT PRODUCED THE WORST KIND OF MISS.

    Only the nine print-on-demand classes were kept, which reads as sensible
    for a print-on-demand tool and is wrong for what this tool is FOR. A
    takedown follows the brand, not the Nice classification: printing HAUSLABS
    on a shirt gets the listing removed whether or not Haus Labs registered in
    the apparel class. It registered in class 3 — cosmetics — so the search
    returned "nothing found" for a famous beauty brand, which is the one answer
    this tool must never give wrongly.

    Classes are still read and stored. They rank and explain a hit; they no
    longer decide whether the mark is allowed to exist in the corpus.
  */
  return true;
}


/** Common connecting words alone are not useful substring matches. Exact searches still return them. */
export function meaningfulMarkMatch(mark: string, phrase: string): boolean {
  const m=normalize(mark), p=normalize(phrase);
  if (squeeze(mark)===squeeze(phrase)) return true;
  if (new Set(["a","an","and","as","at","be","by","for","from","in","is","it","my","of","on","or","our","the","this","that","these","those","to","with","your"]).has(m.toLowerCase())) return false;
  return (` ${p} `).includes(` ${m} `);
}
