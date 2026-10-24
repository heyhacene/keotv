-- ==============================================================
-- KeoTV : Table des Comptes Utilisateurs (Identifiant + Mot de passe)
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.keotv_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  user_label TEXT,
  playlists JSONB DEFAULT '[]'::jsonb,
  favorites JSONB DEFAULT '[]'::jsonb,
  hidden_groups JSONB DEFAULT '[]'::jsonb,
  hidden_channels JSONB DEFAULT '[]'::jsonb,
  excluded_prefixes JSONB DEFAULT '[]'::jsonb,
  watched_positions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.keotv_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accès public keotv_users" ON public.keotv_users
  FOR ALL
  USING (true)
  WITH CHECK (true);

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

-- ==============================================================
-- Table Universelle de Feedback (Pour KeoTV, KeoNote, KeoPass, Dar)
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_name TEXT NOT NULL,
  category TEXT DEFAULT 'suggestion',
  message TEXT NOT NULL,
  contact_email TEXT,
  device_info JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Envoi anonyme de feedback par l'application" ON public.app_feedback
  FOR INSERT
  WITH CHECK (true);
