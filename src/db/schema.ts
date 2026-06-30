import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  password_hash: text("password_hash"),
  role: text("role").notNull().default("user"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  bank_name: text("bank_name").notNull(),
  product_family: text("product_family").notNull(),
  url: text("url").notNull(),
  scrape_strategy: text("scrape_strategy").default("fetch"),
  active: boolean("active").default(true),
  last_success_at: timestamp("last_success_at", { withTimezone: true }),
  last_error_at: timestamp("last_error_at", { withTimezone: true }),
  last_error_msg: text("last_error_msg"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  source_id: integer("source_id").references(() => sources.id),
  status: text("status").notNull(),
  raw_text_path: text("raw_text_path"),
  extracted_json: jsonb("extracted_json"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  error: text("error"),
  started_at: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finished_at: timestamp("finished_at", { withTimezone: true }),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  source_id: integer("source_id").references(() => sources.id),
  bank: text("bank").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  regulatory_category: text("regulatory_category").notNull().default("unknown"),
  supervisor: text("supervisor"),
  is_investment_instrument: boolean("is_investment_instrument").default(false),
  is_cryptoasset: boolean("is_cryptoasset").default(false),
  fgd_covered: boolean("fgd_covered"),
  risk_level: text("risk_level"),
  affiliate_url: text("affiliate_url"),
  has_commercial_relationship: boolean("has_commercial_relationship").default(false),
  commercial_disclosure: text("commercial_disclosure"),
  active: boolean("active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  bankNameKindUnique: uniqueIndex("products_bank_name_kind").on(
    table.bank,
    table.name,
    table.kind,
  ),
}));

export const productVersions = pgTable(
  "product_versions",
  {
    id: serial("id").primaryKey(),
    product_id: integer("product_id").references(() => products.id),
    valid_from: timestamp("valid_from", { withTimezone: true }).notNull(),
    valid_to: timestamp("valid_to", { withTimezone: true }),
    status: text("status").notNull().default("pending_review"),
    tae: numeric("tae", { precision: 6, scale: 3 }),
    tin: numeric("tin", { precision: 6, scale: 3 }),
    max_balance: numeric("max_balance", { precision: 12, scale: 2 }),
    min_balance: numeric("min_balance", { precision: 12, scale: 2 }),
    fees_json: jsonb("fees_json"),
    requirements_json: jsonb("requirements_json"),
    duration_months: integer("duration_months"),
    bonus_amount: numeric("bonus_amount", { precision: 10, scale: 2 }),
    permanencia: text("permanencia"),
    cancellation_fees: jsonb("cancellation_fees"),
    evidence_json: jsonb("evidence_json").notNull(),
    source_scrape_id: integer("source_scrape_id").references(() => scrapeRuns.id),
    approved_by: integer("approved_by").references(() => users.id),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    rejected_by: integer("rejected_by").references(() => users.id),
    rejected_at: timestamp("rejected_at", { withTimezone: true }),
    review_notes: text("review_notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    approvedCurrent: uniqueIndex("product_versions_one_current_approved")
      .on(table.product_id)
      .where(sql`valid_to IS NULL AND status = 'approved'`),
  }),
);

export const uploadedDocuments = pgTable("uploaded_documents", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),
  original_name: text("original_name").notNull(),
  stored_path: text("stored_path").notNull(),
  file_hash: text("file_hash").notNull(),
  file_size_bytes: integer("file_size_bytes").notNull(),
  page_count: integer("page_count"),
  status: text("status").default("pending"),
  extracted_json: jsonb("extracted_json"),
  comparison_json: jsonb("comparison_json"),
  report_text: text("report_text"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
});

export const disclaimers = pgTable("disclaimers", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull(),
  context: text("context").notNull(),
  text: text("text").notNull(),
  active: boolean("active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recommendations = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),
  input_json: jsonb("input_json").notNull(),
  ranked_products_json: jsonb("ranked_products_json").notNull(),
  assumptions_json: jsonb("assumptions_json"),
  regulatory_category: text("regulatory_category").notNull().default("banking_comparison"),
  blocked: boolean("blocked").default(false),
  block_reason: text("block_reason"),
  disclaimer_id: integer("disclaimer_id").references(() => disclaimers.id),
  commercial_disclosure_shown: boolean("commercial_disclosure_shown").default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entity_type: text("entity_type"),
  entity_id: integer("entity_id"),
  payload_json: jsonb("payload_json"),
  actor: text("actor"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
