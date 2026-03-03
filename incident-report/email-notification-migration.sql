-- =============================================
-- Incident Email Notification Recipients
-- =============================================

-- Table for fixed notification recipients
CREATE TABLE IF NOT EXISTS incident_notification_emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,
    site_location TEXT,  -- NULL = all sites, otherwise only for specific site
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE incident_notification_emails ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read notification_emails"
  ON public.incident_notification_emails FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Admin only for write
CREATE POLICY "Admins can insert notification_emails"
  ON public.incident_notification_emails FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can update notification_emails"
  ON public.incident_notification_emails FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');

CREATE POLICY "Admins can delete notification_emails"
  ON public.incident_notification_emails FOR DELETE
  USING (auth.uid() IS NOT NULL AND public.get_user_role() = 'admin');
