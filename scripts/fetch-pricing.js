// fetch-pricing (2).js — FULL FILE
// Maps TCGCSV -> pricing map using a deterministic key:
//   key = `${groupId}|${extNumber}|${printing}|EN`
// printing is normalized from subTypeName/extRarity (reverse/holo/normal)
//
// CSV HEADERS (as provided):
// productId,name,cleanName,imageUrl,categoryId,groupId,url,modifiedOn,imageCount,extNumber,
// extRarity,extCardType,extHP,extStage,extCardText,extAttack1,extWeakness,extRetreatCost,
// lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName,extAttack2,extResistance

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const csv = require('csv-parser');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, 'pricing-raw.csv');
const OUTPUT_FILE = path.join(__dirname, 'pricing-raw.json');

const DEFAULT_LANG = 'EN';

function normalizePrintingLike(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('reverse')) return 'reverse'; // Reverse Holo, Reverse Foil, etc.
  if (v.includes('holo') || v.includes('foil')) return 'holo';
  return 'normal';
}

function derivePrinting(row) {
  // Prefer explicit subTypeName, then extRarity (often contains Reverse Holofoil etc.)
  return normalizePrintingLike(row.subTypeName || row.extRarity || 'normal');
}

function buildPricingKey({ groupId, extNumber, printing, lang }) {
  return `${String(groupId||'').toLowerCase()}|${String(extNumber||'').toUpperCase()}|${String(printing||'normal').toLowerCase()}|${String(lang||DEFAULT_LANG).toUpperCase()}`;
}

function mapCsvRow(row) {
  const groupId = String(row.groupId || '').toLowerCase();
  const extNumber = String(row.extNumber || '').toUpperCase();
  const printing = derivePrinting(row);
  const lang = DEFAULT_LANG; // CSV does not include language; assume EN

  const key = buildPricingKey({ groupId, extNumber, printing, lang });

  // Numeric coercion with safe defaults
  const low = Number(row.lowPrice || 0) || 0;
  const mid = Number(row.midPrice || 0) || 0;
  const high = Number(row.highPrice || 0) || 0;
  const market = Number(row.marketPrice || mid || 0) || 0;
  const directLow = Number(row.directLowPrice || 0) || 0;

  return [key, {
    key,
    productId: row.productId || '',
    name: row.name || '',
    groupId,
    extNumber,
    printing,
    lang,
    low, mid, high, market, directLow,
    // keep raw for debugging if ever needed
    _raw: {
      extRarity: row.extRarity,
      subTypeName: row.subTypeName
    }
  }];
}

function fetchPricingFromCsv() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(INPUT_FILE)) {
      return reject(new Error(`CSV not found at ${INPUT_FILE}`));
    }

    const parsed = [];
    fs.createReadStream(INPUT_FILE)
      .pipe(csv())
      .on('data', (row) => parsed.push(row))
      .on('end', () => {
        console.log(`📥 Parsed ${parsed.length} pricing rows from ${path.basename(INPUT_FILE)}`);

        const pricingMap = {};
        for (const row of parsed) {
          const [key, obj] = mapCsvRow(row);
          if (key) pricingMap[key] = obj;
        }

        const out = {
          source: 'TCGCSV',
          lastUpdated: new Date().toISOString(),
          pricing: pricingMap
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2));
        console.log(`💾 Saved pricing map with ${Object.keys(pricingMap).length} entries → ${OUTPUT_FILE}`);
        resolve(out);
      })
      .on('error', (err) => reject(err));
  });
}

(async () => {
  try {
    console.log('🔄 Fetching pricing from CSV...');
    await fetchPricingFromCsv();
    console.log('✅ Pricing fetch complete');
  } catch (err) {
    console.error('❌ Error fetching pricing:', err.message);
    process.exit(1);
  }
})();
