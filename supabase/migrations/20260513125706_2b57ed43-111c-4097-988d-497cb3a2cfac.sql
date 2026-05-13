
-- Plans enum
DO $$ BEGIN
  CREATE TYPE public.plan_tier AS ENUM ('free', 'premium_monthly', 'semester_pass');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan public.plan_tier NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own subscription all" ON public.subscriptions;
CREATE POLICY "own subscription all" ON public.subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Practice usage logging
CREATE TABLE IF NOT EXISTS public.practice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL, -- 'mcq' | 'short' | 'long' | 'fill_blank' | 'evaluate'
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS practice_events_user_created
  ON public.practice_events (user_id, created_at DESC);

ALTER TABLE public.practice_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own practice events all" ON public.practice_events;
CREATE POLICY "own practice events all" ON public.practice_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Helper: effective plan (treats expired records as 'free')
CREATE OR REPLACE FUNCTION public.get_active_plan(uid uuid)
RETURNS public.plan_tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.plan IS NULL THEN 'free'::public.plan_tier
    WHEN s.expires_at IS NOT NULL AND s.expires_at < now() THEN 'free'::public.plan_tier
    WHEN s.status <> 'active' THEN 'free'::public.plan_tier
    ELSE s.plan
  END
  FROM public.subscriptions s
  WHERE s.user_id = uid
  LIMIT 1;
$$;
