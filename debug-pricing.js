/**
 * debug-pricing.js
 * 
 * Enhanced debugging with more detailed output and configurable thresholds.
 */
import fs from 'fs';
import path from 'path';
import process from 'process';

const REPO_ROOT = process.cwd();
const PRICING_PATH = path.join(REPO_ROOT, 'data', 'pricing-raw.json');
const CARDS_PATH = path.join(REPO_ROOT, 'data', 'cards-all.json');

// More lenient default threshold for development
const THRESHOLD = Number.parseInt(process.env.MIN_PRICING_ENTRIES || '10', 10);
const STRICT_MODE = process.env.STRICT_PRICING === 'true';

console.log('🔍 PRICING DEBUG REPORT');
console.log('=' .repeat(50));

// Check if files exist
if (!fs.existsSync(PRICING_PATH)) {
  console.error('❌ data/pricing-raw.json not found');
  if (STRICT_MODE) process.exit(2);
  console.log('⚠️  Continuing without pricing data...');
  process.exit(0);
}

const pricingData = JSON.parse(fs.readFileSync(PRICING_PATH, 'utf8'));
const pricingEntries = pricingData?.pricing ? Object.keys(pricingData.pricing).length : 0;

console.log(`📊 Pricing Source: ${pricingData.source || 'unknown'}`);
console.log(`📅 Last Updated: ${pricingData.lastUpdated || 'unknown'}`);
console.log(`🔢 Pricing Entries: ${pricingEntries}`);
console.log(`🎯 Required Threshold: ${THRESHOLD}`);
console.log(`⚡ Strict Mode: ${STRICT_MODE ? 'ON' : 'OFF'}`);

// Show sample entries if available
if (pricingEntries > 0) {
  console.log('\n📋 Sample Pricing Entries:');
  const sampleKeys = Object.keys(pricingData.pricing).slice(0, 5);
  sampleKeys.forEach(key => {
    const entry = pricingData.pricing[key];
    console.log(`   ${key} → $${entry.market || entry.mid || 'N/A'}`);
  });
  
  // Show statistics
  if (pricingData.tcgcsvGroups) {
    console.log(`\n📈 TCGCSV Stats:`);
    console.log(`   Groups: ${pricingData.tcgcsvGroups}`);
    console.log(`   Products: ${pricingData.totalProducts || 0}`);
    console.log(`   Extraction Rate: ${pricingData.extractionStats?.extractionRate || 'N/A'}`);
  }
}

// Check card data if available
if (fs.existsSync(CARDS_PATH)) {
  const cardsData = JSON.parse(fs.readFileSync(CARDS_PATH, 'utf8'));
  const cardCount = Array.isArray(cardsData) ? cardsData.length : 0;
  console.log(`\n🎴 Card Data: ${cardCount} cards available`);
  
  if (cardCount > 0 && pricingEntries > 0) {
    const estimatedCoverage = Math.min(100, (pricingEntries / cardCount * 100)).toFixed(1);
    console.log(`📊 Estimated Coverage: ~${estimatedCoverage}%`);
  }
}

console.log('\n' + '=' .repeat(50));

// Determine if we should fail
if (pricingEntries < THRESHOLD) {
  if (STRICT_MODE) {
    console.error(`❌ FAILED: Too few pricing entries (${pricingEntries} < ${THRESHOLD})`);
    console.error('💡 Solutions:');
    console.error('   1. Check TCGCSV_URL secret is configured');
    console.error('   2. Verify TCGCSV API is accessible');
    console.error('   3. Set STRICT_PRICING=false for development');
    console.error('   4. Lower MIN_PRICING_ENTRIES threshold');
    process.exit(1);
  } else {
    console.log(`⚠️  WARNING: Low pricing entries (${pricingEntries} < ${THRESHOLD})`);
    console.log('📝 Continuing in non-strict mode...');
  }
} else {
  console.log(`✅ SUCCESS: Pricing entries OK (${pricingEntries} >= ${THRESHOLD})`);
}

console.log('🏁 Debug completed successfully');
