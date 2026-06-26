ALTER TABLE public.uploaded_files ADD COLUMN IF NOT EXISTS bank text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS bank text;
CREATE INDEX IF NOT EXISTS idx_tx_user_bank ON public.transactions(user_id, bank);