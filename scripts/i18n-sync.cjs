// ============================================================================
// i18n-sync — tradução automática PT-BR -> EN/ES do Portal (motor: DeepSeek).
// Varre TODO o código (t("...")), acha chaves sem EN/ES e completa via LLM,
// preservando placeholders {n}, emojis e nomes de marca. Reescreve translations.ts
// ordenado/sem duplicatas. É a ponte oficial ATÉ o Tolgee entrar no ar.
//
// Uso:
//   npm run i18n            # traduz o que falta e reescreve translations.ts
//   DRY=1 npm run i18n      # só relata quantas faltam (não escreve)
//   LIMIT=20 npm run i18n   # traduz só as 20 primeiras (teste)
//
// Chave DeepSeek: por padrão é revelada do cofre do agente (wacrm, agents.reveal_secret).
//   Isso exige o driver 'pg' no NODE_PATH: NODE_PATH="../wacrm/api/node_modules".
//   Alternativa sem banco: exporte DEEPSEEK_API_KEY e o script usa direto.
// ============================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const SRC = path.resolve(__dirname, '../src');
const TRANS = path.join(SRC, 'lib/translations.ts');
const WACRM_ENV = process.env.WACRM_ENV || path.resolve(__dirname, '../../wacrm/api/.env');
const DS_AGENT = process.env.DS_AGENT || '82e7356d-c71c-4c63-b746-d181f661d58a'; // agente c/ chave DeepSeek no cofre
const DRY = process.env.DRY === '1';
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0;

function loadDict() {
  const raw = fs.readFileSync(TRANS, 'utf8');
  const js = raw.replace(/import type[^\n]*\n/, '').replace(/export const DICT[^=]*=/, 'module.exports.DICT =');
  const tmp = path.join(os.tmpdir(), 'dict_' + process.pid + '.cjs');
  fs.writeFileSync(tmp, js); const { DICT } = require(tmp); fs.unlinkSync(tmp); return DICT;
}
function unesc(s) { return s.replace(/\\(["'\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\t/g, '\t'); }
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git|dist/.test(e.name)) walk(p, out); }
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  } return out;
}
function extractKeys() {
  const keys = new Set();
  const reD = /(?<![\w$.])t\(\s*"((?:[^"\\]|\\.)*)"/g, reS = /(?<![\w$.])t\(\s*'((?:[^'\\]|\\.)*)'/g;
  for (const f of walk(SRC, [])) { const s = fs.readFileSync(f, 'utf8'); let m;
    while ((m = reD.exec(s))) keys.add(unesc(m[1])); while ((m = reS.exec(s))) keys.add(unesc(m[1])); }
  return keys;
}
function loadPg() {
  try { return require('pg'); }
  catch { return require(path.resolve(WACRM_ENV, '../node_modules/pg')); } // resolve pg do wacrm sem NODE_PATH
}
async function llmKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const env = fs.readFileSync(WACRM_ENV, 'utf8');
  const url = (env.match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/) || [])[1];
  const { Pool } = loadPg();
  const pool = new Pool({ connectionString: url.trim(), ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 15000 });
  const c = await pool.connect();
  try { return (await c.query("select agents.reveal_secret($1,'llm_deepseek_api_key') as v", [DS_AGENT])).rows[0]?.v; }
  finally { c.release(); await pool.end(); }
}
const SYSTEM = [
  'Voce e um tradutor de UI de um sistema SaaS (Crasto.AI) em portugues do Brasil.',
  'Traduza cada string de PT-BR para INGLES (en) e ESPANHOL (es), tom profissional de produto de software.',
  'REGRAS: mantenha placeholders {n} {t} {x} EXATAMENTE iguais; mantenha emojis e simbolos; NAO traduza nomes proprios/marcas (Crasto.AI, WhatsApp, CRM, DeepSeek); preserve pontuacao e capitalizacao do estilo.',
  'RESPONDA SOMENTE um array JSON: [{"pt":"...","en":"...","es":"..."}], na MESMA ordem, sem texto fora do JSON.',
].join('\n');
async function translateBatch(key, batch) {
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: process.env.DS_MODEL || 'deepseek-chat', temperature: 0.2, max_tokens: 8000,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'Traduza (responda SOMENTE o array JSON com pt/en/es, mesma ordem):\n' + JSON.stringify(batch) }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('DeepSeek HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 220));
  const out = j.choices?.[0]?.message?.content || '';
  const m = out.match(/\[[\s\S]*\]/); if (!m) throw new Error('sem JSON: ' + out.slice(0, 160));
  return JSON.parse(m[0]);
}
(async () => {
  const DICT = loadDict();
  const codeKeys = extractKeys();
  const allKeys = new Set([...Object.keys(DICT), ...codeKeys]);
  let missing = [...allKeys].filter(k => { const e = DICT[k] || {}; return !e.en || !e.es; });
  console.log('DICT:', Object.keys(DICT).length, '| codigo:', codeKeys.size, '| faltando (en/es):', missing.length);
  if (LIMIT) missing = missing.slice(0, LIMIT);
  if (DRY) { console.log('[DRY] amostra:', missing.slice(0, 10)); return; }
  if (!missing.length) { console.log('Nada a traduzir — catalogo ja completo.'); return; }
  const key = await llmKey();
  if (!key) { console.log('SEM chave DeepSeek (agents.reveal_secret).'); return; }
  console.log('Chave DeepSeek OK. Traduzindo', missing.length, 'chaves (deepseek-chat)...');
  const B = 40; const filled = {};
  for (let i = 0; i < missing.length; i += B) {
    const batch = missing.slice(i, i + B);
    try {
      const res = await translateBatch(key, batch);
      for (const row of res) if (row && row.pt) filled[row.pt] = { en: row.en, es: row.es };
      process.stdout.write(`  ${Math.min(i + B, missing.length)}/${missing.length}\r`);
    } catch (e) { console.log('\n  ! lote', i, 'falhou:', e.message); }
  }
  console.log('\nTraduzidas:', Object.keys(filled).length);
  // Merge: mantem existentes; adiciona/completa faltantes.
  const merged = { ...DICT };
  for (const k of Object.keys(filled)) merged[k] = { en: filled[k].en ?? DICT[k]?.en ?? k, es: filled[k].es ?? DICT[k]?.es ?? k };
  // Reescreve translations.ts (ordena por chave, 1 por linha, sem duplicatas).
  const lines = Object.keys(merged).sort((a, b) => a.localeCompare(b, 'pt'))
    .map(k => `  ${JSON.stringify(k)}: { en: ${JSON.stringify(merged[k].en ?? k)}, es: ${JSON.stringify(merged[k].es ?? k)} },`);
  const header = `// ============================================================================\n// Dicionario de traducoes (PT = origem). EN/ES completados automaticamente (DeepSeek).\n// Gerado pelo pipeline i18n_sync — reexecute apos adicionar textos novos. Nao editar a mao\n// (edite via pipeline/Tolgee). useT() cai no PT se faltar algo.\n// ============================================================================\nimport type { Lang } from "./i18n";\n\nexport const DICT: Record<string, Partial<Record<Lang, string>>> = {\n`;
  fs.writeFileSync(TRANS, header + lines.join('\n') + '\n};\n', 'utf8');
  console.log('translations.ts reescrito:', Object.keys(merged).length, 'chaves (todas com en/es).');
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
