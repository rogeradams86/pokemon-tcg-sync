// fetch-cards.js - COMPLETE VERSION with built-in modules only
import fs from 'fs';
import https from 'https';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          reject(new Error(`Failed to parse JSON from ${url}: ${error.message}`));
        }
      });
    });
    
    request.on('error', (error) => {
      reject(new Error(`Request failed for ${url}: ${error.message}`));
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error(`Request timeout for ${url}`));
    });
  });
}

async function fetchCardData() {
  console.log('🔥 Fetching Pokemon TCG data from GitHub...');
  
  try {
    // 1. Fetch sets list
    console.log('Fetching sets list...');
    const setsData = await fetchJSON('https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json');
    const sets = setsData.data || setsData; // Handle different response formats
    
    console.log(`Found ${sets.length} sets`);
    
    // 2. Fetch all cards from all sets
    const allCards = [];
    let processedSets = 0;
    
    for (const set of sets) {
      try {
        console.log(`Fetching cards for set: ${set.name} (${processedSets + 1}/${sets.length})`);
        
        const cardsData = await fetchJSON(
          `https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/${set.id}.json`
        );
        
        const cards = cardsData.data || cardsData; // Handle different response formats
        
        if (Array.isArray(cards)) {
          allCards.push(...cards);
          console.log(`  ✅ Added ${cards.length} cards from ${set.name}`);
        }
        
        processedSets++;
        
        // Small delay to be nice to GitHub
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`  ⚠️ Failed to fetch ${set.name}: ${error.message}`);
      }
    }
    
    console.log(`📊 Total cards fetched: ${allCards.length}`);
    
    // 3. Create data directory if it doesn't exist
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    // 4. Save raw data
    const rawData = {
      sets: sets,
      cards: allCards,
      lastUpdated: new Date().toISOString(),
      totalSets: sets.length,
      totalCards: allCards.length
    };
    
    fs.writeFileSync('data/raw-cards.json', JSON.stringify(rawData, null, 2));
    
    console.log('✅ Card data saved to data/raw-cards.json');
    console.log(`📈 Summary: ${sets.length} sets, ${allCards.length} cards`);
    
  } catch (error) {
    console.error('❌ Error fetching card data:', error.message);
    process.exit(1);
  }
}

// Run the function
fetchCardData().catch(console.error);
