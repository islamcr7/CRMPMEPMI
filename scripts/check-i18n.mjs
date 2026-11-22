// Vérifie que chaque texte passé à t('…') dans le client a sa traduction anglaise.
// Usage : node scripts/check-i18n.mjs        → rapport (code de sortie 1 si manquant)
//         node scripts/check-i18n.mjs --list → liste JSON des clés manquantes
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'client', 'src');
const ts = createRequire(path.join(root, 'client', 'package.json'))('typescript');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));

const keys = new Map(); // clé → premier fichier
for (const file of walk(src)) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      const a = node.arguments[0];
      if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && !keys.has(a.text)) keys.set(a.text, path.relative(src, file));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Lecture du dictionnaire (objet littéral exporté dans en.ts)
const enFile = path.join(src, 'lib', 'en.ts');
const enSf = ts.createSourceFile(enFile, fs.readFileSync(enFile, 'utf8'), ts.ScriptTarget.Latest, true);
const dict = new Set();
const collect = (node) => {
  if (ts.isPropertyAssignment(node)) dict.add(ts.isStringLiteral(node.name) ? node.name.text : node.name.getText(enSf));
  ts.forEachChild(node, collect);
};
collect(enSf);

// Textes identiques dans les deux langues : pas besoin d'entrée
const SAME = (k) => !/[A-Za-zÀ-ÿ]/.test(k) || /^(CRM PME|C|Email|Contacts|Contact|Pipeline|Notes|Note|Source|Prospect|Ctrl [A-Z]|Web)$/.test(k);
const missing = [...keys.keys()].filter((k) => !dict.has(k) && !SAME(k));

if (process.argv.includes('--list')) {
  console.log(JSON.stringify(missing, null, 1));
} else {
  console.log(`${keys.size} textes, ${dict.size} traductions, ${missing.length} manquante(s)`);
  for (const k of missing) console.log(`  - ${JSON.stringify(k)}  (${keys.get(k)})`);
  process.exit(missing.length ? 1 : 0);
}
