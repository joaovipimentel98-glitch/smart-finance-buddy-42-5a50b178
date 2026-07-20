GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_pairing_codes TO authenticated;
GRANT ALL ON public.whatsapp_pairing_codes TO service_role;
GRANT SELECT ON public.whatsapp_messages_log TO authenticated;
GRANT ALL ON public.whatsapp_messages_log TO service_role;