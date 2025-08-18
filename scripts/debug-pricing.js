/**
 * debug-pricing.js
 * 
 * Prints pricing coverage and fails (exit 1) if entries < threshold.
 */
import fs from 'fs';
import path from 'path';
import process from 'process';

const REPO_ROOT = process.cwd();
const P = path.join(REPO_ROOT, 'data', 'pricing-raw.json');
const THRESHOLD = Number.parseInt(process.env.MIN_PRICING_ENTRIES || '100', 10);

if (!fs.existsSync(P)) {
  console.error('❌ data/pricing-raw.json not found');
  process.exit(2);
}

const j = JSON.parse(fs.readFileSync(P, 'utf8'));
const n = j?.pricing ? Object.keys(j.pricing).length : 0;
console.log(`pricingEntries=${n}`);
if (n < THRESHOLD) {
  console.error(`❌ Too few pricing entries (< ${THRESHOLD}).`);
  process.exit(1);
}
console.log('✅ Pricing entries OK');
