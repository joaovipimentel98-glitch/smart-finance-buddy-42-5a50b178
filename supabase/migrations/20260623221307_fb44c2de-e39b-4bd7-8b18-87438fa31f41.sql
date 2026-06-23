
-- ENUMS
CREATE TYPE public.transaction_type AS ENUM ('credit', 'debit');
CREATE TYPE public.insight_severity AS ENUM ('info', 'warning', 'critical', 'success');
CREATE TYPE public.goal_status AS ENUM ('active', 'completed', 'failed', 'paused');
CREATE TYPE public.subscription_frequency AS ENUM ('weekly', 'monthly', 'quarterly', 'yearly');

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  merchant TEXT,
  amount NUMERIC(14,2) NOT NULL,
  transaction_type public.transaction_type NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outros',
  subcategory TEXT,
  source_file TEXT,
  import_batch UUID,
  confidence NUMERIC(3,2) DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX idx_tx_user_cat ON public.transactions(user_id, category);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- UPLOADED FILES
CREATE TABLE public.uploaded_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  upload_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed BOOLEAN NOT NULL DEFAULT false,
  records_found INTEGER NOT NULL DEFAULT 0,
  observations TEXT,
  import_batch UUID NOT NULL DEFAULT gen_random_uuid()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploaded_files TO authenticated;
GRANT ALL ON public.uploaded_files TO service_role;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own files" ON public.uploaded_files FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- CATEGORY RULES
CREATE TABLE public.category_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  merchant_pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant_pattern)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_rules TO authenticated;
GRANT ALL ON public.category_rules TO service_role;
ALTER TABLE public.category_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rules" ON public.category_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- INSIGHTS
CREATE TABLE public.financial_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  severity public.insight_severity NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE INDEX idx_ins_user ON public.financial_insights(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_insights TO authenticated;
GRANT ALL ON public.financial_insights TO service_role;
ALTER TABLE public.financial_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own insights" ON public.financial_insights FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- GOALS
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_amount NUMERIC(14,2) NOT NULL,
  current_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  status public.goal_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON public.goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- SUBSCRIPTIONS
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  frequency public.subscription_frequency NOT NULL DEFAULT 'monthly',
  first_detected DATE NOT NULL,
  last_detected DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id, service_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subs" ON public.subscriptions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- CATEGORIES (per user, com seed inicial)
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: seed default categories on new user signup
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat TEXT;
BEGIN
  FOREACH cat IN ARRAY ARRAY[
    'Alimentação','Mercado','Delivery','Restaurante','Transporte','Combustível',
    'Saúde','Academia','Farmácia','Educação','Trabalho','Assinaturas','Streaming',
    'Compras','Moradia','Energia','Água','Internet','Telefone','Impostos',
    'Viagem','Lazer','Investimentos','Reserva','Outros'
  ]
  LOOP
    INSERT INTO public.categories (user_id, name, is_default) VALUES (NEW.id, cat, true)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_seed_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_categories();
