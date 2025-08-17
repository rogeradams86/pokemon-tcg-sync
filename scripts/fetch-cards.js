import fs from 'fs';
import fetch from 'node-fetch';

// ===============================
// fetch-cards (2).js — FULL FILE
// Adds fetchSets() from GitHub en.json and exports it
// ===============================

// If you already have other imports here, keep them.
// Node 18+ has global fetch. If on older Node, uncomment the next line:
// const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const SETS_URL = 'https://raw.githubusercontent.com/pokemon-tcg-data/sets/master/en.json';

/**
 * Fetch canonical set metadata (EN) from pokemon-tcg-data.
 * @returns {Promise<Array<{id:string,name:string,releaseDate?:string,series?:string}>>}
 */
async function fetchSets() {
  const res = await fetch(SETS_URL);
  if (!res.ok) throw new Error(`Failed to fetch sets: ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error('Unexpected sets JSON (expected array)');
  return json;
}

// If this file also defines/exports your fetchCards() & fetchPricing(),
// leave them as-is. Nothing else in your pipeline needs to change except
// passing the fetched sets into merge-data.

module.exports = {
  fetchSets,
  // If you already export fetchCards/fetchPricing from this file, keep exporting them:
  // fetchCards,
  // fetchPricing,
};

// Optional quick test if you run this file directly: `node "fetch-cards (2).js"`
if (require.main === module) {
  (async () => {
    const sets = await fetchSets();
    console.log(`Fetched ${sets.length} sets. Example:`, sets[0]);
  })().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
