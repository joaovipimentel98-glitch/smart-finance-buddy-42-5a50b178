ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS whatsapp_e164,
  DROP COLUMN IF EXISTS whatsapp_verified_at;

DROP TABLE IF EXISTS public.whatsapp_pairing_codes;
DROP TABLE IF EXISTS public.whatsapp_messages_log;