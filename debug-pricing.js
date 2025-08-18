// enhanced-debug.js - Find exactly why pricing keys don't match
import fs from 'node:fs';

function parseCSVLine(line, headers) {
  const result = {};
  const fields = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  fields.push(current.trim());
  
  headers.forEach((header, index) => {
    result[header] = fields[index] || '';
  });
  
  return result;
}

function analyzeCSVData() {
  console.log('=== ANALYZING YOUR CSV DATA ===\n');
  
  if (!fs.existsSync('pricing-raw.csv')) {
    console.log('❌ pricing-raw.csv not found!');
    return null;
  }
  
  const csvContent = fs.readFileSync('pricing-raw.csv', 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    console.log('❌ CSV file is empty!');
    return null;
  }
  
  // Parse headers
  const headers = parseCSVLine(lines[0], []).map(h => h.trim().replace(/"/g, ''));
  console.log('📋 CSV Headers:', headers);
  
  // Check for required columns
  const requiredColumns = ['groupId', 'extNumber', 'marketPrice'];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  
  if (missingColumns.length > 0) {
    console.log(`❌ Missing required columns: ${missingColumns.join(', ')}`);
    console.log('💡 Your CSV needs these columns: groupId, extNumber, marketPrice');
    return null;
  }
  
  console.log('✅ All required columns found');
  
  // Parse sample rows
  const sampleRows = [];
  for (let i = 1; i <= Math.min(10, lines.length - 1); i++) {
    const row = parseCSVLine(lines[i], headers);
    sampleRows.push(row);
  }
  
  console.log('\n📄 Sample CSV data:');
  sampleRows.forEach((row, i) => {
    console.log(`Row ${i + 1}:`);
    console.log(`  groupId: "${row.groupId}"`);
    console.log(`  extNumber: "${row.extNumber}"`);
    console.log(`  marketPrice: "${row.marketPrice}"`);
    console.log(`  name: "${row.name || 'N/A'}"`);
    
    // Generate the key that would be created
    const key = `${String(row.groupId || '').toLowerCase()}|${String(row.extNumber || '').toUpperCase()}|normal|EN`;
    console.log(`  Generated key: "${key}"`);
    console.log('');
  });
  
  return { headers, sampleRows };
}

function analyzeCardData() {
  console.log('=== ANALYZING POKEMON CARD DATA ===\n');
  
  if (!fs.existsSync('data/raw-cards.json')) {
    console.log('❌ data/raw-cards.json not found!');
    console.log('💡 Run: node scripts/fetch-cards.js first');
    return null;
  }
  
  const cardData = JSON.parse(fs.readFileSync('data/raw-cards.json', 'utf8'));
  const cards = cardData.cards || [];
  const sets = cardData.sets || [];
  
  console.log(`📦 Total sets: ${sets.length}`);
  console.log(`🃏 Total cards: ${cards.length}`);
  
  // Show sample set IDs
  console.log('\n📦 Sample set IDs from Pokemon data:');
  sets.slice(0, 10).forEach(set => {
    console.log(`  "${set.id}" → ${set.name}`);
  });
  
  // Show sample cards and what keys they would generate
  console.log('\n🃏 Sample cards and their potential keys:');
  cards.slice(0, 10).forEach(card => {
    const setId = (card.set?.id || '').toLowerCase();
    const cardNum = String(card.number || '').toUpperCase();
    const key = `${setId}|${cardNum}|normal|EN`;
    
    console.log(`  ${card.name}`);
    console.log(`    Set: "${card.set?.id}" (${card.set?.name})`);
    console.log(`    Number: "${card.number}"`);
    console.log(`    Generated key: "${key}"`);
    console.log('');
  });
  
  return { cards, sets };
}

function compareKeyFormats(csvData, cardData) {
  console.log('=== COMPARING KEY FORMATS ===\n');
  
  if (!csvData || !cardData) {
    console.log('❌ Missing data for comparison');
    return;
  }
  
  // Get unique groupIds from CSV
  const csvGroupIds = [...new Set(csvData.sampleRows.map(row => row.groupId))];
  console.log('📋 GroupIds in your CSV:', csvGroupIds);
  
  // Get unique set IDs from Pokemon data
  const pokemonSetIds = [...new Set(cardData.sets.map(set => set.id))];
  console.log('🃏 Set IDs in Pokemon data:', pokemonSetIds.slice(0, 20));
  
  // Check for matches
  const matches = csvGroupIds.filter(csvId => 
    pokemonSetIds.some(pokeId => 
      pokeId.toLowerCase() === csvId.toLowerCase()
    )
  );
  
  console.log(`\n🎯 Matching set IDs: ${matches.length}/${csvGroupIds.length}`);
  if (matches.length > 0) {
    console.log('✅ Found matches:', matches);
  } else {
    console.log('❌ NO MATCHES FOUND!');
    console.log('\n💡 This is why pricing is failing!');
    console.log('🔧 Your CSV groupId values need to match Pokemon set IDs');
  }
  
  // Check number formats
  console.log('\n🔢 Number format comparison:');
  const csvNumbers = csvData.sampleRows.map(row => row.extNumber).slice(0, 5);
  const pokeNumbers = cardData.cards.map(card => card.number).slice(0, 5);
  
  console.log('📋 CSV extNumbers:', csvNumbers);
  console.log('🃏 Pokemon card numbers:', pokeNumbers);
}

function suggestFixes(csvData, cardData) {
  console.log('\n=== SUGGESTED FIXES ===\n');
  
  if (!csvData || !cardData) return;
  
  const csvGroupIds = [...new Set(csvData.sampleRows.map(row => row.groupId))];
  const pokemonSetIds = [...new Set(cardData.sets.map(set => set.id))];
  
  console.log('🔧 To fix your pricing integration:');
  console.log('');
  
  console.log('1. 📋 Update your CSV groupId column:');
  csvGroupIds.slice(0, 5).forEach(csvId => {
    // Try to find similar Pokemon set IDs
    const similar = pokemonSetIds.filter(pokeId => 
      pokeId.toLowerCase().includes(csvId.toLowerCase()) ||
      csvId.toLowerCase().includes(pokeId.toLowerCase())
    );
    
    if (similar.length > 0) {
      console.log(`   "${csvId}" → should be "${similar[0]}" (found similar: ${similar.join(', ')})`);
    } else {
      console.log(`   "${csvId}" → no similar Pokemon set found`);
    }
  });
  
  console.log('\n2. 🎯 Common Pokemon set ID patterns:');
  console.log('   Base sets: base1, base2, base3, base4, base5');
  console.log('   XY series: xy1, xy2, xy3, xy4, xy5, xy6, xy7, xy8, xy9, xy10, xy11, xy12');
  console.log('   Sun & Moon: sm1, sm2, sm3, sm4, sm5, sm6, sm7, sm8, sm9, sm10, sm11, sm12');
  console.log('   Sword & Shield: swsh1, swsh2, swsh3, swsh4, swsh5, swsh6, swsh7, swsh8, swsh9, swsh10, swsh11, swsh12');
  console.log('   Scarlet & Violet: sv1, sv2, sv3, sv4, sv5, sv6, sv7, sv8');
  
  console.log('\n3. ✏️ Update your CSV file:');
  console.log('   - Change groupId values to match Pokemon set IDs exactly');
  console.log('   - Make sure extNumber matches card numbers (with or without leading zeros)');
  console.log('   - Re-run the pricing pipeline');
  
  console.log('\n4. 🚀 After fixing your CSV:');
  console.log('   node scripts/fetch-pricing.js');
  console.log('   node scripts/merge-data.js');
  console.log('   node enhanced-debug.js  # to verify fixes');
}

function main() {
  console.log('🔍 ENHANCED POKEMON TCG PRICING DEBUG\n');
  console.log('This will find exactly why your pricing isn\'t matching.\n');
  
  try {
    const csvData = analyzeCSVData();
    const cardData = analyzeCardData();
    
    if (csvData && cardData) {
      compareKeyFormats(csvData, cardData);
      suggestFixes(csvData, cardData);
    }
    
    console.log('\n=== SUMMARY ===');
    console.log('The main issue is likely that your CSV groupId values');
    console.log('don\'t match the Pokemon TCG set IDs exactly.');
    console.log('Update your CSV file and re-run the pricing pipeline!');
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

main();
