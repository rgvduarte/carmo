// Run by the deploy workflow in worker/, after wrangler is installed there: finds the KV namespace «gocarmo-pedidos»,
// creates it the first time, and writes its id into wrangler.toml for this deploy only (git keeps the placeholder).
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const TITLE = 'gocarmo-pedidos';
const wrangler = (...args) => execFileSync('npx', ['--no-install', 'wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
// `wrangler kv namespace list` prints a JSON array and nothing else
function find() {
  const out = wrangler('kv', 'namespace', 'list');
  const list = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
  return list.find((n) => n.title === TITLE) || null;
}

let ns = find();
if (!ns) {
  console.log(`A criar o KV namespace ${TITLE}`);
  wrangler('kv', 'namespace', 'create', TITLE);
  ns = find();
}
if (!ns || !/^[0-9a-f]{32}$/.test(ns.id)) throw new Error(`Não encontrei o KV namespace ${TITLE}.`);
const toml = readFileSync('wrangler.toml', 'utf8');
const next = toml.replace(/^id = ".*"$/m, `id = "${ns.id}"`);
if (!/^id = "[0-9a-f]{32}"$/m.test(next)) throw new Error('O wrangler.toml não tem a linha id do KV.');
writeFileSync('wrangler.toml', next);
console.log(`KV namespace ${TITLE}: ${ns.id}`);
