-- Create monthly_usage table to efficiently track aggregated usage
CREATE TABLE public.monthly_usage (
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  billing_month date NOT NULL, -- The first day of the month, e.g., '2026-03-01'
  feature text NOT NULL, -- e.g., 'transcription_seconds'
  total_seconds integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (user_id, billing_month, feature)
);

-- Enable RLS for monthly_usage
ALTER TABLE public.monthly_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own monthly usage."
  ON public.monthly_usage FOR SELECT
  USING ( auth.uid() = user_id );

-- Secure RPC function to increment usage without inserting new rows
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_feature text,
  p_seconds integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Important: This allows the function to bypass RLS for the insert/update, while safely forcing it to only act on the authenticated user's ID
AS $$
DECLARE
  -- Get the currently authenticated user's UUID
  v_user_id uuid := auth.uid();
  -- Calculate the start of the current month
  v_billing_month date := date_trunc('month', now())::date;
BEGIN
  -- Ensure the user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- The core logic: Insert new counter if none exists, else add to existing
  INSERT INTO public.monthly_usage (user_id, billing_month, feature, total_seconds)
  VALUES (v_user_id, v_billing_month, p_feature, p_seconds)
  ON CONFLICT (user_id, billing_month, feature)
  DO UPDATE SET total_seconds = public.monthly_usage.total_seconds + EXCLUDED.total_seconds;
END;
$$;
