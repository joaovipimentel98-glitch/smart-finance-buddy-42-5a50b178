
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_e164 text UNIQUE,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at timestamptz;

CREATE TABLE public.whatsapp_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_pairing_codes_code_idx ON public.whatsapp_pairing_codes (code) WHERE consumed_at IS NULL;
CREATE INDEX whatsapp_pairing_codes_user_idx ON public.whatsapp_pairing_codes (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_pairing_codes TO authenticated;
GRANT ALL ON public.whatsapp_pairing_codes TO service_role;
ALTER TABLE public.whatsapp_pairing_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pairing codes"
  ON public.whatsapp_pairing_codes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.whatsapp_messages_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_e164 text,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  body text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_messages_log_user_idx ON public.whatsapp_messages_log (user_id, created_at DESC);
CREATE INDEX whatsapp_messages_log_from_idx ON public.whatsapp_messages_log (from_e164, created_at DESC);

GRANT SELECT ON public.whatsapp_messages_log TO authenticated;
GRANT ALL ON public.whatsapp_messages_log TO service_role;
ALTER TABLE public.whatsapp_messages_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own message log"
  ON public.whatsapp_messages_log FOR SELECT
  USING (auth.uid() = user_id);
