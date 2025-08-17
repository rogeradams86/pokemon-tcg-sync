import fs from 'fs';



// =====================================================================
// merge-data (2).js — FULL FILE
// Accepts cards, pricing, and sets; outputs merged cards with proper set
// =====================================================================

const fs = require('node:fs/promises');
const path = require('node:path');

/**
 * Merge cards + pricing + sets so each card has a real `set` object and pricing.
 *
 * @param {Array<Object>} cards - array of card objects. Each should have `id` like "base5-36".
 * @param {Object<string, Object>|Array<Object>} pricing - map or array with per-card pricing.
 *        If it's an array, we will map it by a stable key. Your existing keying logic is preserved below.
 * @param {Array<Object>} sets - canonical set list from fetchSets() (en.json), each with `id`+`name`.
 * @param {Object} [opts]
 * @param {string} [opts.outputFile] - where to write the merged JSON. If omitted, returns the array only.
 * @returns {Promise<Array<Object>>}
 */
async function mergeData(cards, pricing, sets, opts = {}) {
  if (!Array.isArray(cards)) throw new Error('cards must be an array');
  if (!Array.isArray(sets)) throw new Error('sets must be an array');

  const setIndex = new Map();
  for (const s of sets) {
    if (!s || !s.id) continue;
    setIndex.set(String(s.id).toLowerCase(), s);
  }

  // If pricing is an array, adapt it to a map by your existing key (example uses `${id}`)
  const pricingMap = Array.isArray(pricing) ? arrayToPricingMap(pricing) : (pricing || {});

  const merged = cards.map(card => {
    const setCode = inferSetCodeFromCard(card);
    const setObj = setCode ? (setIndex.get(setCode) || {}) : {};

    const priceKey = buildPricingKey(card); // keep in sync with your pricing builder
    const p = pricingMap[priceKey] || null;

    // If card already has a non-empty set, prefer it; else use setObj from en.json
    const finalSet = hasKeys(card.set) ? card.set : setObj;

    return {
      ...card,
      set: finalSet,
      pricing: p
    };
  });

  if (opts.outputFile) {
    const outPath = path.resolve(opts.outputFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(merged, null, 2), 'utf8');
  }

  return merged;
}

/** Extract set code like 'base5' from id 'base5-36' */
function inferSetCodeFromCard(card) {
  const id = card && card.id ? String(card.id) : '';
  const m = id.match(/^([a-z0-9]+)(?=-)/i);
  return m ? m[1].toLowerCase() : null;
}

/** Whether an object has at least one own key */
function hasKeys(obj) {
  return obj && typeof obj === 'object' && Object.keys(obj).length > 0;
}

/** Turn a pricing array into a map keyed by your stable key */
function arrayToPricingMap(arr) {
  const map = {};
  for (const item of arr) {
    const k = buildPricingKey(item);
    if (k) map[k] = item;
  }
  return map;
}

/**
 * Build the pricing key used both when generating pricing and when merging.
 * Adjust this to match your existing pricing key logic.
 * Common pattern: `${card.id}` or `${setId}|${number}|${name}` etc.
 */
function buildPricingKey(obj) {
  // Default: use the card id if present; else try composite
  if (obj && obj.id) return String(obj.id);
  if (obj && obj.setId && obj.number) return `${obj.setId}|${obj.number}`;
  return null;
}

module.exports = { mergeData };

// Optional: run directly for a quick test
// Usage example: node "merge-data (2).js" ./cards.json ./pricing.json ./merged.json
if (require.main === module) {
  (async () => {
    const [cardsPath, pricingPath, outPath] = process.argv.slice(2);
    if (!cardsPath || !pricingPath) {
      console.log('Usage: node "merge-data (2).js" <cards.json> <pricing.json> [merged.json]');
      process.exit(0);
    }
    const cards = JSON.parse(await fs.readFile(path.resolve(cardsPath), 'utf8'));
    const pricing = JSON.parse(await fs.readFile(path.resolve(pricingPath), 'utf8'));

    // Pull sets live so this file is standalone when run directly
    const { fetchSets } = require('./fetch-cards (2).js');
    const sets = await fetchSets();

    const merged = await mergeData(cards, pricing, sets, outPath ? { outputFile: outPath } : {});
    console.log(`Merged ${merged.length} cards${outPath ? ` → ${outPath}` : ''}`);
  })().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
