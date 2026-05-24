-- Marktech Ads Platform — Initial Schema
-- All tables include tenant_id from day one
-- Row-Level Security enforced at PostgreSQL layer

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'starter',  -- starter | growth | scale | enterprise
  settings      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'account_manager',  -- agency_admin | account_manager | client_viewer | approver
  avatar_url    TEXT,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX users_tenant_id_idx ON users(tenant_id);

-- ─── Ad Accounts ─────────────────────────────────────────────────────────────
CREATE TABLE ad_accounts (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform                TEXT NOT NULL CHECK (platform IN ('meta', 'google')),
  external_id             TEXT NOT NULL,  -- Meta ad account ID or Google customer ID
  name                    TEXT NOT NULL,
  credentials_encrypted   TEXT,           -- AES-256 encrypted OAuth tokens
  sync_status             TEXT NOT NULL DEFAULT 'pending',  -- pending | active | error | paused
  sync_config             JSONB NOT NULL DEFAULT '{}',      -- refresh intervals, etc.
  last_synced_at          TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, platform, external_id)
);

CREATE INDEX ad_accounts_tenant_id_idx ON ad_accounts(tenant_id);
CREATE INDEX ad_accounts_platform_idx ON ad_accounts(platform);

-- ─── Raw Metrics (immutable, append-only) ────────────────────────────────────
CREATE TABLE raw_metrics (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id    UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL,  -- account | campaign | adset | ad
  entity_id     TEXT NOT NULL,  -- platform-native ID
  date          DATE NOT NULL,
  market        TEXT NOT NULL DEFAULT 'all',  -- india | international | all
  metrics       JSONB NOT NULL,  -- all platform metrics as-is
  attribution   JSONB,           -- attribution window breakdowns
  pulled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX raw_metrics_account_date_idx ON raw_metrics(account_id, date DESC);
CREATE INDEX raw_metrics_entity_idx ON raw_metrics(entity_type, entity_id);

-- ─── Campaigns ───────────────────────────────────────────────────────────────
CREATE TABLE campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  objective       TEXT,
  campaign_type   TEXT,  -- advantage_plus | lookalike | retargeting | prospecting | brand_awareness
  daily_budget    NUMERIC,
  lifetime_budget NUMERIC,
  platform_data   JSONB NOT NULL DEFAULT '{}',
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, external_id)
);

CREATE INDEX campaigns_account_id_idx ON campaigns(account_id);

-- ─── Ad Sets ─────────────────────────────────────────────────────────────────
CREATE TABLE ad_sets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  audience_spec   JSONB,
  bid_strategy    TEXT,
  bid_cap         NUMERIC,
  platform_data   JSONB NOT NULL DEFAULT '{}',
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, external_id)
);

CREATE INDEX ad_sets_campaign_id_idx ON ad_sets(campaign_id);

-- ─── Ads ─────────────────────────────────────────────────────────────────────
CREATE TABLE ads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_set_id       UUID NOT NULL REFERENCES ad_sets(id) ON DELETE CASCADE,
  external_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  creative_id     TEXT,
  format          TEXT,  -- video | image | carousel | reel | collection
  thumbnail_url   TEXT,
  preview_url     TEXT,
  platform_data   JSONB NOT NULL DEFAULT '{}',
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(ad_set_id, external_id)
);

CREATE INDEX ads_ad_set_id_idx ON ads(ad_set_id);

-- ─── Recommendations ─────────────────────────────────────────────────────────
CREATE TABLE recommendations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id        UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  agent_run_id      UUID,
  platform          TEXT NOT NULL,
  action_type       TEXT NOT NULL,  -- adjust_budget | adjust_bid | toggle_adset | flag_fatigue | etc.
  entity_type       TEXT NOT NULL,  -- campaign | adset | ad
  entity_id         TEXT NOT NULL,
  reasoning         TEXT NOT NULL,  -- OBSERVATION → CONTEXT → ACTION → PROJECTED IMPACT → RISK
  confidence        NUMERIC NOT NULL,  -- 0.0 – 1.0
  projected_impact  JSONB,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | executed | expired
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX recommendations_account_status_idx ON recommendations(account_id, status);

-- ─── Executions (immutable audit log) ────────────────────────────────────────
CREATE TABLE executions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recommendation_id   UUID NOT NULL REFERENCES recommendations(id),
  status              TEXT NOT NULL,  -- in_progress | success | failed | rolled_back
  before_state        JSONB,
  after_state         JSONB,
  api_response        JSONB,
  error_message       TEXT,
  executed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX executions_recommendation_id_idx ON executions(recommendation_id);

-- ─── Agent Runs ──────────────────────────────────────────────────────────────
CREATE TABLE agent_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id        UUID NOT NULL REFERENCES ad_accounts(id),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  model_used        TEXT,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  cost_usd          NUMERIC,
  recs_generated    INTEGER DEFAULT 0,
  error             TEXT
);

-- ─── Guardrail Configs ───────────────────────────────────────────────────────
CREATE TABLE guardrail_configs (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id                UUID NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE UNIQUE,
  max_budget_change_pct     NUMERIC NOT NULL DEFAULT 20,
  max_daily_increase_pct    NUMERIC NOT NULL DEFAULT 30,
  max_auto_exec_per_hour    INTEGER NOT NULL DEFAULT 5,
  min_spend_threshold       NUMERIC NOT NULL DEFAULT 2000,  -- INR
  auto_exec_enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  confidence_floor          NUMERIC NOT NULL DEFAULT 0.55,
  allowed_action_types      JSONB NOT NULL DEFAULT '["adjust_budget", "adjust_bid", "toggle_adset"]',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;

-- Policy: API authenticates as role 'app_user' with tenant_id set in session
CREATE POLICY tenant_isolation_ad_accounts ON ad_accounts
  USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- ─── Triggers: updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER guardrail_configs_updated_at BEFORE UPDATE ON guardrail_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Seed: demo tenant ───────────────────────────────────────────────────────
INSERT INTO tenants (id, name, slug, plan) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Demo Agency', 'demo-agency', 'growth')
ON CONFLICT DO NOTHING;
