// merge-data.js - COMPLETE FIXED VERSION with enhanced pricing key matching
// Enhanced debugging and multiple matching strategies

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

// ENHANCED: Multiple strategies for number matching
function normalizeCardNumber(num) {
  if (!num) return [''];
  const str = String(num).toUpperCase();
  
  // Return multiple variations to try
  return [
    str,                    // Original: "025"
    str.replace(/^0+/, ''), // Remove leading zeros: "25"
    str.padStart(3, '0'),   // Ensure 3 digits: "025"
    str.replace(/[^0-9A-Z]/g, '') // Remove special chars
  ].filter(v => v); // Remove empty strings
}

// ENHANCED: Multiple strategies for set ID matching
function normalizeSetId(setId) {
  if (!setId) return [''];
  const str = String(setId).toLowerCase();
  
  return [
    str,                    // Original: "base5"
    str.replace(/[^a-z0-9]/g, ''), // Remove special chars
    str.replace('base', 'bs'),     // Common abbreviation
    str.replace('bs', 'base'),     // Reverse abbreviation
    str.replace(/(\d+)$/, ''),     // Remove trailing numbers: "base5" -> "base"
    str + '1',              // Add 1 if missing: "base" -> "base1"
  ].filter(v => v); // Remove empty strings
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function hasKeys(obj) { return obj && typeof obj === 'object' && Object.keys(obj).length > 0; }

function main() {
  console.log('🔄 Merging card data with pricing (ENHANCED VERSION)...');

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

  // DEBUGGING: Show sample pricing keys
  console.log('\n🔍 Sample pricing keys from CSV:');
  Object.keys(pricingMap).slice(0, 10).forEach(key => {
    const data = pricingMap[key];
    console.log(`  ${key} → ${data.name} (£${data.market})`);
  });

  // Build set index by id (e.g., base5)
  const setIndex = new Map();
  for (const s of allSets) {
    if (s && s.id) setIndex.set(String(s.id).toLowerCase(), s);
  }

  let cardsWithPricing = 0;
  let setsEnriched = 0;
  let pricingAttempts = 0;
  let successfulMatches = 0;

  const enrichedCards = allCards.map((card, index) => {
    // Show progress for large datasets
    if (index % 1000 === 0) {
      console.log(`Processing card ${index + 1}/${allCards.length}...`);
    }

    // Ensure card.set is populated
    let finalSet = hasKeys(card.set) ? card.set : null;
    if (!finalSet) {
      const code = toSetCodeFromIdOrUrl(card.id, card.images?.small || card.images?.large);
      const s = code ? setIndex.get(code) : null;
      if (s) { finalSet = s; setsEnriched++; }
      else { finalSet = {}; }
    }

    // ENHANCED: Try multiple matching strategies
    const setVariations = normalizeSetId(finalSet?.id || toSetCodeFromIdOrUrl(card.id));
    const numberVariations = normalizeCardNumber(card.number);
    const printingVariations = [ 
      card.printing || card.variant || normalizePrintingLike(card.name), 
      'normal', 
      'holo', 
      'reverse' 
    ];

    let pricing = null;
    let matchedKey = null;

    // Try all combinations
    outerLoop: for (const setId of setVariations) {
      for (const cardNum of numberVariations) {
        for (const printing of printingVariations) {
          pricingAttempts++;
          const key = buildPricingKey({ 
            groupId: setId, 
            extNumber: cardNum, 
            printing: printing, 
            lang: DEFAULT_LANG 
          });
          
          if (pricingMap[key]) {
            pricing = pricingMap[key];
            matchedKey = key;
            successfulMatches++;
            break outerLoop;
          }
        }
      }
    }

    if (pricing) {
      cardsWithPricing++;
      
      // Debug successful matches for first few cards
      if (cardsWithPricing <= 5) {
        console.log(`✅ MATCH: ${card.name} matched with key: ${matchedKey}`);
      }
    } else {
      // Debug failed matches for first few cards
      if (index < 10) {
        console.log(`❌ NO MATCH: ${card.name}`);
        console.log(`   Tried set variations: ${setVariations.join(', ')}`);
        console.log(`   Tried number variations: ${numberVariations.join(', ')}`);
        console.log(`   Card set ID: ${finalSet?.id || 'none'}`);
        console.log(`   Card number: ${card.number || 'none'}`);
      }
    }

    // Build output
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
        groupId: pricing.groupId,
        matchedKey: matchedKey // For debugging
      } : null
    };

    return out;
  });

  console.log(`\n🔍 PRICING MATCH ANALYSIS:`);
  console.log(`🧩 Set enrichment applied to ${setsEnriched} card(s)`);
  console.log(`🎯 Total pricing attempts: ${pricingAttempts}`);
  console.log(`✅ Successful matches: ${successfulMatches}`);
  console.log(`💷 Cards matched with pricing: ${cardsWithPricing}`);
  console.log(`📈 Pricing coverage: ${((cardsWithPricing / Math.max(1, allCards.length)) * 100).toFixed(1)}%`);

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
    pricingCoverage: ((cardsWithPricing / Math.max(1, enrichedCards.length)) * 100).toFixed(1) + '%',
    approach: 'enhanced multi-strategy pricing key matching',
    lastUpdated: new Date().toISOString(),
    pricingSource: pricingData.source,
    pricingUpdated: pricingData.lastUpdated,
    pricingStats: {
      totalAttempts: pricingAttempts,
      successfulMatches: successfulMatches,
      successRate: ((successfulMatches / Math.max(1, pricingAttempts)) * 100).toFixed(1) + '%'
    }
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
    const payload = { 
      cards: chunk, 
      chunk: idx + 1, 
      totalChunks: chunks.length, 
      lastUpdated: new Date().toISOString() 
    };
    fs.writeFileSync(`data/tcg-cards-chunk-${idx + 1}.json`, JSON.stringify(payload, null, 2));
  });

  const summary = {
    totalCards: enrichedCards.length,
    totalSets: searchIndex.totalSets,
    totalChunks: chunks.length,
    cardsWithPricing,
    pricingCoverage: searchIndex.pricingCoverage,
    pricingStats: searchIndex.pricingStats,
    lastUpdated: new Date().toISOString()
  };
  fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));

  console.log('\n📈 FINAL SUMMARY:');
  console.log(`   Total cards: ${summary.totalCards}`);
  console.log(`   Total sets: ${summary.totalSets}`);
  console.log(`   Data chunks: ${summary.totalChunks}`);
  console.log(`   Cards with pricing: ${summary.cardsWithPricing} (${summary.pricingCoverage})`);
  console.log(`   Pricing success rate: ${summary.pricingStats.successRate}`);
  console.log('✅ Enhanced data merge completed successfully!');
}

try { main(); } catch (err) { console.error('❌ Error merging data:', err.message); process.exit(1); }
