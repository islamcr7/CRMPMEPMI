import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/* ======================================================================
 * Rendu Markdown minimal et sûr pour les réponses de l'assistant :
 * paragraphes, listes, **gras**, *italique*, `code`, liens.
 * Aucun HTML n'est interprété (React échappe tout le texte) ; les liens
 * internes (/contacts/…) restent dans l'application.
 * ==================================================================== */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*\s][^*]*)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) {
      const [label, href] = [m[2], m[3]];
      if (href.startsWith('/')) {
        out.push(
          <Link key={k} to={href} className="font-medium text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600">
            {label}
          </Link>,
        );
      } else if (/^https?:\/\//.test(href)) {
        out.push(
          <a key={k} href={href} target="_blank" rel="noreferrer noopener" className="text-indigo-600 underline">
            {label}
          </a>,
        );
      } else out.push(label);
    } else if (m[4]) out.push(<strong key={k}>{m[5]}</strong>);
    else if (m[6]) out.push(<code key={k} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">{m[7]}</code>);
    else if (m[8]) out.push(<em key={k}>{m[9]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let b = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // Titre (### …) rendu comme une ligne en gras
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={b++} className="font-semibold text-slate-900">
          {inline(heading[1], `h${b}`)}
        </p>,
      );
      i++;
      continue;
    }
    // Liste à puces ou numérotée
    const bullet = /^\s*([-*•]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && bullet.test(lines[i])) items.push(lines[i++].replace(bullet, ''));
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={b++} className={`space-y-0.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `l${b}-${j}`)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    // Paragraphe : lignes consécutives
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !bullet.test(lines[i]) && !/^#{1,4}\s/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={b++}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `p${b}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="space-y-2 break-words">{blocks}</div>;
}
