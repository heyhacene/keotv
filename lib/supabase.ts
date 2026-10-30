import { createClient } from '@supabase/supabase-js';
import { PlaylistConfig } from '../types/iptv';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qvfmfstwrkcerzlbemzb.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2Zm1mc3R3cmtjZXJ6bGJlbXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjE1NDksImV4cCI6MjEwNzYzNzU0OX0.-VCES2YX_FDjWct12sTgTaDtfqnqUfXfPcMS39UmRBs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: typeof window !== 'undefined',
  },
});

export interface WatchedItem {
  id: string;
  title: string;
  url: string;
  poster?: string;
  stream_type: 'vod' | 'series';
  position: number; // in seconds
  duration: number; // in seconds
  updated_at: string;
}

export interface CloudDeviceSync {
  sync_code: string;
  user_label?: string;
  favorites: string[];
  hidden_groups: string[];
  hidden_channels?: string[];
  excluded_prefixes?: string[];
  watched_positions?: WatchedItem[];
  playlists: PlaylistConfig[];
  updated_at: string;
}

export interface KeoUserAccount {
  id: string; // The UUID from auth.users
  email: string; // Email is the primary identifier
  user_label?: string;
  playlists: PlaylistConfig[];
  favorites: string[];
  hidden_groups: string[];
  hidden_channels?: string[];
  excluded_prefixes?: string[];
  watched_positions?: WatchedItem[];
  created_at: string;
  updated_at: string;
}

// Register new user with email and password via Supabase Auth
export async function registerKeoUser(params: {
  email: string;
  password: string;
  data?: Partial<KeoUserAccount>;
}): Promise<{ user?: KeoUserAccount; error?: string }> {
  try {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanPass = params.password.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { error: 'Veuillez fournir une adresse email valide.' };
    }
    if (!cleanPass || cleanPass.length < 6) {
      return { error: 'Le mot de passe doit comporter au moins 6 caractères.' };
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPass,
    });

    if (authError) {
      return { error: authError.message };
    }

    if (!authData.user) {
      return { error: 'Erreur lors de la création du compte.' };
    }

    const nowIso = new Date().toISOString();

    const account: KeoUserAccount = {
      id: authData.user.id,
      email: cleanEmail,
      user_label: params.data?.user_label || cleanEmail.split('@')[0],
      playlists: params.data?.playlists || [],
      favorites: params.data?.favorites || [],
      hidden_groups: params.data?.hidden_groups || [],
      hidden_channels: params.data?.hidden_channels || [],
      excluded_prefixes: params.data?.excluded_prefixes || [],
      watched_positions: params.data?.watched_positions || [],
      created_at: nowIso,
      updated_at: nowIso,
    };

    // Store profile in public.keotv_users
    const { error: dbError } = await supabase
      .from('keotv_users')
      .upsert(account, { onConflict: 'id' });

    if (dbError) {
      console.warn('Error saving profile to keotv_users:', dbError);
    }

    // Cache locally
    if (typeof window !== 'undefined') {
      localStorage.setItem(`keotv_account_${cleanEmail}`, JSON.stringify(account));
      localStorage.setItem('keotv_active_user', JSON.stringify(account));
    }

    return { user: account };
  } catch (err: any) {
    return { error: err?.message || 'Erreur lors de la création du compte.' };
  }
}

// Log in with email and password via Supabase Auth
export async function loginKeoUser(params: {
  email: string;
  password: string;
}): Promise<{ user?: KeoUserAccount; error?: string }> {
  try {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanPass = params.password.trim();

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPass,
    });

    if (authError) {
      return { error: authError.message };
    }

    if (!authData.user) {
      return { error: 'Identifiants invalides.' };
    }

    // Fetch user profile from public.keotv_users
    const { data: profile, error: profileError } = await supabase
      .from('keotv_users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    let account: KeoUserAccount;

    if (!profileError && profile) {
      account = profile as KeoUserAccount;
    } else {
      // First login or missing profile record -> initialize profile
      const nowIso = new Date().toISOString();
      account = {
        id: authData.user.id,
        email: cleanEmail,
        user_label: cleanEmail.split('@')[0],
        playlists: [],
        favorites: [],
        hidden_groups: [],
        hidden_channels: [],
        excluded_prefixes: [],
        watched_positions: [],
        created_at: nowIso,
        updated_at: nowIso,
      };
      await supabase.from('keotv_users').upsert(account, { onConflict: 'id' });
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(`keotv_account_${cleanEmail}`, JSON.stringify(account));
      localStorage.setItem('keotv_active_user', JSON.stringify(account));
    }

    return { user: account };
  } catch (err: any) {
    return { error: err?.message || 'Erreur de connexion.' };
  }
}

// Trigger password reset email
export async function resetPasswordForEmail(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erreur lors de la réinitialisation du mot de passe.' };
  }
}

// Sync user account profile to cloud
export async function saveUserCloudSync(account: KeoUserAccount): Promise<boolean> {
  const updated = {
    ...account,
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(`keotv_account_${account.email}`, JSON.stringify(updated));
    localStorage.setItem('keotv_active_user', JSON.stringify(updated));
  }

  try {
    const { error } = await supabase
      .from('keotv_users')
      .upsert(updated, { onConflict: 'id' });
    return !error;
  } catch {
    return false;
  }
}

// Get active logged in user from localStorage
export function getActiveKeoUser(): KeoUserAccount | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('keotv_active_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Fetch freshest account data directly from cloud
export async function fetchLatestKeoUser(email?: string): Promise<KeoUserAccount | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      const { data, error } = await supabase
        .from('keotv_users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!error && data) {
        if (typeof window !== 'undefined') {
          if (email) localStorage.setItem(`keotv_account_${email.toLowerCase()}`, JSON.stringify(data));
          localStorage.setItem('keotv_active_user', JSON.stringify(data));
        }
        return data as KeoUserAccount;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch latest user from cloud:', err);
  }

  return getActiveKeoUser();
}

// Log out active user
export async function logoutKeoUser(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Supabase logout error:', err);
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('keotv_active_user');
  }
}

// Push local preferences to cloud (with local storage backup and sync endpoint support)
export async function pushSyncToCloud(code: string, data: Partial<CloudDeviceSync>) {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return false;

  const payload = {
    sync_code: cleanCode,
    ...data,
    updated_at: new Date().toISOString(),
  };

  // Always cache sync bundle locally for offline and fast restore
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`keotv_sync_${cleanCode}`, JSON.stringify(payload));
    }
  } catch {}

  try {
    const { error } = await supabase
      .from('keotv_sync')
      .upsert(payload, { onConflict: 'sync_code' });
    if (error) {
      console.warn('Cloud sync error (fallback to local cache):', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Cloud sync unavailable (fallback to local cache):', err);
    return false;
  }
}

// Pull cloud preferences to local
export async function pullSyncFromCloud(code: string): Promise<CloudDeviceSync | null> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return null;

  try {
    const { data, error } = await supabase
      .from('keotv_sync')
      .select('*')
      .eq('sync_code', cleanCode)
      .single();
    if (!error && data) {
      // Update local storage backup
      if (typeof window !== 'undefined') {
        localStorage.setItem(`keotv_sync_${cleanCode}`, JSON.stringify(data));
      }
      return data as CloudDeviceSync;
    }
  } catch (err) {
    console.warn('Failed to pull from supabase, checking local cache:', err);
  }

  // Fallback to local storage
  try {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(`keotv_sync_${cleanCode}`);
      if (cached) return JSON.parse(cached);
    }
  } catch {}

  return null;
}

// Universal In-App Feedback submitter (reusable across KeoTV, KeoNote, KeoPass, Dar)
export async function submitAppFeedback(data: {
  app_name: string;
  category: string;
  message: string;
  contact_email?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      app_name: data.app_name,
      category: data.category,
      message: data.message.trim(),
      contact_email: data.contact_email?.trim() || null,
      device_info: {
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
        screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
      },
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('app_feedback')
      .insert([payload]);

    if (error) {
      console.warn('Feedback submission error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('Feedback submit failed:', err);
    return { success: false, error: err.message || 'Erreur réseau' };
  }
}
