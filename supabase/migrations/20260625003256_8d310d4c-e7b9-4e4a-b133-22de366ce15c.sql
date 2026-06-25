
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_investment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_tx_user_investment
  ON public.transactions(user_id, date DESC)
  WHERE is_investment = TRUE;

CREATE INDEX IF NOT EXISTS idx_tx_user_source
  ON public.transactions(user_id, source);
