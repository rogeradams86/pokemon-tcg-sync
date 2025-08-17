import fs from 'fs';

function mergeData() {
  console.log('🔄 Merging card data with pricing...');
  
  try {
    // Check if required files exist
    if (!fs.existsSync('data/raw-cards.json')) {
      throw new Error('raw-cards.json not found. Run fetch-cards.js first.');
    }
    
    if (!fs.existsSync('data/pricing-raw.json')) {
      throw new Error('pricing-raw.json not found. Run fetch-pricing.js first.');
    }
    
    // Load raw data
    console.log('📖 Loading raw data...');
    const cardData = JSON.parse(fs.readFileSync('data/raw-cards.json'));
    const pricingData = JSON.parse(fs.readFileSync('data/pricing-raw.json'));
    
    console.log(`📊 Processing ${cardData.cards.length} cards...`);
    console.log(`💰 Available pricing entries: ${Object.keys(pricingData.pricing).length}`);
    
    // Create a set mapping from GitHub set IDs to likely tcgcsv groups
    const setMappings = {
      'base1': 604,     // Base Set
      'base2': 605,     // Base Set 2  
      'fossil1': 630,   // Fossil
      'jungle1': 635,   // Jungle
      'team-rocket': 1373, // Team Rocket
      // Add more mappings as needed
    };
    
    // CONSERVATIVE: Helper function to find pricing for a card
    function findPricing(card) {
      const cardName = card.name.toLowerCase();
      const setName = (card.set?.name || '').toLowerCase();
      const cardId = card.id || '';
      const setId = card.set?.id || '';
      
      // Strategy 1: Try exact set mapping first
      if (setId && setMappings[setId]) {
        const expectedGroupId = setMappings[setId];
        
        // Look for pricing entries that match both card name AND expected group
        for (const [pricingKey, pricingValue] of Object.entries(pricingData.pricing)) {
          if (pricingValue.groupId === expectedGroupId && 
              pricingKey.toLowerCase().includes(cardName)) {
            console.log(`🎯 Set-specific match: ${cardName} -> ${pricingValue.groupName}`);
            return pricingValue;
          }
        }
      }
      
      // Strategy 2: Try conservative name matching (no fuzzy matching)
      const searchKeys = [
        `${cardName}|${setName}`, // Exact match with set
        cardName, // Just card name
        cardName.replace(/[^\w\s]/g, ''), // Remove special characters
      ];
      
      for (const key of searchKeys) {
        if (key && pricingData.pricing[key]) {
          console.log(`📍 Direct match: ${cardName} -> ${pricingData.pricing[key].groupName}`);
          return pricingData.pricing[key];
        }
      }
      
      // Strategy 3: DISABLED fuzzy matching to prevent wrong assignments
      // (We were getting too many incorrect matches like Base Set cards -> SWSH sets)
      
      console.log(`❌ No pricing found for: ${cardName} (${setId})`);
      return null;
    }
    
    // Merge cards with pricing
    let cardsWithPricing = 0;
    let setNameUpdates = 0;
    let incorrectMatches = 0;
    
    const enrichedCards = cardData.cards.map(card => {
      const pricing = findPricing(card);
      
      if (pricing) {
        cardsWithPricing++;
        
        // Sanity check: warn about potential incorrect matches
        const originalSetId = card.set?.id || '';
        const newSetName = pricing.groupName || '';
        
        // Flag suspicious matches (Base Set cards getting modern set names)
        if (originalSetId.startsWith('base') && newSetName.includes('SW')) {
          console.log(`⚠️  Suspicious match: ${card.name} (${originalSetId}) -> ${newSetName}`);
          incorrectMatches++;
        }
      }
      
      // Use tcgcsv set names when available, fallback to GitHub data
      let finalSetData;
      if (pricing && pricing.groupName) {
        // Prioritize tcgcsv set information
        finalSetData = {
          id: pricing.groupId || card.set?.id,
          name: pricing.groupName, // Use tcgcsv set name
          series: card.set?.series, // Keep original series info
          releaseDate: card.set?.releaseDate // Keep original release date
        };
        setNameUpdates++;
      } else {
        // Fallback to original GitHub set data
        finalSetData = {
          id: card.set?.id,
          name: card.set?.name,
          series: card.set?.series,
          releaseDate: card.set?.releaseDate
        };
      }
      
      return {
        id: card.id,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        set: finalSetData,
        supertype: card.supertype,
        types: card.types || [],
        images: {
          small: card.images?.small,
          large: card.images?.large
        },
        pricing: pricing
      };
    });
    
    // Create search index with correct set data
    console.log('🔍 Creating search index...');
    
    // Get unique sets from the enriched data
    const setMap = new Map();
    enrichedCards.forEach(card => {
      if (card.set?.id && card.set?.name) {
        setMap.set(card.set.id, {
          id: card.set.id,
          name: card.set.name,
          series: card.set.series,
          releaseDate: card.set.releaseDate
        });
      }
    });
    
    const searchIndex = {
      sets: Array.from(setMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      types: [...new Set(enrichedCards.flatMap(c => c.types || []))].sort(),
      rarities: [...new Set(enrichedCards.map(c => c.rarity).filter(Boolean))].sort(),
      totalCards: enrichedCards.length,
      totalSets: setMap.size,
      cardsWithPricing: cardsWithPricing,
      setNameUpdates: setNameUpdates,
      incorrectMatches: incorrectMatches, // Track suspicious matches
      lastUpdated: new Date().toISOString(),
      pricingSource: pricingData.source,
      pricingUpdated: pricingData.lastUpdated
    };
    
    // Split cards into chunks (500 cards each for faster loading)
    console.log('📦 Creating data chunks...');
    const chunkSize = 500;
    const chunks = [];
    
    for (let i = 0; i < enrichedCards.length; i += chunkSize) {
      chunks.push(enrichedCards.slice(i, i + chunkSize));
    }
    
    // Save optimized files
    console.log('💾 Saving optimized files...');
    
    // Save search index
    fs.writeFileSync('data/tcg-cards-index.json', JSON.stringify(searchIndex, null, 2));
    console.log(`✅ Search index saved (${searchIndex.totalCards} cards, ${searchIndex.totalSets} sets)`);
    
    // Save chunks
    chunks.forEach((chunk, index) => {
      const chunkData = {
        cards: chunk,
        chunk: index + 1,
        totalChunks: chunks.length,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(`data/tcg-cards-chunk-${index + 1}.json`, JSON.stringify(chunkData, null, 2));
    });
    
    console.log(`✅ Created ${chunks.length} data chunks`);
    
    // Create summary
    const summary = {
      totalCards: enrichedCards.length,
      totalSets: setMap.size,
      totalChunks: chunks.length,
      cardsWithPricing: cardsWithPricing,
      setNameUpdates: setNameUpdates,
      incorrectMatches: incorrectMatches,
      pricingCoverage: `${((cardsWithPricing / enrichedCards.length) * 100).toFixed(1)}%`,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));
    
    console.log('📈 Summary:');
    console.log(`   Total cards: ${summary.totalCards}`);
    console.log(`   Total sets: ${summary.totalSets}`);
    console.log(`   Data chunks: ${summary.totalChunks}`);
    console.log(`   Cards with pricing: ${summary.cardsWithPricing} (${summary.pricingCoverage})`);
    console.log(`   🆕 Set names updated from tcgcsv: ${setNameUpdates}`);
    console.log(`   ⚠️  Suspicious matches: ${incorrectMatches}`);
    console.log('✅ Data merge completed successfully!');
    
  } catch (error) {
    console.error('❌ Error merging data:', error.message);
    process.exit(1);
  }
}

// Run the function
mergeData();
