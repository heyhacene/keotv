-- ==============================================================
-- KeoTV : Table de Synchronisation Multi-Appareils (Cloud Sync)
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.keotv_sync (
  sync_code TEXT PRIMARY KEY,
  user_label TEXT,
  favorites JSONB DEFAULT '[]'::jsonb,
  hidden_groups JSONB DEFAULT '[]'::jsonb,
  playlists JSONB DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Activation de Row Level Security
ALTER TABLE public.keotv_sync ENABLE ROW LEVEL SECURITY;

-- Politique d'accès par code de synchronisation pour les téléviseurs et smartphones
CREATE POLICY "Accès public par code de synchronisation" ON public.keotv_sync
  FOR ALL
  USING (true)
  WITH CHECK (true);
