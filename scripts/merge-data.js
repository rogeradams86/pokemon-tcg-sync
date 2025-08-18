/**
 * merge-data.js
 * 
 * Merges Pokémon TCG card data with pricing from `data/pricing-raw.json`,
 * writes chunked card JSON files and an index manifest into /data.
 * 
 * INPUTS (expected):
 *  - data/cards-all.json  (array of card objects from Pokémon TCG API export)
 *    Each card minimally: { id, number, name, set: { id, name }, ... }
 *  - data/pricing-raw.json (from fetch-pricing.js)
 * 
 * OUTPUTS:
 *  - data/tcg-cards-index.json   (manifest with chunk list)
 *  - data/tcg-cards-chunk-#.json (cards with attached `pricing` object)
 * 
 * If your project produces cards in a different structure, adjust `loadCards()`.
 */
import fs from 'fs';
import path from 'path';
import process from 'process';

const REPO_ROOT = process.cwd();
const DATA_DIR  = path.join(REPO_ROOT, 'data');
const CARDS_SRC = path.join(DATA_DIR, 'cards-all.json');
const PRICING   = path.join(DATA_DIR, 'pricing-raw.json');

const CHUNK_SIZE = 5000;

// ------- utilities ----------------------------------------------------------
function readJson(p, optional=false) {
  if (!fs.existsSync(p)) {
    if (optional) return null;
    throw new Error(`Missing required file: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function normalizeSetId(setId) {
  if (!setId) return [''];
  const s = String(setId).toLowerCase();
  const out = new Set([s, s.replace(/[^a-z0-9]/g,'')]);

  // common aliases for vintage
  if (s === 'base') { out.add('base1'); out.add('base-set'); }
  if (s === 'base1') { out.add('base'); out.add('base-set'); }

  // Try removing trailing number (neo1 -> neo)
  out.add(s.replace(/(\d+)$/, ''));

  return [...out];
}

function numberCandidates(n) {
  if (!n) return ['','0'];
  const s = String(n).toUpperCase().trim();
  const out = new Set([s]);

  if (s.includes('/')) {
    const left = s.split('/')[0]; // "1/102" -> "1"
    out.add(left);
    const num = parseInt(left, 10);
    if (Number.isFinite(num)) out.add(String(num));
  }
  const digits = s.replace(/\D/g,'');
  if (digits) {
    out.add(digits);
    const n2 = parseInt(digits, 10);
    if (Number.isFinite(n2)) out.add(String(n2));
  }
  out.add(s.replace(/[^A-Z0-9]/g,'')); // SVP-001 -> SVP001
  return [...out].filter(Boolean);
}

function normalizePrint(v='normal'){
  v = String(v || 'normal').toLowerCase();
  if (v.startsWith('rev') || v.includes('reverse')) return 'reverse';
  if (v.includes('holo') || v.includes('foil'))   return 'holo';
  if (v.includes('normal'))                        return 'normal';
  return v || 'normal';
}

function toSetIdFromCard(card) {
  // card.set?.id is the best source; fallback to id prefix like "base1-1"
  if (card?.set?.id) return String(card.set.id).toLowerCase();
  const id = String(card?.id || '');
  const m = id.match(/^([a-z0-9\-]+)\-/i);
  if (m) return m[1].toLowerCase();
  return '';
}

function attachPricing(card, pricingMap) {
  const setIds = normalizeSetId(toSetIdFromCard(card));
  const nums   = numberCandidates(card.number);
  const prints = [normalizePrint(card.printing || card.variant || card.rarity || 'normal'), 'normal','holo','reverse'];

  let match = null;

  outer: for (const gid of setIds) {
    for (const num of nums) for (const pr of prints) {
      const k = `${gid}|${num}|${pr}|EN`;
      if (pricingMap[k]) { match = pricingMap[k]; break outer; }
    }
  }
  // sealed / blank-number fallback
  if (!match) {
    for (const gid of setIds) for (const pr of prints) {
      const k = `${gid}||${pr}|EN`;
      if (pricingMap[k]) { match = pricingMap[k]; break; }
    }
  }

  if (match) {
    card.pricing = {
      market: match.market,
      low: match.low,
      high: match.high
    };
  } else {
    card.pricing = null;
  }
  return card;
}

// ------- main ---------------------------------------------------------------
function loadCards() {
  // Expect a single file with all cards
  return readJson(CARDS_SRC);
}

function chunkArray(arr, size) {
  const out = [];
  for (let i=0; i<arr.length; i+=size) out.push(arr.slice(i, i+size));
  return out;
}

function main() {
  const cards = loadCards();
  const pricingRaw = readJson(PRICING, true);
  const pricingMap = pricingRaw?.pricing || {};

  console.log(`Cards: ${cards.length} • Pricing entries: ${Object.keys(pricingMap).length}`);
  let withPricing = 0;

  const merged = cards.map(c => {
    const r = attachPricing({ ...c }, pricingMap);
    if (r.pricing) withPricing++;
    return r;
  });

  // Write chunks
  const chunks = chunkArray(merged, CHUNK_SIZE);
  const chunkNames = [];
  chunks.forEach((chunk, idx) => {
    const name = `tcg-cards-chunk-${idx+1}.json`;
    writeJson(path.join(DATA_DIR, name), { cards: chunk });
    chunkNames.push(name);
  });

  // Manifest
  const index = {
    generatedAt: new Date().toISOString(),
    totalCards: merged.length,
    cardsWithPricing: withPricing,
    chunks: chunkNames
  };
  writeJson(path.join(DATA_DIR, 'tcg-cards-index.json'), index);

  console.log(`✅ Wrote ${chunkNames.length} chunk(s). cardsWithPricing=${withPricing}`);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
