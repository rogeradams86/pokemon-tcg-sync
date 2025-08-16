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
    
    // Helper function to find pricing for a card
    function findPricing(card) {
      const cardName = card.name.toLowerCase();
      const setName = (card.set?.name || '').toLowerCase();
      
      // Try multiple search strategies
      const searchKeys = [
        `${cardName}|${setName}`, // Exact match
        cardName, // Just card name
        cardName.replace(/[^\w\s]/g, ''), // Remove special characters
        `${cardName.replace(/[^\w\s]/g, '')}|${setName}`,
      ];
      
      for (const key of searchKeys) {
        if (key && pricingData.pricing[key]) {
          return pricingData.pricing[key];
        }
      }
      
      return null;
    }
    
    // Merge cards with pricing
    let cardsWithPricing = 0;
    const enrichedCards = cardData.cards.map(card => {
      const pricing = findPricing(card);
      if (pricing) cardsWithPricing++;
      
      return {
        id: card.id,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        set: {
          id: card.set?.id,
          name: card.set?.name,
          series: card.set?.series,
          releaseDate: card.set?.releaseDate
        },
        supertype: card.supertype,
        types: card.types || [],
        images: {
          small: card.images?.small,
          large: card.images?.large
        },
        pricing: pricing
      };
    });
    
    // Create search index (lightweight for fast loading)
    console.log('🔍 Creating search index...');
    const searchIndex = {
      sets: cardData.sets.map(s => ({ 
        id: s.id, 
        name: s.name, 
        series: s.series,
        releaseDate: s.releaseDate
      })),
      types: [...new Set(enrichedCards.flatMap(c => c.types || []))].sort(),
      rarities: [...new Set(enrichedCards.map(c => c.rarity).filter(Boolean))].sort(),
      totalCards: enrichedCards.length,
      totalSets: cardData.sets.length,
      cardsWithPricing: cardsWithPricing,
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
      totalSets: cardData.sets.length,
      totalChunks: chunks.length,
      cardsWithPricing: cardsWithPricing,
      pricingCoverage: `${((cardsWithPricing / enrichedCards.length) * 100).toFixed(1)}%`,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));
    
    console.log('📈 Summary:');
    console.log(`   Total cards: ${summary.totalCards}`);
    console.log(`   Total sets: ${summary.totalSets}`);
    console.log(`   Data chunks: ${summary.totalChunks}`);
    console.log(`   Cards with pricing: ${summary.cardsWithPricing} (${summary.pricingCoverage})`);
    console.log('✅ Data merge completed successfully!');
    
  } catch (error) {
    console.error('❌ Error merging data:', error.message);
    process.exit(1);
  }
}

// Run the function
mergeData();
