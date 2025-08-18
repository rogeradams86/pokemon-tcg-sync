// debug-pricing.js - COMPLETE VERSION
// Analyze why pricing isn't matching
// Run this script to understand pricing data structure and mismatches

import fs from 'node:fs';

function loadJson(path) {
  if (!fs.existsSync(path)) {
    console.log(`❌ File not found: ${path}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function analyzeCSVHeaders() {
  const csvPath = 'pricing-raw.csv';
  if (!fs.existsSync(csvPath)) {
    console.log('❌ pricing-raw.csv not found');
    return null;
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  console.log('📋 CSV Headers:', headers);
  
  // Show sample data
  if (lines.length > 1) {
    console.log('📄 Sample CSV row:');
    const sampleData = lines[1].split(',').map(d => d.trim().replace(/"/g, ''));
    headers.forEach((header, i) => {
      console.log(`  ${header}: ${sampleData[i] || 'empty'}`);
    });
  }
  
  return { headers, sampleRow: lines[1] };
}

function analyzePricingData() {
  console.log('=== PRICING DATA ANALYSIS ===\n');
  
  // 1. Check raw CSV structure
  console.log('1. 📊 Analyzing raw CSV structure...');
  const csvInfo = analyzeCSVHeaders();
  
  // 2. Check processed pricing data
  console.log('\n2. 💾 Analyzing processed pricing data...');
  const pricingData = loadJson('data/pricing-raw.json');
  
  if (!pricingData) {
    console.log('❌ No processed pricing data found. Run: node scripts/fetch-pricing.js');
    return;
  }
  
  const pricingMap = pricingData.pricing || {};
  const keys = Object.keys(pricingMap);
  
  console.log(`📈 Pricing entries: ${keys.length}`);
  console.log(`📅 Last updated: ${pricingData.lastUpdated}`);
  console.log(`🔗 Source: ${pricingData.source}`);
  
  // Show sample pricing keys and their structure
  console.log('\n📋 Sample pricing keys:');
  keys.slice(0, 10).forEach(key => {
    const data = pricingMap[key];
    console.log(`  ${key}`);
    console.log(`    → ${data.name} | Market: £${data.market} | Low: £${data.low}`);
  });
  
  // Analyze key patterns
  console.log('\n🔍 Key pattern analysis:');
  const keyParts = keys.slice(0, 100).map(key => {
    const parts = key.split('|');
    return {
      groupId: parts[0] || '',
      extNumber: parts[1] || '',
      printing: parts[2] || '',
      lang: parts[3] || ''
    };
  });
  
  const uniqueGroupIds = [...new Set(keyParts.map(k => k.groupId))];
  const uniquePrintings = [...new Set(keyParts.map(k => k.printing))];
  
  console.log(`  Group IDs found: ${uniqueGroupIds.slice(0, 10).join(', ')}${uniqueGroupIds.length > 10 ? '...' : ''}`);
  console.log(`  Printings found: ${uniquePrintings.join(', ')}`);
  console.log(`  Number format samples: ${keyParts.slice(0, 5).map(k => k.extNumber).join(', ')}`);
}

function analyzeCardData() {
  console.log('\n=== CARD DATA ANALYSIS ===\n');
  
  const cardData = loadJson('data/raw-cards.json');
  if (!cardData) {
    console.log('❌ No card data found. Run: node scripts/fetch-cards.js');
    return;
  }
  
  const cards = cardData.cards || [];
  const sets = cardData.sets || [];
  
  console.log(`📦 Total sets: ${sets.length}`);
  console.log(`🃏 Total cards: ${cards.length}`);
  
  // Analyze set ID patterns
  console.log('\n📦 Set ID patterns:');
  sets.slice(0, 10).forEach(set => {
    console.log(`  ${set.id} → ${set.name} (${set.series || 'Unknown series'})`);
  });
  
  // Analyze card number patterns
  console.log('\n🔢 Card number patterns:');
  const numberSamples = cards.slice(0, 20).map(card => ({
    name: card.name,
    number: card.number,
    setId: card.set?.id || 'unknown',
    cardId: card.id
  }));
  
  numberSamples.forEach(sample => {
    console.log(`  ${sample.name}: #${sample.number} (set: ${sample.setId}, id: ${sample.cardId})`);
  });
}

function analyzeMatching() {
  console.log('\n=== MATCHING ANALYSIS ===\n');
  
  const pricingData = loadJson('data/pricing-raw.json');
  const cardData = loadJson('data/raw-cards.json');
  
  if (!pricingData || !cardData) {
    console.log('❌ Missing data files for matching analysis');
    return;
  }
  
  const pricingMap = pricingData.pricing || {};
  const cards = cardData.cards || [];
  
  console.log('🎯 Testing key matching for sample cards...\n');
  
  // Test first 10 cards
  cards.slice(0, 10).forEach(card => {
    console.log(`🃏 Testing: ${card.name}`);
    console.log(`   Set: ${card.set?.name} (${card.set?.id})`);
    console.log(`   Number: ${card.number}`);
    console.log(`   Card ID: ${card.id}`);
    
    // Generate possible keys
    const setId = (card.set?.id || '').toLowerCase();
    const cardNum = String(card.number || '').toUpperCase();
    const keys = [
      `${setId}|${cardNum}|normal|EN`,
      `${setId}|${cardNum}|holo|EN`,
      `${setId}|${cardNum}|reverse|EN`,
      `${setId}|${cardNum.replace(/^0+/, '')}|normal|EN`, // Remove leading zeros
      `${setId}|${cardNum.padStart(3, '0')}|normal|EN`   // Ensure 3 digits
    ];
    
    console.log(`   Trying keys:`);
    keys.forEach(key => {
      const match = pricingMap[key];
      console.log(`     ${key} → ${match ? `✅ ${match.name} (£${match.market})` : '❌ No match'}`);
    });
    
    console.log('');
  });
}

function main() {
  console.log('🔍 POKEMON TCG PRICING DEBUG TOOL\n');
  console.log('This tool helps diagnose pricing data matching issues.\n');
  
  try {
    // Analyze all components
    analyzeCSVHeaders();
    analyzePricingData();
    analyzeCardData();
    analyzeMatching();
    
    console.log('\n=== RECOMMENDATIONS ===\n');
    console.log('1. 📋 Check that your CSV has these key columns:');
    console.log('   - groupId (should match Pokemon set IDs like "base5", "xy1")');
    console.log('   - extNumber (should match card numbers like "025", "25")');
    console.log('   - marketPrice (the price data)');
    console.log('   - subTypeName or extRarity (for print type detection)');
    
    console.log('\n2. 🔧 Common fixes:');
    console.log('   - Make sure groupId in CSV matches set.id in card data');
    console.log('   - Check if card numbers need leading zeros or vice versa');
    console.log('   - Verify printing/rarity terms match between datasets');
    
    console.log('\n3. 🚀 Next steps:');
    console.log('   - Update your CSV if needed');
    console.log('   - Re-run: node scripts/fetch-pricing.js');
    console.log('   - Re-run: node scripts/merge-data.js');
    console.log('   - Check improved pricing coverage');
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

main();
