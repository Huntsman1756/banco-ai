/**
 * Limpieza automática de datos corruptos en productos pending_review.
 * 
 * Aplica fixes automáticos:
 * - Normalización de bank names
 * - Limpieza de productName duplicado
 * - Corrección de maxBalance anómalo
 * - Normalización de categoryLabel
 * 
 * Para TAEs anómalos (>15%) y nombres corruptos largos (>100 chars),
 * marca como needsManualReview en el output.
 */

import fs from "node:fs";
import path from "node:path";

const catalogPath = path.join("data", "manual-product-conditions.json");
const outputPath = path.join("data", "manual-product-conditions-cleaned.json");

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

const BANK_NORMALIZATIONS: Record<string, string> = {
  "bankinter": "Bankinter",
  "march": "March",
  "sabadell": "Sabadell",
  "trade republic": "Trade Republic",
  "wizkink": "WiZink",
  "wizikin": "WiZink",
  "pibank / pichincha": "Pibank",
};

function normalizeBank(bank: string): string {
  const lower = bank.toLowerCase().trim();
  return BANK_NORMALIZATIONS[lower] || bank;
}

function cleanProductName(name: string, bank: string): { cleaned: string; needsManualReview: boolean } {
  // Fix duplications
  const cleaned = name.replace(/Cuenta Remunerada Cuenta Remunerada/g, "Cuenta Remunerada");
  
  // If still too long (>100 chars), it's probably PDF text
  if (cleaned.length > 100) {
    // Try to extract bank name + product type pattern
    const bankPattern = new RegExp(`${bank.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    const match = cleaned.match(bankPattern);
    if (match) {
      const idx = match.index || 0;
      const before = cleaned.slice(0, idx).trim();
      if (before.length > 0 && before.length < 50) {
        return { cleaned: before, needsManualReview: true };
      }
    }
    return { cleaned: `Cuenta ${bank}`, needsManualReview: true };
  }
  
  return { cleaned, needsManualReview: false };
}

function fixMaxBalance(product: BankProduct): { fixed: number | null; needsManualReview: boolean } {
  // Revolut: maxBalance=5 is impossible, should be 25000
  if (product.bank.toLowerCase() === "revolut" && product.maxBalance !== null && product.maxBalance < 100) {
    return { fixed: 25000, needsManualReview: false };
  }
  return { fixed: product.maxBalance, needsManualReview: false };
}

function fixMinBalance(product: BankProduct): { fixed: number; needsManualReview: boolean } {
  // Revolut: minBalance=16 seems wrong
  if (product.bank.toLowerCase() === "revolut" && product.minBalance >= 10) {
    return { fixed: 0, needsManualReview: false };
  }
  return { fixed: product.minBalance, needsManualReview: false };
}

function normalizeCategoryLabel(label: string): string {
  if (label.startsWith("firma=")) {
    return "Cuenta remunerada";
  }
  return label;
}

function main() {
  const catalogRaw = fs.readFileSync(catalogPath, "utf-8");
  const catalog = JSON.parse(catalogRaw);
  
  const originalProducts = catalog.products;
  const cleanedProducts: BankProduct[] = [];
  const skippedProducts: BankProduct[] = [];
  
  const stats = {
    total: originalProducts.length,
    pendingReview: 0,
    autoFixed: 0,
    needsManualReview: 0,
    bankNormalized: 0,
    productNameCleaned: 0,
    maxBalanceFixed: 0,
    categoryLabelNormalized: 0,
  };
  
  for (const product of originalProducts) {
    if (product.status !== "pending_review") {
      cleanedProducts.push(product);
      continue;
    }
    
    stats.pendingReview++;
    
    const cloned = { ...product } as BankProduct;
    let fixedSomething = false;
    
    // 1. Normalize bank
    const originalBank = cloned.bank;
    cloned.bank = normalizeBank(cloned.bank);
    if (originalBank !== cloned.bank) {
      stats.bankNormalized++;
      fixedSomething = true;
    }
    
    // 2. Clean product name
    const nameResult = cleanProductName(cloned.productName, cloned.bank);
    const nameWasCleaned = cloned.productName !== nameResult.cleaned;
    cloned.productName = nameResult.cleaned;
    if (nameWasCleaned) {
      stats.productNameCleaned++;
      fixedSomething = true;
    }
    
    // 3. Fix maxBalance
    const maxBalanceResult = fixMaxBalance(cloned);
    if (cloned.maxBalance !== maxBalanceResult.fixed) {
      cloned.maxBalance = maxBalanceResult.fixed;
      stats.maxBalanceFixed++;
      fixedSomething = true;
    }
    
    // 4. Fix minBalance
    const minBalanceResult = fixMinBalance(cloned);
    if (cloned.minBalance !== minBalanceResult.fixed) {
      cloned.minBalance = minBalanceResult.fixed;
      fixedSomething = true;
    }
    
    // 5. Normalize categoryLabel
    const originalCategory = cloned.categoryLabel;
    cloned.categoryLabel = normalizeCategoryLabel(cloned.categoryLabel);
    if (originalCategory !== cloned.categoryLabel) {
      stats.categoryLabelNormalized++;
      fixedSomething = true;
    }
    
    // Check if TAE is anomalous
    const taeAnomalous = cloned.tae > 15;
    
    // Check if productName still needs manual review
    const stillCorrupted = cloned.productName.length > 100 || nameResult.needsManualReview;
    const needsManualReview = taeAnomalous || stillCorrupted;
    
    if (fixedSomething && !needsManualReview) {
      stats.autoFixed++;
    }
    if (needsManualReview) {
      stats.needsManualReview++;
    }
    
    // Add metadata for review
    (cloned as BankProduct & { _cleanupNotes?: string })._cleanupNotes = [
      taeAnomalous ? `TAE anómalo: ${cloned.tae}%` : null,
      stillCorrupted ? "productName requiere revisión manual" : null,
      originalBank !== cloned.bank ? `bank: ${originalBank} → ${cloned.bank}` : null,
    ].filter(Boolean) as any;
    
    if (needsManualReview) {
      skippedProducts.push(cloned);
    } else {
      // Mark as ready for approval
      (cloned as BankProduct & { _readyForApproval?: boolean })._readyForApproval = true;
      cleanedProducts.push(cloned);
    }
  }
  
  // Write cleaned catalog
  const cleanedCatalog = {
    ...catalog,
    generatedAt: new Date().toISOString(),
    products: cleanedProducts,
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(cleanedCatalog, null, 2));
  
  // Write review report
  const reviewReport = {
    generatedAt: new Date().toISOString(),
    summary: stats,
    skippedProducts: skippedProducts.map(p => ({
      id: p.id,
      bank: p.bank,
      productName: p.productName,
      tae: p.tae,
      notes: (p as any)._cleanupNotes,
    })),
    readyForApproval: cleanedProducts.filter(p => (p as any)._readyForApproval).map(p => ({
      id: p.id,
      bank: p.bank,
      productName: p.productName,
      tae: p.tae,
    })),
  };
  
  const reportPath = path.join("data", "product-cleanup-report-2.json");
  fs.writeFileSync(reportPath, JSON.stringify(reviewReport, null, 2));
  
  console.log("=== Limpieza completada ===");
  console.log(`Total productos: ${stats.total}`);
  console.log(`Pending review: ${stats.pendingReview}`);
  console.log(`Auto-fixables: ${stats.autoFixed}`);
  console.log(`Requieren revisión manual: ${stats.needsManualReview}`);
  console.log(`Bank normalizados: ${stats.bankNormalized}`);
  console.log(`Product names limpiados: ${stats.productNameCleaned}`);
  console.log(`Max balance corregidos: ${stats.maxBalanceFixed}`);
  console.log(`Category labels normalizados: ${stats.categoryLabelNormalized}`);
  console.log(`\nOutput: ${outputPath}`);
  console.log(`Report: ${reportPath}`);
}

main();
