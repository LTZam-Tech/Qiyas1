// Finds every English UI string that needs a translation in the other
// languages, by parsing the source (no runtime needed).
//
//   node scripts/i18n-strings.mjs          → lists strings missing from ur.js
//
// What counts as a translatable string:
//   1. t('ar', 'en')               → 'en'  (also makeT(x)('ar', 'en'))
//   2. object properties ending in En/_en, or `en:` → their string value(s)
//      (e.g. labelEn, title_en, ROLE_LABELS.en), unless the same object also
//      carries the translation itself (`ur:` / `xxx_ur` / `xxxUr`)
//   3. tuples ['key', 'عربي', 'English'] used as option lists
// People's names are excluded: they are shown in the Arabic script for Urdu.
// t() calls whose English is built at runtime (template literals with ${})
// must pass the translation as a third argument; they are reported otherwise.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['src', 'mock-api'];
const NAME_KEYS = new Set(['user_en', 'assignee_en', 'full_name_en', 'fullNameEn', 'uploaded_by_name_en', 'name_en_person']);
const ARABIC = /[؀-ۿ]/;

const listFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' || name === 'i18n' ? [] : listFiles(p);
    return /\.(jsx?|mjs)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });

const stringOf = (node) => {
  if (!node) return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return undefined;
};

const keyName = (prop) => (prop.key?.type === 'Identifier' ? prop.key.name : stringOf(prop.key));

const isEnglishKey = (k) => k && !NAME_KEYS.has(k) && (k === 'en' || /En$/.test(k) || /_en$/.test(k));
const urdusSibling = (k) => (k === 'en' ? 'ur' : k.replace(/En$/, 'Ur').replace(/_en$/, '_ur'));

const walk = (node, visit) => {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const child = node[key];
    if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === 'string' && walk(c, visit));
    else if (child && typeof child.type === 'string') walk(child, visit);
  }
};

const isTCallee = (callee) =>
  (callee.type === 'Identifier' && callee.name === 't') ||
  (callee.type === 'CallExpression' && callee.callee.type === 'Identifier' && callee.callee.name === 'makeT');

export function collectStrings() {
  const needed = new Map(); // english -> first location
  const dynamic = []; // t() with runtime English and no explicit translation
  const add = (en, loc) => {
    if (en && /[A-Za-z]/.test(en) && !needed.has(en)) needed.set(en, loc);
  };

  for (const file of SOURCES.flatMap((d) => listFiles(join(ROOT, d)))) {
    const code = readFileSync(file, 'utf8');
    const ast = espree.parse(code, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true });
    const rel = relative(ROOT, file).replaceAll('\\', '/');
    walk(ast, (node) => {
      const loc = `${rel}:${node.loc?.start.line}`;
      if (node.type === 'CallExpression' && isTCallee(node.callee)) {
        if (node.arguments.length >= 3) return;
        const enNode = node.arguments[1];
        const en = stringOf(enNode);
        if (en !== undefined) add(en, loc);
        else if (enNode?.type === 'TemplateLiteral') dynamic.push(loc);
      } else if (node.type === 'ObjectExpression') {
        const keys = new Set(node.properties.map(keyName));
        for (const prop of node.properties) {
          const k = keyName(prop);
          if (!isEnglishKey(k) || keys.has(urdusSibling(k))) continue;
          if (prop.value.type === 'ArrayExpression') prop.value.elements.forEach((el) => add(stringOf(el), loc));
          else add(stringOf(prop.value), loc);
        }
      } else if (node.type === 'ArrayExpression' && node.elements.length === 3) {
        const [, ar, en] = node.elements.map(stringOf);
        if (ar && en && ARABIC.test(ar) && !ARABIC.test(en)) add(en, loc);
      }
    });
  }
  return { needed, dynamic };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { default: UR } = await import('../src/i18n/ur.js');
  const { needed, dynamic } = collectStrings();
  const missing = [...needed].filter(([en]) => !UR[en]);
  const unused = Object.keys(UR).filter((k) => !needed.has(k));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ missing: missing.map(([en, loc]) => ({ en, loc })), dynamic, unused }, null, 2));
  } else {
    console.log(`${needed.size} strings, ${missing.length} missing Urdu, ${dynamic.length} runtime strings without a translation, ${unused.length} unused`);
    missing.forEach(([en, loc]) => console.log(`  missing  ${JSON.stringify(en)}  (${loc})`));
    dynamic.forEach((loc) => console.log(`  dynamic  ${loc}`));
  }
}
