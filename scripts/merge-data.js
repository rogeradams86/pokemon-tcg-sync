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
    
    // ENHANCED: Helper function to find pricing for a card with better matching
    function findPricing(card) {
      const cardName = card.name.toLowerCase();
      const setName = (card.set?.name || '').toLowerCase();
      const cardId = card.id || '';
      
      // Try multiple search strategies (enhanced)
      const searchKeys = [
        `${cardName}|${setName}`, // Exact match
        cardName, // Just card name
        cardName.replace(/[^\w\s]/g, ''), // Remove special characters
        `${cardName.replace(/[^\w\s]/g, '')}|${setName}`,
        // NEW: Try searching by partial ID match
        cardId.toLowerCase(),
        cardName.replace(/['-]/g, '').replace(/\s+/g, ' ').trim() // Normalize spaces and hyphens
      ];
      
      for (const key of searchKeys) {
        if (key && pricingData.pricing[key]) {
          return pricingData.pricing[key];
        }
      }
      
      // NEW: Fuzzy matching - try to find pricing entries that contain the card name
      const cardNameWords = cardName.split(' ').filter(word => word.length > 2);
      for (const [pricingKey, pricingValue] of Object.entries(pricingData.pricing)) {
        if (cardNameWords.length > 0 && cardNameWords.every(word => pricingKey.includes(word))) {
          console.log(`📍 Fuzzy match found: "${cardName}" -> "${pricingKey}"`);
          return pricingValue;
        }
      }
      
      return null;
    }
    
    // Merge cards with pricing
    let cardsWithPricing = 0;
    let setNameUpdates = 0;
    
    const enrichedCards = cardData.cards.map(card => {
      const pricing = findPricing(card);
      if (pricing) cardsWithPricing++;
      
      // FIXED: Use tcgcsv set names when available, fallback to GitHub data
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
        set: finalSetData, // This will now have correct tcgcsv set names when available
        supertype: card.supertype,
        types: card.types || [],
        images: {
          small: card.images?.small,
          large: card.images?.large
        },
        pricing: pricing
      };
    });
    
    // ENHANCED: Create search index with correct set data
    console.log('🔍 Creating search index...');
    
    // Get unique sets from the enriched data (prioritizing tcgcsv names)
    const setMap = new Map();
    enrichedCards.forEach(card => {
      if (card.set?.id && card.set?.name) {
        setMap.set(card.set.id, {
          id: card.set.id,
          name: card.set.name, // This now has correct tcgcsv names
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
      setNameUpdates: setNameUpdates, // Track how many got updated names
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
      setNameUpdates: setNameUpdates, // How many cards got updated set names
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
    console.log('✅ Data merge completed successfully!');
    
  } catch (error) {
    console.error('❌ Error merging data:', error.message);
    process.exit(1);
  }
}

// Run the function
mergeData();
