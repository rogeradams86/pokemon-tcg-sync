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
    
    // NEW APPROACH: Only find pricing, keep original set names
    function findPricing(card) {
      const cardName = card.name.toLowerCase();
      const setName = (card.set?.name || '').toLowerCase();
      
      // Try exact matches only (no fuzzy matching to prevent wrong assignments)
      const searchKeys = [
        `${cardName}|${setName}`, // Card name with GitHub set name
        cardName.replace(/[^\w\s]/g, ''), // Clean card name only
      ];
      
      for (const key of searchKeys) {
        if (key && pricingData.pricing[key]) {
          console.log(`💰 Pricing found: ${cardName} -> £${pricingData.pricing[key].market || 0}`);
          return pricingData.pricing[key];
        }
      }
      
      // No pricing found - that's OK!
      return null;
    }
    
    // Merge cards with pricing (but keep original set info)
    let cardsWithPricing = 0;
    
    const enrichedCards = cardData.cards.map(card => {
      const pricing = findPricing(card);
      if (pricing) cardsWithPricing++;
      
      // KEEP ORIGINAL GITHUB SET DATA - do not replace with tcgcsv set names
      const finalSetData = {
        id: card.set?.id,           // Keep original GitHub set ID (base1, pgo, etc.)
        name: card.set?.name,       // Keep original GitHub set name
        series: card.set?.series,   // Keep original series
        releaseDate: card.set?.releaseDate // Keep original release date
      };
      
      // Add pricing data separately (without affecting set info)
      let pricingWithSetInfo = null;
      if (pricing) {
        pricingWithSetInfo = {
          ...pricing,
          // Include tcgcsv set info in pricing object for reference, but don't use for display
          groupName: pricing.groupName,
          groupId: pricing.groupId
        };
      }
      
      return {
        id: card.id,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        set: finalSetData, // Always use original GitHub set data
        supertype: card.supertype,
        types: card.types || [],
        images: {
          small: card.images?.small,
          large: card.images?.large
        },
        pricing: pricingWithSetInfo // Pricing data separate from set identification
      };
    });
    
    // Create search index using original GitHub set names
    console.log('🔍 Creating search index...');
    
    const setMap = new Map();
    enrichedCards.forEach(card => {
      if (card.set?.id && card.set?.name) {
        setMap.set(card.set.id, {
          id: card.set.id,
          name: card.set.name, // Original GitHub set names
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
      approach: 'pricing-only', // Track that we're keeping original set names
      lastUpdated: new Date().toISOString(),
      pricingSource: pricingData.source,
      pricingUpdated: pricingData.lastUpdated
    };
    
    // Split cards into chunks
    console.log('📦 Creating data chunks...');
    const chunkSize = 500;
    const chunks = [];
    
    for (let i = 0; i < enrichedCards.length; i += chunkSize) {
      chunks.push(enrichedCards.slice(i, i + chunkSize));
    }
    
    // Save optimized files
    console.log('💾 Saving optimized files...');
    
    fs.writeFileSync('data/tcg-cards-index.json', JSON.stringify(searchIndex, null, 2));
    console.log(`✅ Search index saved (${searchIndex.totalCards} cards, ${searchIndex.totalSets} sets)`);
    
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
      pricingCoverage: `${((cardsWithPricing / enrichedCards.length) * 100).toFixed(1)}%`,
      approach: 'Keep original GitHub set names, add pricing data only',
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));
    
    console.log('📈 Summary:');
    console.log(`   Total cards: ${summary.totalCards}`);
    console.log(`   Total sets: ${summary.totalSets}`);
    console.log(`   Data chunks: ${summary.totalChunks}`);
    console.log(`   Cards with pricing: ${summary.cardsWithPricing} (${summary.pricingCoverage})`);
    console.log(`   📍 Approach: Keep original set names, pricing data only`);
    console.log('✅ Data merge completed successfully!');
    
  } catch (error) {
    console.error('❌ Error merging data:', error.message);
    process.exit(1);
  }
}

// Run the function
mergeData();
