// fetch-pricing.js - COMPLETE FIXED VERSION
// No external dependencies - uses only built-in Node.js modules
// Maps TCGCSV -> pricing map using a deterministic key:
//   key = `${groupId}|${extNumber}|${printing}|EN`

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, 'pricing-raw.csv');
const OUTPUT_FILE = path.join(__dirname, 'data', 'pricing-raw.json');

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

function parseCSVLine(line, headers) {
  // Simple CSV parser - handles quoted fields and commas
  const result = {};
  const fields = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add the last field
  fields.push(current.trim());
  
  // Map fields to headers
  headers.forEach((header, index) => {
    result[header] = fields[index] || '';
  });
  
  return result;
}

function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // First line is headers
  const headers = parseCSVLine(lines[0], []).map(h => h.trim());
  const rows = [];
  
  // Parse remaining lines
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      const row = parseCSVLine(lines[i], headers);
      rows.push(row);
    }
  }
  
  return rows;
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
  console.log('🔥 Fetching pricing from CSV...');
  
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`CSV not found at ${INPUT_FILE}`);
  }

  // Create data directory if it doesn't exist
  const dataDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Read and parse CSV
  const csvContent = fs.readFileSync(INPUT_FILE, 'utf8');
  const parsed = parseCSV(csvContent);
  
  console.log(`📥 Parsed ${parsed.length} pricing rows from ${path.basename(INPUT_FILE)}`);

  const pricingMap = {};
  let processedCount = 0;
  
  for (const row of parsed) {
    try {
      const [key, obj] = mapCsvRow(row);
      if (key && obj.groupId && obj.extNumber) {
        pricingMap[key] = obj;
        processedCount++;
      }
    } catch (error) {
      console.warn(`Warning: Failed to process row for ${row.name || 'unknown'}: ${error.message}`);
    }
  }

  const out = {
    source: 'TCGCSV',
    lastUpdated: new Date().toISOString(),
    totalRows: parsed.length,
    processedRows: processedCount,
    pricing: pricingMap
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2));
  console.log(`💾 Saved pricing map with ${Object.keys(pricingMap).length} entries → ${OUTPUT_FILE}`);
  
  // Show some sample entries for debugging
  const sampleEntries = Object.entries(pricingMap).slice(0, 5);
  if (sampleEntries.length > 0) {
    console.log('\n📋 Sample pricing entries:');
    sampleEntries.forEach(([key, data]) => {
      console.log(`  ${key} → ${data.name} (Market: $${data.market})`);
    });
  }
  
  return out;
}

// Main execution
try {
  console.log('🔄 Starting pricing fetch process...');
  const result = fetchPricingFromCsv();
  console.log(`✅ Pricing fetch complete - ${Object.keys(result.pricing).length} entries processed`);
} catch (err) {
  console.error('❌ Error fetching pricing:', err.message);
  
  // Provide helpful debugging info
  console.log('\n🔍 Debugging info:');
  console.log(`  Looking for CSV at: ${INPUT_FILE}`);
  console.log(`  Output will be saved to: ${OUTPUT_FILE}`);
  console.log(`  Current working directory: ${process.cwd()}`);
  console.log(`  Files in current directory: ${fs.readdirSync('.').join(', ')}`);
  
  process.exit(1);
}
