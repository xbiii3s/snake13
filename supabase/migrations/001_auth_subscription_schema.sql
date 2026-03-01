-- ============================================================
-- Claude Desktop Pro — SaaS Subscription Schema
-- ============================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- or via `supabase db push` if using Supabase CLI.
-- ============================================================

-- ── 1. Plans table ──
-- Stores subscription plan definitions (managed by admin).
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  max_messages_per_day INT NOT NULL DEFAULT 20,
  max_tokens_per_day BIGINT NOT NULL DEFAULT 100000,
  allowed_models TEXT[] NOT NULL DEFAULT '{claude-haiku-4-5}',
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plans IS 'Subscription plan definitions (free, pro, team, etc.)';

-- ── 2. Subscriptions table ──
-- Each user has at most one active subscription.
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),
  payment_provider TEXT,          -- 'lemonsqueezy', 'stripe', NULL for free
  payment_subscription_id TEXT,   -- external subscription ID
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

COMMENT ON TABLE public.subscriptions IS 'User subscription records (one per user)';

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- ── 3. Daily usage table ──
-- Tracks per-user daily consumption for quota enforcement.
CREATE TABLE IF NOT EXISTS public.daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count INT NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

COMMENT ON TABLE public.daily_usage IS 'Per-user daily API usage tracking';

-- Index for fast date + user lookups
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON public.daily_usage(user_id, date);

-- ── 4. Insert default plans ──
INSERT INTO public.plans (name, display_name, max_messages_per_day, max_tokens_per_day, allowed_models, price_monthly)
VALUES
  ('free', '免费版', 20, 100000, '{claude-haiku-4-5}', 0),
  ('pro', '专业版', 200, 2000000, '{claude-haiku-4-5,claude-sonnet-4-5,claude-opus-4-6}', 99.00),
  ('team', '团队版', 500, 5000000, '{claude-haiku-4-5,claude-sonnet-4-5,claude-opus-4-6}', 199.00)
ON CONFLICT (name) DO NOTHING;

-- ── 5. Row Level Security ──

-- Plans: readable by all authenticated users (public catalog)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans"
  ON public.plans
  FOR SELECT
  USING (is_active = true);

-- Subscriptions: users can only read their own
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subscription"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Daily usage: users can only read their own
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own usage"
  ON public.daily_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- ── 6. Auto-assign free plan on new user signup ──
-- This trigger automatically creates a free subscription when a new user registers.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  -- Find the free plan
  SELECT id INTO free_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;

  -- If free plan exists, create subscription
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, free_plan_id, 'active')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 7. Updated_at auto-update triggers ──

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_updated_at ON public.plans;
CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ── 8. Helper view: user subscription summary ──
-- Convenient for admin dashboard queries.

CREATE OR REPLACE VIEW public.user_subscription_summary AS
SELECT
  u.id AS user_id,
  u.email,
  u.created_at AS registered_at,
  p.name AS plan_name,
  p.display_name AS plan_display_name,
  s.status AS subscription_status,
  s.expires_at,
  COALESCE(du.message_count, 0) AS today_messages,
  COALESCE(du.input_tokens, 0) AS today_input_tokens,
  COALESCE(du.output_tokens, 0) AS today_output_tokens,
  p.max_messages_per_day
FROM auth.users u
LEFT JOIN public.subscriptions s ON s.user_id = u.id
LEFT JOIN public.plans p ON p.id = s.plan_id
LEFT JOIN public.daily_usage du ON du.user_id = u.id AND du.date = CURRENT_DATE;

-- Grant access to the view for service role (admin dashboards)
-- Note: This view uses auth.users which requires service_role access.

-- ── Done! ──
-- Next steps:
--   1. Set ANTHROPIC_API_KEY in Supabase Edge Function secrets
--   2. Deploy proxy-chat Edge Function: supabase functions deploy proxy-chat
--   3. Update src-tauri/src/auth/config.rs with your Supabase URL and Anon Key
