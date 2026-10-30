-- ==============================================================
-- KeoTV : Table des Comptes Utilisateurs (Authentification Supabase)
-- ==============================================================

-- Drop the old table to allow recreation with auth.users integration
DROP TABLE IF EXISTS public.keotv_users CASCADE;

CREATE TABLE IF NOT EXISTS public.keotv_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
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

CREATE POLICY "Users can view own profile" ON public.keotv_users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.keotv_users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.keotv_users
  FOR UPDATE USING (auth.uid() = id);

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
-- KeoTV : Table des Retours et Signalements Utilisateurs
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  device_info JSONB DEFAULT '{}'::jsonb,
  app_version TEXT,
  user_contact TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Envoi anonyme de feedback par l'application" ON public.app_feedback
  FOR INSERT
  WITH CHECK (true);
