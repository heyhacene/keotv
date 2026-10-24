import { createClient } from '@supabase/supabase-js';

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
  playlists: any[];
  updated_at: string;
}

export interface KeoUserAccount {
  id: string;
  username: string; // Identifier or email
  password_hash: string;
  user_label?: string;
  playlists: any[];
  favorites: string[];
  hidden_groups: string[];
  hidden_channels?: string[];
  excluded_prefixes?: string[];
  watched_positions?: WatchedItem[];
  created_at: string;
  updated_at: string;
}

// Simple deterministic hash for password checking without external heavy libraries
export function hashPassword(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(36)}_${str.length}`;
}

// Register or update user with identifier and password
export async function registerKeoUser(params: {
  username: string;
  password: string;
  data?: Partial<KeoUserAccount>;
}): Promise<{ user?: KeoUserAccount; error?: string }> {
  try {
    const cleanUser = params.username.trim().toLowerCase();
    const cleanPass = params.password.trim();

    if (!cleanUser || cleanUser.length < 3) {
      return { error: "L'identifiant doit comporter au moins 3 caractères." };
    }
    if (!cleanPass || cleanPass.length < 4) {
      return { error: 'Le mot de passe doit comporter au moins 4 caractères.' };
    }

    const hashed = hashPassword(cleanPass);
    const nowIso = new Date().toISOString();

    const account: KeoUserAccount = {
      id: `usr_${cleanUser}`,
      username: cleanUser,
      password_hash: hashed,
      user_label: params.data?.user_label || cleanUser,
      playlists: params.data?.playlists || [],
      favorites: params.data?.favorites || [],
      hidden_groups: params.data?.hidden_groups || [],
      hidden_channels: params.data?.hidden_channels || [],
      excluded_prefixes: params.data?.excluded_prefixes || [],
      watched_positions: params.data?.watched_positions || [],
      created_at: nowIso,
      updated_at: nowIso,
    };

    // Cache locally
    if (typeof window !== 'undefined') {
      localStorage.setItem(`keotv_account_${cleanUser}`, JSON.stringify(account));
      localStorage.setItem('keotv_active_user', JSON.stringify(account));
    }

    try {
      await supabase
        .from('keotv_users')
        .upsert(account, { onConflict: 'username' });
    } catch (e) {
      console.warn('Supabase keotv_users upsert fallback to local:', e);
    }

    return { user: account };
  } catch (err: any) {
    return { error: err?.message || 'Erreur lors de la création du compte.' };
  }
}

// Log in with identifier and password
export async function loginKeoUser(params: {
  username: string;
  password: string;
}): Promise<{ user?: KeoUserAccount; error?: string }> {
  try {
    const cleanUser = params.username.trim().toLowerCase();
    const cleanPass = params.password.trim();
    const expectedHash = hashPassword(cleanPass);

    // 1. Try remote Supabase
    try {
      const { data, error } = await supabase
        .from('keotv_users')
        .select('*')
        .eq('username', cleanUser)
        .single();

      if (!error && data) {
        if (data.password_hash !== expectedHash) {
          return { error: 'Mot de passe incorrect.' };
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem(`keotv_account_${cleanUser}`, JSON.stringify(data));
          localStorage.setItem('keotv_active_user', JSON.stringify(data));
        }
        return { user: data as KeoUserAccount };
      }
    } catch (err) {
      console.warn('Remote login failed, trying local account storage:', err);
    }

    // 2. Fallback to local account storage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`keotv_account_${cleanUser}`);
      if (stored) {
        const parsed = JSON.parse(stored) as KeoUserAccount;
        if (parsed.password_hash === expectedHash) {
          localStorage.setItem('keotv_active_user', JSON.stringify(parsed));
          return { user: parsed };
        } else {
          return { error: 'Mot de passe incorrect.' };
        }
      }
    }

    return { error: 'Compte introuvable. Veuillez vérifier vos identifiants ou créer un compte.' };
  } catch (err: any) {
    return { error: err?.message || 'Erreur de connexion.' };
  }
}

// Sync user account profile to cloud
export async function saveUserCloudSync(account: KeoUserAccount): Promise<boolean> {
  const updated = {
    ...account,
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(`keotv_account_${account.username}`, JSON.stringify(updated));
    localStorage.setItem('keotv_active_user', JSON.stringify(updated));
  }

  try {
    const { error } = await supabase
      .from('keotv_users')
      .upsert(updated, { onConflict: 'username' });
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

// Log out active user
export function logoutKeoUser(): void {
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
