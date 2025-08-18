/**
 * fetch-pricing.js
 * 
 * Fetches pricing data from TCGCSV (or reads a local JSON),
 * normalizes it, and writes `data/pricing-raw.json` at the REPO ROOT.
 * 
 * Usage examples:
 *  - TCGCSV_URL="https://api.tcgcsv.com/..." node scripts/fetch-pricing.js
 *  - node scripts/fetch-pricing.js ./data/pricing-source.json
 * 
 * Requires Node 18+ (global fetch).
 */
import fs from 'fs';
import path from 'path';
import process from 'process';

const REPO_ROOT = process.cwd();
const DATA_DIR  = path.join(REPO_ROOT, 'data');
const OUTPUT    = path.join(DATA_DIR, 'pricing-raw.json');

// --- helpers ---------------------------------------------------------------
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseFloatSafe(x, def = 0) {
  const n = Number.parseFloat(x);
  return Number.isFinite(n) ? n : def;
}

function cleanStr(s) {
  return String(s ?? '').trim();
}

function toKey(groupId, extNumber, printing, lang = 'EN') {
  return `${(groupId||'').toLowerCase()}|${cleanStr(extNumber)}|${(printing||'normal').toLowerCase()}|${lang}`;
}

function extractNumberFromName(name = '') {
  // Tries to pull a leading card number like "1/102" or "001" from product names
  // Very heuristic but works well for many TCGCSV rows
  const s = String(name);
  const match = s.match(/(^|\s)(\d{1,3})(?:\s*\/\s*\d{1,3})?(\s|$)/);
  if (match) return match[2];
  return null;
}

// --- main ------------------------------------------------------------------
async function main() {
  const start = Date.now();
  ensureDir(DATA_DIR);

  let sourceJson = null;

  // 1) Try environment URL
  const apiUrl = process.env.TCGCSV_URL;
  if (apiUrl) {
    console.log(`Fetching TCGCSV JSON from ${apiUrl} …`);
    const r = await fetch(apiUrl);
    if (!r.ok) {
      console.error(`❌ TCGCSV fetch failed: ${r.status} ${r.statusText}`);
      process.exit(1);
    }
    sourceJson = await r.json();
  } else if (process.argv[2]) {
    // 2) Try local file path argument
    const inputPath = path.resolve(process.argv[2]);
    console.log(`Reading local pricing JSON from ${inputPath} …`);
    const buf = fs.readFileSync(inputPath, 'utf8');
    sourceJson = JSON.parse(buf);
  } else {
    // 3) Fall back to already-prepared data/pricing-raw.json (no-op passthrough)
    if (fs.existsSync(OUTPUT)) {
      console.log('No URL or input file provided; existing data/pricing-raw.json found — leaving as-is.');
      const j = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
      console.log(`Existing pricing entries: ${j.pricing ? Object.keys(j.pricing).length : 0}`);
      process.exit(0);
    } else {
      console.error('❌ No pricing source. Provide TCGCSV_URL or a local JSON path, or ensure data/pricing-raw.json exists.');
      process.exit(2);
    }
  }

  // Expect either an array of rows, or an object with .data array
  const rows = Array.isArray(sourceJson) ? sourceJson : Array.isArray(sourceJson?.data) ? sourceJson.data : [];
  if (!rows.length) {
    console.error('❌ No rows in pricing source.');
    process.exit(1);
  }

  const pricing = {};
  let tcgcsvGroups = 0;
  let mappedGroups = 0;
  let groupsProcessed = 0;
  let groupsFailed = 0;
  let totalProducts = 0;
  let totalPrices = 0;
  let extracted = 0;

  for (const row of rows) {
    // Try to be tolerant to different field names from TCGCSV
    const groupId   = cleanStr(row.groupId || row.setId || row.group_id || row.set_code);
    const groupName = cleanStr(row.groupName || row.setName || row.group_name || row.set_name);
    const productId = row.productId || row.product_id;
    const printing  = cleanStr((row.printing || row.subTypeName || row.finish || 'normal')).toLowerCase();
    const lang      = cleanStr(row.lang || row.language || 'EN').toUpperCase();
    const extNumber = cleanStr(row.extNumber || row.number || row.cardNumber);
    const name      = cleanStr(row.name || row.productName);

    // Price fields
    const low    = parseFloatSafe(row.low ?? row.lowPrice ?? row.lowest_price, 0);
    const mid    = parseFloatSafe(row.mid ?? row.market ?? row.median, 0);
    const high   = parseFloatSafe(row.high ?? row.highPrice ?? row.highest_price, 0);
    const market = parseFloatSafe(row.market ?? row.avg ?? row.mean ?? mid, mid);

    const extractedNumber = extNumber || extractNumberFromName(name);
    if (extractedNumber && !extNumber) extracted++;

    // Record
    const key = toKey(groupId, extractedNumber || extNumber, printing || 'normal', lang || 'EN');
    pricing[key] = {
      key,
      productId,
      name,
      cleanName: name,
      groupId,
      extNumber: extNumber,
      extractedNumber: extractedNumber || null,
      printing: printing || 'normal',
      lang: lang || 'EN',
      low, mid, high, market,
      directLow: parseFloatSafe(row.directLow ?? row.direct_low ?? 0, 0),
      tcgcsvGroupId: row.tcgcsvGroupId || row.groupId || null,
      groupName: groupName || '',
      _raw: {
        product: {},
        price: { subTypeName: printing || 'normal' }
      }
    };

    totalProducts++;
    totalPrices++;
  }

  // Very rough approximations for the summary fields
  tcgcsvGroups = new Set(rows.map(r => r.groupId || r.setId || r.group_id || r.set_code)).size;
  mappedGroups = tcgcsvGroups;
  groupsProcessed = tcgcsvGroups;
  groupsFailed = 0;

  const output = {
    source: 'TCGCSV.com API (with card number extraction)',
    lastUpdated: new Date().toISOString(),
    tcgcsvGroups,
    mappedGroups,
    groupsProcessed,
    groupsFailed,
    totalProducts,
    totalPrices,
    pricingEntries: Object.keys(pricing).length,
    extractionStats: {
      numbersExtracted: extracted,
      numbersFromAPI: 0,
      extractionRate: `${rows.length ? (100*extracted/rows.length).toFixed(1) : '0.0'}%`
    },
    pricing
  };

  ensureDir(DATA_DIR);
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ Wrote ${OUTPUT} with ${output.pricingEntries} pricing entries in ${Date.now()-start}ms.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
