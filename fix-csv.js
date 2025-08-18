// fix-csv.js - Automatically fix common groupId mismatches
import fs from 'node:fs';

// Common mappings from CSV names to Pokemon set IDs
const SET_MAPPINGS = {
  // Base sets
  'base set': 'base1',
  'base': 'base1',
  'jungle': 'base2',
  'fossil': 'base3',
  'base set 2': 'base4',
  'team rocket': 'base5',
  
  // Gym sets
  'gym heroes': 'gym1',
  'gym challenge': 'gym2',
  
  // Neo sets
  'neo genesis': 'neo1',
  'neo discovery': 'neo2',
  'neo destiny': 'neo3',
  'neo revelation': 'neo4',
  
  // E-Card series
  'expedition': 'ecard1',
  'aquapolis': 'ecard2',
  'skyridge': 'ecard3',
  
  // XY series
  'xy': 'xy1',
  'xy base': 'xy1',
  'flashfire': 'xy2',
  'furious fists': 'xy3',
  'phantom forces': 'xy4',
  'primal clash': 'xy5',
  'roaring skies': 'xy6',
  'ancient origins': 'xy7',
  'breakthrough': 'xy8',
  'xy breakthrough': 'xy8',
  'breakpoint': 'xy9',
  'xy breakpoint': 'xy9',
  'generations': 'xy10',
  'fates collide': 'xy11',
  'steam siege': 'xy12',
  'evolutions': 'xy13',
  
  // Sun & Moon series
  'sun moon': 'sm1',
  'sun & moon': 'sm1',
  'guardians rising': 'sm2',
  'burning shadows': 'sm3',
  'crimson invasion': 'sm4',
  'ultra prism': 'sm5',
  'forbidden light': 'sm6',
  'celestial storm': 'sm7',
  'lost thunder': 'sm8',
  'team up': 'sm9',
  'detective pikachu': 'sm10',
  'unbroken bonds': 'sm11',
  'unified minds': 'sm12',
  'cosmic eclipse': 'sm13',
  
  // Sword & Shield series
  'sword shield': 'swsh1',
  'sword & shield': 'swsh1',
  'rebel clash': 'swsh2',
  'darkness ablaze': 'swsh3',
  'champions path': 'swsh35',
  'vivid voltage': 'swsh4',
  'battle styles': 'swsh5',
  'chilling reign': 'swsh6',
  'evolving skies': 'swsh7',
  'fusion strike': 'swsh8',
  'brilliant stars': 'swsh9',
  'astral radiance': 'swsh10',
  'pokemon go': 'pgo',
  'lost origin': 'swsh11',
  'silver tempest': 'swsh12',
  
  // Scarlet & Violet series
  'scarlet violet': 'sv1',
  'scarlet & violet': 'sv1',
  'paldea evolved': 'sv2',
  'obsidian flames': 'sv3',
  'pokemon 151': 'sv3pt5',
  '151': 'sv3pt5',
  'paradox rift': 'sv4',
  'paldean fates': 'sv4pt5',
  'temporal forces': 'sv5',
  'twilight masquerade': 'sv6',
  'shrouded fable': 'sv7',
  'stellar crown': 'sv8'
};

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

function buildCSVLine(row, headers) {
  return headers.map(header => {
    const value = String(row[header] || '');
    // Quote values that contain commas or quotes
    if (value.includes(',') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }).join(',');
}

function fixCSV() {
  console.log('🔧 FIXING CSV GROUPID VALUES...\n');
  
  if (!fs.existsSync('pricing-raw.csv')) {
    console.log('❌ pricing-raw.csv not found!');
    return;
  }
  
  // Read and parse CSV
  const csvContent = fs.readFileSync('pricing-raw.csv', 'utf8');
  const lines = csvContent.split('\n');
  
  if (lines.length === 0) {
    console.log('❌ CSV file is empty!');
    return;
  }
  
  // Parse headers
  const headers = parseCSVLine(lines[0], []).map(h => h.trim().replace(/"/g, ''));
  console.log('📋 CSV Headers:', headers);
  
  if (!headers.includes('groupId')) {
    console.log('❌ No groupId column found!');
    return;
  }
  
  // Create backup
  const backupFile = 'pricing-raw-backup.csv';
  fs.writeFileSync(backupFile, csvContent);
  console.log(`💾 Created backup: ${backupFile}`);
  
  // Process rows
  const newLines = [lines[0]]; // Keep header as-is
  let fixedCount = 0;
  const fixedMappings = new Map();
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const row = parseCSVLine(lines[i], headers);
    const originalGroupId = row.groupId;
    const normalizedGroupId = originalGroupId.toLowerCase().trim();
    
    // Try to find a mapping
    let newGroupId = originalGroupId;
    if (SET_MAPPINGS[normalizedGroupId]) {
      newGroupId = SET_MAPPINGS[normalizedGroupId];
      fixedCount++;
      
      if (!fixedMappings.has(originalGroupId)) {
        fixedMappings.set(originalGroupId, newGroupId);
      }
    }
    
    // Update the row
    row.groupId = newGroupId;
    
    // Rebuild the line
    newLines.push(buildCSVLine(row, headers));
  }
  
  // Write the fixed CSV
  fs.writeFileSync('pricing-raw.csv', newLines.join('\n'));
  
  console.log(`\n✅ Fixed ${fixedCount} groupId values:`);
  fixedMappings.forEach((newId, oldId) => {
    console.log(`   "${oldId}" → "${newId}"`);
  });
  
  console.log(`\n📁 Files:`);
  console.log(`   pricing-raw.csv (updated with fixes)`);
  console.log(`   ${backupFile} (original backup)`);
  
  console.log(`\n🚀 Next steps:`);
  console.log(`   1. Review the changes above`);
  console.log(`   2. Run: node scripts/fetch-pricing.js`);
  console.log(`   3. Run: node scripts/merge-data.js`);
  console.log(`   4. Check pricing coverage improved!`);
  
  if (fixedCount === 0) {
    console.log(`\n⚠️  No automatic fixes found.`);
    console.log(`   Your groupId values might need manual updating.`);
    console.log(`   Run: node enhanced-debug.js to see specific issues.`);
  }
}

fixCSV();
