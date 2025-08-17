import fs from 'fs';
import fetch from 'node-fetch';

const POKEMON_CATEGORY = '3'; // Pokemon TCG category on tcgcsv.com

async function fetchPricingData() {
  console.log('💰 Fetching pricing data from tcgcsv.com API...');
  
  try {
    const pricingMap = {};
    let totalProducts = 0;
    let processedGroups = 0;
    
    // Step 1: Get all Pokemon TCG groups
    console.log('📋 Fetching Pokemon TCG groups...');
    const groupsResponse = await fetch(`https://tcgcsv.com/tcgplayer/${POKEMON_CATEGORY}/groups`, {
      timeout: 30000
    });
    
    if (!groupsResponse.ok) {
      throw new Error(`Failed to fetch groups: ${groupsResponse.statusText}`);
    }
    
    const groupsData = await groupsResponse.json();
    const allGroups = groupsData.results || [];
    
    console.log(`Found ${allGroups.length} Pokemon TCG groups`);
    
    // Step 2: Process more groups (increased from 10 to 50 for better coverage)
    const groupsToProcess = allGroups.slice(0, 50); // Process more groups
    
    for (const group of groupsToProcess) {
      try {
        const groupId = group.groupId;
        const groupName = group.name || `Group ${groupId}`;
        
        console.log(`Processing group: ${groupName} (${processedGroups + 1}/${groupsToProcess.length})`);
        
        // Get products for this group
        const productsResponse = await fetch(
          `https://tcgcsv.com/tcgplayer/${POKEMON_CATEGORY}/${groupId}/products`,
          { timeout: 30000 }
        );
        
        if (!productsResponse.ok) {
          console.log(`  ⚠️ Failed to fetch products for ${groupName}`);
          continue;
        }
        
        const productsData = await productsResponse.json();
        const products = productsData.results || [];
        
        if (products.length === 0) {
          console.log(`  ⚠️ No products found for ${groupName}`);
          continue;
        }
        
        // Get prices for this group
        const pricesResponse = await fetch(
          `https://tcgcsv.com/tcgplayer/${POKEMON_CATEGORY}/${groupId}/prices`,
          { timeout: 30000 }
        );
        
        if (!pricesResponse.ok) {
          console.log(`  ⚠️ Failed to fetch prices for ${groupName}`);
          continue;
        }
        
        const pricesData = await pricesResponse.json();
        const prices = pricesData.results || [];
        
        // Create a map of productId to price data
        const priceMap = {};
        prices.forEach(price => {
          priceMap[price.productId] = {
            market: parseFloat(price.marketPrice || 0),
            low: parseFloat(price.lowPrice || 0),
            mid: parseFloat(price.midPrice || 0),
            high: parseFloat(price.highPrice || 0),
            lastUpdated: new Date().toISOString(),
            subType: price.subTypeName || 'Normal'
          };
        });
        
        // Process products and match with prices
        let groupProductCount = 0;
        products.forEach(product => {
          const productId = product.productId;
          const productName = product.name || '';
          const pricing = priceMap[productId];
          
          if (pricing && productName) {
            // Create multiple searchable keys for better matching
            const keys = [
              `${productName}|${groupName}`.toLowerCase(),
              productName.toLowerCase(), // Also try just the card name
              `${productName}`.toLowerCase().replace(/[^\w\s]/g, '') // Remove special chars
            ];
            
            keys.forEach(key => {
              if (key.trim()) {
                pricingMap[key] = {
  ...pricing,
  productId,
  groupName,
  groupId
};
              }
            });
            
            groupProductCount++;
          }
        });
        
        console.log(`  ✅ Added pricing for ${groupProductCount} products from ${groupName}`);
        totalProducts += groupProductCount;
        processedGroups++;
        
        // Small delay to be nice to their API
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`  ❌ Error processing group ${group.groupId}: ${error.message}`);
        continue;
      }
    }
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    // Save pricing data
    const pricingData = {
      pricing: pricingMap,
      lastUpdated: new Date().toISOString(),
      source: 'tcgcsv.com API',
      totalProducts: totalProducts,
      processedGroups: processedGroups,
      apiCategory: POKEMON_CATEGORY,
      uniquePriceEntries: Object.keys(pricingMap).length
    };
    
    fs.writeFileSync('data/pricing-raw.json', JSON.stringify(pricingData, null, 2));
    
    console.log('📊 Pricing Summary:');
    console.log(`   Processed groups: ${processedGroups}`);
    console.log(`   Total products with pricing: ${totalProducts}`);
    console.log(`   Unique price entries: ${Object.keys(pricingMap).length}`);
    console.log('✅ Pricing data saved to data/pricing-raw.json');
    
  } catch (error) {
    console.error('❌ Error fetching pricing data:', error.message);
    
    // Create empty pricing file so the process doesn't break
    const fallbackPricing = {
      pricing: {},
      lastUpdated: new Date().toISOString(),
      source: 'error',
      error: error.message,
      note: 'Fallback empty pricing due to API error'
    };
    
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    fs.writeFileSync('data/pricing-raw.json', JSON.stringify(fallbackPricing, null, 2));
    console.log('⚠️ Created fallback empty pricing file');
  }
}

// Run the function
fetchPricingData().catch(console.error);
