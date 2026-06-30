/**
 * Script definitivo de limpieza y aprobación masiva.
 * 
 * Lee el catálogo original, aplica correcciones basadas en los archivos source,
 * y genera un catálogo limpio con productos aprobados.
 */

import fs from "node:fs";
import path from "node:path";

const catalogPath = path.join("data", "manual-product-conditions.json");

interface BankProduct {
  id: string;
  bank: string;
  productName: string;
  productKind: string;
  tae: number;
  fees: number;
  minBalance: number;
  maxBalance: number | null;
  durationMonths: number | null;
  validTo: null;
  status: string;
  source: string;
  sourceUrl?: string;
  categoryLabel: string;
  requiresPayroll: boolean;
  requiresReceipts: boolean;
  requiresBizum: boolean;
  requiresConditions: boolean;
  liquidity: number;
}

// Mapeo manual de bank → nombre real de producto basado en archivos source
const PRODUCT_NAME_MAP: Record<string, { bank: string; productName: string; tae?: number; maxBalance?: number; minBalance?: number }> = {
  "2164ddd0-a6d0-4673-9d3a-3188c0c2e288": { bank: "Cajamar", productName: "Cuenta Ahorro Cajamar" },
  "6fa46756-d9bf-4e3c-945c-78d1a881b39e": { bank: "N26", productName: "Cuenta de Ahorro N26" },
  "69c1f4bd-d34c-4842-ba25-ea7bf328a1c4": { bank: "Pibank", productName: "Cuenta Remunerada Pibank" },
  "b479a6e3-c004-45fc-979b-b3f2b89e99c3": { bank: "Pibank", productName: "Cuenta Ahorro Pibank" },
  "18641ecb-a7d2-470b-8270-22ab36917cdb": { bank: "WiZink", productName: "Cuenta de Ahorro WiZink" },
  "df2f9e87-f76b-477d-a37c-17ba847b84ad": { bank: "Bankinter", productName: "Cuenta Remunerada Bankinter" },
  "b601705d-d282-4c41-9c62-9ae6446e44ec": { bank: "Cajamar", productName: "Cuenta Online Cajamar" },
  "a26651f4-2282-4a1f-9c6e-68b1ee088d5f": { bank: "Globalcaja", productName: "Cuenta Online Globalcaja", tae: 1.9 },
  "a3d97e87-7a69-4837-bfbb-9c6f67f9c7d1": { bank: "ING", productName: "Depósito Bienvenida ING" },
  "433296bb-7dba-4495-91d4-33ef0394e2d9": { bank: "Kutxabank", productName: "Cuenta Remunerada Kutxabank" },
  "29c7fabb-513d-415b-9422-a8ca1cb99db7": { bank: "March", productName: "Cuenta Online Avantio March", tae: 2.02 },
  "a3d4e93c-6624-414f-9f7d-0e6cb8867833": { bank: "N26", productName: "Cuenta de Ahorro N26 Metal" },
  "efa349d4-7e54-45b8-b884-db2eb4b762b4": { bank: "Revolut", productName: "Cuenta Remunerada Revolut", maxBalance: 25000, minBalance: 0 },
  "c8f5ab46-0a81-40a4-8ec3-a4771152a315": { bank: "Sabadell", productName: "Cuenta Online Sabadell", tae: 1.9 },
  "29f8ad5c-bb26-42ab-96ca-32bc6adfc036": { bank: "Trade Republic", productName: "Cuenta Remunerada Trade Republic" },
  "6346b5fe-ea4d-41b4-afc6-04722d8fdbf2": { bank: "WiZink", productName: "Cuenta de Alta Remuneración Volkswagen Bank" },
};

const BANK_NORMALIZATIONS: Record<string, string> = {
  "pibank / pichincha": "Pibank",
  "bankinter": "Bankinter",
  "march": "March",
  "sabadell": "Sabadell",
  "trade republic": "Trade Republic",
  "wizkink": "WiZink",
  "wizikin": "WiZink",
};

function normalizeBank(bank: string): string {
  const lower = bank.toLowerCase().trim();
  return BANK_NORMALIZATIONS[lower] || bank;
}

function main() {
  const catalogRaw = fs.readFileSync(catalogPath, "utf-8");
  const catalog = JSON.parse(catalogRaw);
  
  const originalProducts = catalog.products;
  const cleanedProducts: BankProduct[] = [];
  
  const stats = {
    total: originalProducts.length,
    approved: 0,
    pendingReview: 0,
    banksNormalized: 0,
    productNamesFixed: 0,
    taeCorrected: 0,
    maxBalanceFixed: 0,
  };
  
  for (const product of originalProducts) {
    if (product.status === "approved") {
      cleanedProducts.push(product);
      continue;
    }
    
    stats.pendingReview++;
    
    const cloned = { ...product } as BankProduct;
    const mapping = PRODUCT_NAME_MAP[product.id];
    
    // Apply fixes from mapping if available
    if (mapping) {
      // Normalize bank
      const originalBank = cloned.bank;
      cloned.bank = normalizeBank(mapping.bank);
      if (originalBank !== cloned.bank) {
        stats.banksNormalized++;
      }
      
      // Fix product name
      if (cloned.productName !== mapping.productName) {
        cloned.productName = mapping.productName;
        stats.productNamesFixed++;
      }
      
      // Fix TAE if anomalous
      if (typeof mapping.tae === "number" && cloned.tae !== mapping.tae) {
        cloned.tae = mapping.tae;
        stats.taeCorrected++;
      }
      
      // Fix maxBalance if anomalous
      if (typeof mapping.maxBalance === "number" && cloned.maxBalance !== mapping.maxBalance) {
        cloned.maxBalance = mapping.maxBalance;
        stats.maxBalanceFixed++;
      }
      
      // Fix minBalance if anomalous
      if (typeof mapping.minBalance === "number" && cloned.minBalance !== mapping.minBalance) {
        cloned.minBalance = mapping.minBalance;
      }
      
      // Normalize categoryLabel
      cloned.categoryLabel = "Cuenta remunerada";
      
      // Approve the product
      cloned.status = "approved";
      stats.approved++;
    } else {
      // No mapping available, keep as pending
      stats.pendingReview++;
    }
    
    cleanedProducts.push(cloned);
  }
  
  // Write cleaned catalog
  const cleanedCatalog = {
    ...catalog,
    generatedAt: new Date().toISOString(),
    products: cleanedProducts,
  };
  
  // Backup original
  fs.copyFileSync(catalogPath, catalogPath + ".bak");
  fs.writeFileSync(catalogPath, JSON.stringify(cleanedCatalog, null, 2));
  
  console.log("=== Limpieza y aprobación masiva completada ===");
  console.log(`Total productos: ${stats.total}`);
  console.log(`Aprobados: ${stats.approved}`);
  console.log(`Pending review restantes: ${stats.pendingReview - stats.approved}`);
  console.log(`Banks normalizados: ${stats.banksNormalized}`);
  console.log(`Product names fijados: ${stats.productNamesFixed}`);
  console.log(`TAEs corregidos: ${stats.taeCorrected}`);
  console.log(`Max balances corregidos: ${stats.maxBalanceFixed}`);
  console.log(`\nCatálogo actualizado: ${catalogPath}`);
  console.log(`Backup creado: ${catalogPath}.bak`);
}

main();
