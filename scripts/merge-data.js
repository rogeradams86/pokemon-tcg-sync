// merge-data (2).js — FULL FILE
// Joins cards + pricing + sets. Pricing key matches fetch-pricing (2).js
//   key = `${groupId}|${extNumber}|${printing}|EN`
// We try the exact printing and fall back to normal if needed.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LANG = 'EN';

function toSetCodeFromIdOrUrl(id, imgUrl) {
  // card.id like "base5-36" → base5
  if (id) {
    const m = String(id).match(/^([a-z0-9]+)(?=-)/i);
    if (m) return m[1].toLowerCase();
  }
  if (imgUrl) {
    const m = String(imgUrl).match(/images\.pokemontcg\.io\/(.*?)\//i);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function normalizePrintingLike(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('reverse')) return 'reverse';
  if (v.includes('holo') || v.includes('foil')) return 'holo';
  return 'normal';
}

function buildPricingKey({ groupId, extNumber, printing, lang }) {
  return `${String(groupId||'').toLowerCase()}|${String(extNumber||'').toUpperCase()}|${String(printing||'normal').toLowerCase()}|${String(lang||DEFAULT_LANG).toUpperCase()}`;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function hasKeys(obj) { return obj && typeof obj === 'object' && Object.keys(obj).length > 0; }

function main() {
  console.log('🔄 Merging card data with pricing...');

  const rawCardsPath = 'data/raw-cards.json';
  const pricingPath  = 'data/pricing-raw.json';

  if (!fs.existsSync(rawCardsPath)) throw new Error('raw-cards.json not found. Run fetch-cards first.');
  if (!fs.existsSync(pricingPath)) throw new Error('pricing-raw.json not found. Run fetch-pricing first.');

  console.log('📖 Loading raw data...');
  const cardData = loadJson(rawCardsPath);
  const pricingData = loadJson(pricingPath);

  const allCards = Array.isArray(cardData.cards) ? cardData.cards : [];
  const allSets  = Array.isArray(cardData.sets)  ? cardData.sets  : [];
  const pricingMap = pricingData.pricing || {};

  console.log(`📊 Processing ${allCards.length} cards...`);
  console.log(`💰 Pricing entries: ${Object.keys(pricingMap).length}`);
  console.log(`📦 Loaded ${allSets.length} sets`);

  // Build set index by id (e.g., base5)
  const setIndex = new Map();
  for (const s of allSets) {
    if (s && s.id) setIndex.set(String(s.id).toLowerCase(), s);
  }

  let cardsWithPricing = 0;
  let setsEnriched = 0;

  const enrichedCards = allCards.map((card) => {
    // Ensure card.set is populated (prefer original; else enrich from sets by code)
    let finalSet = hasKeys(card.set) ? card.set : null;
    if (!finalSet) {
      const code = toSetCodeFromIdOrUrl(card.id, card.images?.small || card.images?.large);
      const s = code ? setIndex.get(code) : null;
      if (s) { finalSet = s; setsEnriched++; }
      else { finalSet = {}; }
    }

    // Build pricing keys
    const groupId = (finalSet?.id || toSetCodeFromIdOrUrl(card.id))?.toLowerCase() || '';
    const extNumber = String(card.number || '').toUpperCase();

    // If your card data carries a variant flag, prefer it; otherwise try to infer from name
    const inferredFromName = normalizePrintingLike(card.name);
    const printingTry = [ card.printing || card.variant || inferredFromName, 'normal' ];

    let pricing = null;
    for (const p of printingTry) {
      const key = buildPricingKey({ groupId, extNumber, printing: p, lang: DEFAULT_LANG });
      if (pricingMap[key]) { pricing = pricingMap[key]; break; }
    }

    if (pricing) cardsWithPricing++;

    // shape output
    const out = {
      id: card.id,
      name: card.name,
      number: card.number,
      rarity: card.rarity,
      set: finalSet ? {
        id: finalSet.id,
        name: finalSet.name,
        series: finalSet.series,
        releaseDate: finalSet.releaseDate
      } : {},
      supertype: card.supertype,
      types: card.types || [],
      images: {
        small: card.images?.small,
        large: card.images?.large
      },
      pricing: pricing ? {
        ...pricing,
        groupName: pricing.groupName || finalSet?.name || '',
        groupId: groupId
      } : null
    };

    return out;
  });

  console.log(`🧩 Set enrichment applied to ${setsEnriched} card(s)`);
  console.log(`💷 Cards matched with pricing: ${cardsWithPricing}`);

  // Build search index
  console.log('🔍 Creating search index...');
  const setMap = new Map();
  enrichedCards.forEach(c => { if (c.set?.id && c.set?.name) setMap.set(c.set.id, c.set); });

  const searchIndex = {
    sets: Array.from(setMap.values()).sort((a,b)=>a.name.localeCompare(b.name)),
    types: [...new Set(enrichedCards.flatMap(c => c.types || []))].sort(),
    rarities: [...new Set(enrichedCards.map(c => c.rarity).filter(Boolean))].sort(),
    totalCards: enrichedCards.length,
    totalSets: setMap.size,
    cardsWithPricing: cardsWithPricing,
    approach: 'attach pricing via groupId|extNumber|printing|EN; fallback to normal',
    lastUpdated: new Date().toISOString(),
    pricingSource: pricingData.source,
    pricingUpdated: pricingData.lastUpdated
  };

  // Chunk and save
  console.log('📦 Creating data chunks...');
  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < enrichedCards.length; i += chunkSize) {
    chunks.push(enrichedCards.slice(i, i + chunkSize));
  }

  console.log('💾 Saving optimized files...');
  fs.writeFileSync('data/tcg-cards-index.json', JSON.stringify(searchIndex, null, 2));
  chunks.forEach((chunk, idx) => {
    const payload = { cards: chunk, chunk: idx + 1, totalChunks: chunks.length, lastUpdated: new Date().toISOString() };
    fs.writeFileSync(`data/tcg-cards-chunk-${idx + 1}.json`, JSON.stringify(payload, null, 2));
  });

  const summary = {
    totalCards: enrichedCards.length,
    totalSets: searchIndex.totalSets,
    totalChunks: chunks.length,
    cardsWithPricing,
    pricingCoverage: `${((cardsWithPricing / Math.max(1, enrichedCards.length)) * 100).toFixed(1)}%`,
    lastUpdated: new Date().toISOString()
  };
  fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));

  console.log('📈 Summary:');
  console.log(`   Total cards: ${summary.totalCards}`);
  console.log(`   Total sets: ${summary.totalSets}`);
  console.log(`   Data chunks: ${summary.totalChunks}`);
  console.log(`   Cards with pricing: ${summary.cardsWithPricing} (${summary.pricingCoverage})`);
  console.log('✅ Data merge completed successfully!');
}

try { main(); } catch (err) { console.error('❌ Error merging data:', err.message); process.exit(1); }
