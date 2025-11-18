/**
 * merge-data.js
 * 
 * Merges Pokémon TCG card data with pricing from `data/pricing-raw.json`,
 * enriches cards with full set metadata, and writes chunked card JSON files.
 */

import fs from 'fs';
import path from 'path';
import process from 'process';

const REPO_ROOT = process.cwd();
const DATA_DIR  = path.join(REPO_ROOT, 'data');

// ALWAYS read raw-cards.json now
const RAW_SRC   = path.join(DATA_DIR, 'raw-cards.json');
const PRICING   = path.join(DATA_DIR, 'pricing-raw.json');

const CHUNK_SIZE = 5000;

// --------------------- utils ---------------------
function readJson(p, optional=false) {
  if (!fs.existsSync(p)) {
    if (optional) return null;
    throw new Error(`Missing file: ${p}`);
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

  // vintage alias support
  if (s === 'base') { out.add('base1'); out.add('base-set'); }
  if (s === 'base1') { out.add('base'); out.add('base-set'); }

  out.add(s.replace(/(\d+)$/, '')); // neo1 -> neo

  return [...out];
}

function numberCandidates(n) {
  if (!n) return ['','0'];
  const s = String(n).toUpperCase().trim();
  const out = new Set([s]);

  if (s.includes('/')) {
    const left = s.split('/')[0];
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

function normalizePrint(v='normal') {
  v = String(v || 'normal').toLowerCase();
  if (v.startsWith('rev') || v.includes('reverse')) return 'reverse';
  if (v.includes('holo') || v.includes('foil'))   return 'holo';
  if (v.includes('normal'))                        return 'normal';
  return v || 'normal';
}

function toSetIdFromCard(card) {
  if (card?.set?.id) return String(card.set.id).toLowerCase();
  const id = String(card?.id || '');
  const m = id.match(/^([a-z0-9\-]+)\-/i);
  if (m) return m[1].toLowerCase();
  return '';
}

function attachPricing(card, pricingMap) {
  const setIds = normalizeSetId(toSetIdFromCard(card));
  const nums   = numberCandidates(card.number);
  const prints = [
    normalizePrint(card.printing || card.variant || card.rarity || 'normal'),
    'normal','holo','reverse'
  ];

  let match = null;

  outer: for (const gid of setIds) {
    for (const num of nums) for (const pr of prints) {
      const k = `${gid}|${num}|${pr}|EN`;
      if (pricingMap[k]) { match = pricingMap[k]; break outer; }
    }
  }

  // fallback for sealed / no-number
  if (!match) {
    for (const gid of setIds) for (const pr of prints) {
      const k = `${gid}||${pr}|EN`;
      if (pricingMap[k]) { match = pricingMap[k]; break; }
    }
  }

  card.pricing = match
    ? { market: match.market, low: match.low, high: match.high }
    : null;

  return card;
}

// --------------------- NEW: Include set metadata ---------------------
function buildSetMap(raw) {
  const out = {};
  if (!raw.sets) return out;

  raw.sets.forEach(s => {
    out[String(s.id).toLowerCase()] = s;
  });
  return out;
}

function loadCardsWithSets() {
  const raw = readJson(RAW_SRC);

  const cards = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.cards)
      ? raw.cards
      : [];

  const setMap = buildSetMap(raw);

  cards.forEach(card => {
    let sid = card.set?.id || card.set;
    if (!sid) return;

    sid = String(sid).toLowerCase();

    if (!card.set) card.set = { id: sid };

    if (setMap[sid]) {
      card.set = {
        ...card.set,
        name: setMap[sid].name,
        series: setMap[sid].series,
        releaseDate: setMap[sid].releaseDate,
        images: setMap[sid].images,
        printedTotal: setMap[sid].printedTotal,
        total: setMap[sid].total
      };
    }
  });

  return cards;
}

// --------------------- main ---------------------
function chunkArray(arr, size) {
  const out = [];
  for (let i=0; i<arr.length; i+=size) out.push(arr.slice(i, i+size));
  return out;
}

function main() {
  const cards = loadCardsWithSets();
  const pricingRaw = readJson(PRICING, true);
  const pricingMap = pricingRaw?.pricing || {};

  console.log(`Cards: ${cards.length} • Pricing entries: ${Object.keys(pricingMap).length}`);

  let withPricing = 0;

  const merged = cards.map(c => {
    const r = attachPricing({ ...c }, pricingMap);
    if (r.pricing) withPricing++;
    return r;
  });

  // write chunks
  const chunks = chunkArray(merged, CHUNK_SIZE);
  const chunkNames = [];
  chunks.forEach((chunk, idx) => {
    const name = `tcg-cards-chunk-${idx+1}.json`;
    writeJson(path.join(DATA_DIR, name), { cards: chunk });
    chunkNames.push(name);
  });

  // write index
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
