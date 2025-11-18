/**
 * merge-data.js
 *
 * Merges Pokémon TCG card data with pricing from `data/pricing-raw.json`,
 * writes chunked card JSON files and an index manifest into /data.
 */

import fs from "fs";
import path from "path";
import process from "process";

const REPO_ROOT = process.cwd();
const DATA_DIR = path.join(REPO_ROOT, "data");
const RAW_SRC = path.join(DATA_DIR, "raw-cards.json");
const PRICING_SRC = path.join(DATA_DIR, "pricing-raw.json");

const CHUNK_SIZE = 5000;

// ---------------- Utilities ----------------------

function readJson(p, optional = false) {
  if (!fs.existsSync(p)) {
    if (optional) return null;
    throw new Error(`Missing required file: ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// Build map: setId → setObject
function buildSetMap(raw) {
  const out = {};
  if (raw.sets && Array.isArray(raw.sets)) {
    raw.sets.forEach((s) => {
      if (!s.id) return;
      out[String(s.id).toLowerCase()] = {
        id: s.id,
        name: s.name,
        series: s.series,
        printedTotal: s.printedTotal,
        total: s.total,
        releaseDate: s.releaseDate,
        images: s.images,
      };
    });
  }
  return out;
}

// ---------------- Pricing matching ----------------------

function normalizeSetId(id) {
  if (!id) return "";
  return String(id).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeNumber(num) {
  if (!num) return "";
  return String(num).replace(/\D/g, "");
}

function normalizePrint(v = "normal") {
  v = String(v).toLowerCase();
  if (v.includes("reverse")) return "reverse";
  if (v.includes("holo") || v.includes("foil")) return "holo";
  return "normal";
}

// Attach pricing if found
function attachPricing(card, pricingMap) {
  if (!pricingMap) {
    card.pricing = null;
    return card;
  }

  const setId = normalizeSetId(card.set?.id);
  const number = normalizeNumber(card.number);
  const basePrint = normalizePrint(card.printing || card.rarity || "normal");

  const candidates = [
    `${setId}|${number}|${basePrint}|EN`,
    `${setId}|${number}|normal|EN`,
    `${setId}|${number}|holo|EN`,
    `${setId}|${number}|reverse|EN`,
    `${setId}||${basePrint}|EN`,
    `${setId}||normal|EN`,
  ];

  let match = null;
  for (const k of candidates) {
    if (pricingMap[k]) {
      match = pricingMap[k];
      break;
    }
  }

  card.pricing = match
    ? {
        market: match.market,
        low: match.low,
        high: match.high,
      }
    : null;

  return card;
}

// ---------------- Set assignment (the fix) ----------------------

function forceAttachSet(card, setMap) {
  // derive "me2-13" → "me2"
  const idPrefix = card.id.split("-")[0].toLowerCase();
  const meta = setMap[idPrefix];

  if (meta) {
    card.set = {
      id: meta.id,
      name: meta.name,
      series: meta.series,
      printedTotal: meta.printedTotal,
      total: meta.total,
      releaseDate: meta.releaseDate,
      images: meta.images,
    };
  } else {
    // fallback for rare future cases
    card.set = {
      id: idPrefix,
      name: "Unknown Set",
    };
  }

  return card;
}

// ---------------- Main ----------------------

function loadCardsWithSets() {
  const raw = readJson(RAW_SRC);
  if (!raw) throw new Error("raw-cards.json missing");

  const cards = Array.isArray(raw.cards) ? raw.cards : raw;

  const setMap = buildSetMap(raw);

  return { cards, setMap };
}

function main() {
  const { cards, setMap } = loadCardsWithSets();
  const pricingRaw = readJson(PRICING_SRC, true);
  const pricingMap = pricingRaw?.pricing || {};

  console.log(
    `Cards loaded: ${cards.length} • Pricing entries: ${Object.keys(pricingMap).length}`
  );

  let withPricing = 0;

  const merged = cards.map((c) => {
    const withSet = forceAttachSet({ ...c }, setMap);
    const withPrice = attachPricing(withSet, pricingMap);
    if (withPrice.pricing) withPricing++;
    return withPrice;
  });

  // Write chunks
  const chunks = chunkArray(merged, CHUNK_SIZE);
  const chunkNames = [];

  chunks.forEach((chunk, idx) => {
    const name = `tcg-cards-chunk-${idx + 1}.json`;
    writeJson(path.join(DATA_DIR, name), { cards: chunk });
    chunkNames.push(name);
  });

  // Manifest
  writeJson(path.join(DATA_DIR, "tcg-cards-index.json"), {
    generatedAt: new Date().toISOString(),
    totalCards: merged.length,
    cardsWithPricing: withPricing,
    chunks: chunkNames,
  });

  console.log(
    `✅ Finished: ${merged.length} cards, ${withPricing} with pricing, ${chunks.length} chunks`
  );
}

// Run
try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
