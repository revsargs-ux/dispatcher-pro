-- Migration: Create recurring_shifts table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.recurring_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id),
  service_type_id UUID REFERENCES public.service_types(id),
  address TEXT,
  start_time TEXT,
  worker_count INT DEFAULT 1,
  interval_days INT DEFAULT 7,
  created_by UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.recurring_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS recur_shifts_select ON public.recurring_shifts FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS recur_shifts_modify ON public.recurring_shifts FOR ALL USING (true) WITH CHECK (true);
