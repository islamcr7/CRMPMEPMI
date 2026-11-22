/** Lecture d'un fichier CSV : gère l'UTF-8 (avec ou sans BOM) et le Windows-1252 des exports Excel. */
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8;
  return text.replace(/^﻿/, '');
}

/** Détecte le séparateur le plus fréquent sur la première ligne (hors guillemets). */
function detectDelimiter(text: string) {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === '\n') break;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/** Parseur CSV (RFC 4180) : guillemets, guillemets doublés, retours à la ligne dans les champs. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const d = detectDelimiter(text);
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      out.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    out.push(row);
  }
  const nonEmpty = out.filter((r) => r.some((c) => c.trim() !== ''));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows };
}

export const normalizeHeader = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
