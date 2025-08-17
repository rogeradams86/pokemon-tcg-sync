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

    const allCards = Array.isArray(cardData.cards) ? cardData.cards : [];
    const allSets  = Array.isArray(cardData.sets)  ? cardData.sets  : [];

    console.log(`📊 Processing ${allCards.length} cards...`);
    console.log(`💰 Available pricing entries: ${Object.keys(pricingData.pricing || {}).length}`);
    console.log(`📦 Loaded ${allSets.length} sets from raw-cards.json`);

    // Build a fast lookup by set id (e.g., base5, sv3pt5)
    const setIndex = new Map();
    for (const s of allSets) {
      if (s && s.id) setIndex.set(String(s.id).toLowerCase(), s);
    }

    const inferSetIdFromCard = (card) => {
      const id = card?.id ? String(card.id) : '';
      const m = id.match(/^([a-z0-9]+)(?=-)/i);
      return m ? m[1].toLowerCase() : null;
    };

    // CONSERVATIVE: Only find pricing, keep original GitHub set names (or enrich from setIndex when missing)
    function findPricing(card) {
      const cardName = (card.name || '').toLowerCase();
      const setName  = (card.set?.name || '').toLowerCase();

      // Try exact/clean keys only — no fuzzy to avoid wrong assignments
      const searchKeys = [
        `${cardName}|${setName}`,
        cardName.replace(/[^À-\w\s]/g, ''), // Clean punctuation
      ];

      for (const key of searchKeys) {
        if (key && pricingData.pricing && pricingData.pricing[key]) {
          // console.log(`💰 Pricing found: ${cardName} -> £${pricingData.pricing[key].market || 0}`);
          return pricingData.pricing[key];
        }
      }
      return null; // No pricing found — OK
    }

    let cardsWithPricing = 0;
    let setsEnriched = 0; // how many cards had empty set and were enriched from setIndex

    const enrichedCards = allCards.map(card => {
      const pricing = findPricing(card);
      if (pricing) cardsWithPricing++;

      // If original set object is empty/missing, enrich from setIndex using card.id prefix
      let finalSet = (card.set && Object.keys(card.set).length > 0) ? card.set : null;
      if (!finalSet) {
        const inferred = inferSetIdFromCard(card);
        const fallback = inferred ? setIndex.get(inferred) : null;
        if (fallback) {
          finalSet = fallback;
          setsEnriched++;
        } else {
          finalSet = {}; // keep empty if we truly can't resolve
        }
      }

      // Add pricing data separately (without affecting set identification)
      let pricingWithSetInfo = null;
      if (pricing) {
        pricingWithSetInfo = {
          ...pricing,
          groupName: pricing.groupName,
          groupId: pricing.groupId
        };
      }

      return {
        id: card.id,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        set: finalSet ? {
          id: finalSet.id,
          name: finalSet.name,
          series: finalSet.series,
          releaseDate: finalSet.releaseDate
        } : {},
        supertype: card.supertype,
        types: card.types || [],
        images: {
          small: card.images?.small,
          large: card.images?.large
        },
        pricing: pricingWithSetInfo
      };
    });

    console.log(`🧩 Set enrichment applied to ${setsEnriched} card(s) that had empty set objects`);

    // Create search index using original (or enriched) set names
    console.log('🔍 Creating search index...');

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
      approach: 'keep-original-sets-or-enrich-from-en.json',
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
      approach: 'Keep original GitHub set names; enrich from en.json when missing; pricing separate',
      lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync('data/summary.json', JSON.stringify(summary, null, 2));

    console.log('📈 Summary:');
    console.log(`   Total cards: ${summary.totalCards}`);
    console.log(`   Total sets: ${summary.totalSets}`);
    console.log(`   Data chunks: ${summary.totalChunks}`);
    console.log(`   Cards with pricing: ${summary.cardsWithPricing} (${summary.pricingCoverage})`);
    console.log('   📍 Approach: Keep original GitHub set names; enrich when missing; pricing separate');
    console.log('✅ Data merge completed successfully!');

  } catch (error) {
    console.error('❌ Error merging data:', error.message);
    process.exit(1);
  }
}

// Run the function
mergeData();
