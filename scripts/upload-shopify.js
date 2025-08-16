import fs from 'fs';
import fetch from 'node-fetch';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function uploadToShopify() {
  console.log('📤 Uploading data to Shopify...');
  
  // Check for required environment variables
  if (!SHOPIFY_STORE || !ACCESS_TOKEN) {
    console.log('⚠️ Missing Shopify credentials');
    console.log('   Set SHOPIFY_STORE and SHOPIFY_ACCESS_TOKEN environment variables');
    console.log('   For now, skipping Shopify upload...');
    return;
  }
  
  try {
    // Get list of data files to upload
    const dataFiles = fs.readdirSync('data/').filter(f => 
      f.endsWith('.json') && !f.includes('raw-') // Skip raw files
    );
    
    console.log(`📦 Found ${dataFiles.length} files to upload`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of dataFiles) {
      try {
        console.log(`Uploading: ${file}`);
        
        const content = fs.readFileSync(`data/${file}`, 'utf8');
        
        // Upload as Shopify asset
        const response = await fetch(
          `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2023-10/themes/main/assets.json`,
          {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': ACCESS_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              asset: {
                key: `assets/tcg-${file}`,
                value: content
              }
            })
          }
        );
        
        if (response.ok) {
          console.log(`  ✅ Uploaded: ${file}`);
          successCount++;
        } else {
          const errorText = await response.text();
          console.log(`  ❌ Failed: ${file} - ${response.statusText}`);
          console.log(`     Error: ${errorText}`);
          errorCount++;
        }
        
        // Small delay between uploads
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.log(`  ❌ Error uploading ${file}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`📊 Upload summary: ${successCount} successful, ${errorCount} failed`);
    
    if (successCount > 0) {
      console.log('✅ Data successfully uploaded to Shopify!');
      console.log(`   Files are available at: /assets/tcg-[filename].json`);
    }
    
  } catch (error) {
    console.error('❌ Error uploading to Shopify:', error.message);
  }
}

// Run the function
uploadToShopify().catch(console.error);
