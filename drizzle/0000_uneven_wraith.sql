CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" integer,
	"payload_json" jsonb,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disclaimers" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"context" text NOT NULL,
	"text" text NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"tae" numeric(6, 3),
	"tin" numeric(6, 3),
	"max_balance" numeric(12, 2),
	"min_balance" numeric(12, 2),
	"fees_json" jsonb,
	"requirements_json" jsonb,
	"duration_months" integer,
	"bonus_amount" numeric(10, 2),
	"permanencia" text,
	"cancellation_fees" jsonb,
	"evidence_json" jsonb NOT NULL,
	"source_scrape_id" integer,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"rejected_by" integer,
	"rejected_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer,
	"bank" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"regulatory_category" text DEFAULT 'unknown' NOT NULL,
	"supervisor" text,
	"is_investment_instrument" boolean DEFAULT false,
	"is_cryptoasset" boolean DEFAULT false,
	"fgd_covered" boolean,
	"risk_level" text,
	"affiliate_url" text,
	"has_commercial_relationship" boolean DEFAULT false,
	"commercial_disclosure" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"telegram_chat_id" numeric,
	"input_json" jsonb NOT NULL,
	"ranked_products_json" jsonb NOT NULL,
	"assumptions_json" jsonb,
	"regulatory_category" text DEFAULT 'banking_comparison' NOT NULL,
	"blocked" boolean DEFAULT false,
	"block_reason" text,
	"disclaimer_id" integer,
	"commercial_disclosure_shown" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer,
	"status" text NOT NULL,
	"raw_text_path" text,
	"extracted_json" jsonb,
	"confidence" numeric(4, 3),
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"bank_name" text NOT NULL,
	"product_family" text NOT NULL,
	"url" text NOT NULL,
	"scrape_strategy" text DEFAULT 'fetch',
	"active" boolean DEFAULT true,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_msg" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"telegram_id" numeric NOT NULL,
	"chat_id" numeric NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"is_admin" boolean DEFAULT false,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "uploaded_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"original_name" text NOT NULL,
	"stored_path" text NOT NULL,
	"file_hash" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"page_count" integer,
	"status" text DEFAULT 'pending',
	"extracted_json" jsonb,
	"comparison_json" jsonb,
	"report_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_source_scrape_id_scrape_runs_id_fk" FOREIGN KEY ("source_scrape_id") REFERENCES "public"."scrape_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_disclaimer_id_disclaimers_id_fk" FOREIGN KEY ("disclaimer_id") REFERENCES "public"."disclaimers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_users" ADD CONSTRAINT "telegram_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_versions_one_current_approved" ON "product_versions" USING btree ("product_id") WHERE valid_to IS NULL AND status = 'approved';