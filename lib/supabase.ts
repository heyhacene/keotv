import { createClient } from '@supabase/supabase-js';
import { PlaylistConfig } from '@/types/iptv';

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
  id: string; // The UUID from auth.users or usr_<username>
  email?: string; // Optional email
  username?: string; // Identifier
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

// Simple deterministic password hash for backwards compatibility with identifier accounts
export function hashPassword(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(36)}_${str.length}`;
}

// Register new user with email or identifier
export async function registerKeoUser(params: {
  email?: string;
  username?: string;
  identifier?: string;
  password: string;
  data?: Partial<KeoUserAccount>;
}): Promise<{ user?: KeoUserAccount; error?: string }> {
  try {
    const rawId = (params.identifier || params.email || params.username || '').trim();
    const cleanPass = params.password.trim();

    if (!rawId || rawId.length < 3) {
      return { error: "L'identifiant doit comporter au moins 3 caractères." };
    }
    if (!cleanPass || cleanPass.length < 4) {
      return { error: 'Le mot de passe doit comporter au moins 4 caractères.' };
    }

    const isEmail = rawId.includes('@');
    const cleanEmail = isEmail ? rawId.toLowerCase() : undefined;
    const cleanUsername = rawId.toLowerCase();
    const nowIso = new Date().toISOString();

    // If email provided and password >= 6, try Supabase Auth
    if (isEmail && cleanPass.length >= 6) {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail!,
        password: cleanPass,
      });

      if (!authError && authData.user) {
        const account: KeoUserAccount = {
          id: authData.user.id,
          email: cleanEmail,
          username: cleanEmail.split('@')[0],
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

        await supabase.from('keotv_users').upsert(account, { onConflict: 'id' });

        if (typeof window !== 'undefined') {
          localStorage.setItem(`keotv_account_${cleanEmail}`, JSON.stringify(account));
          localStorage.setItem('keotv_active_user', JSON.stringify(account));
        }
        return { user: account };
      }
    }

    // Otherwise, create direct identifier account
    const hashed = hashPassword(cleanPass);
    const account: KeoUserAccount & { password_hash?: string } = {
      id: `usr_${cleanUsername}`,
      username: cleanUsername,
      email: cleanEmail,
      password_hash: hashed,
      user_label: params.data?.user_label || cleanUsername,
      playlists: params.data?.playlists || [],
      favorites: params.data?.favorites || [],
      hidden_groups: params.data?.hidden_groups || [],
      hidden_channels: params.data?.hidden_channels || [],
      excluded_prefixes: params.data?.excluded_prefixes || [],
      watched_positions: params.data?.watched_positions || [],
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { email: _unusedEmail, ...dbPayload } = account;
    const { error: dbError } = await supabase
      .from('keotv_users')
      .upsert(dbPayload, { onConflict: 'id' });

    if (dbError) {
      console.warn('Error saving profile to keotv_users:', dbError);
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem(`keotv_account_${cleanUsername}`, JSON.stringify(account));
      localStorage.setItem('keotv_active_user', JSON.stringify(account));
    }

    return { user: account };
  } catch (err: any) {
    return { error: err?.message || 'Erreur lors de la création du compte.' };
  }
}

// Log in with email OR identifier and password (supports both Supabase Auth and legacy identifier accounts)
export async function loginKeoUser(params: {
  email?: string;
  username?: string;
  identifier?: string;
  password: string;
}): Promise<{ user?: KeoUserAccount; error?: string }> {
  try {
    const rawId = (params.identifier || params.email || params.username || '').trim();
    const cleanId = rawId.toLowerCase();
    const cleanPass = params.password.trim();

    if (!cleanId || !cleanPass) {
      return { error: 'Veuillez saisir votre identifiant et mot de passe.' };
    }

    // A. If input looks like an email, try Supabase Auth first
    if (cleanId.includes('@')) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanId,
          password: cleanPass,
        });

        if (!authError && authData?.user) {
          const { data: profile } = await supabase
            .from('keotv_users')
            .select('*')
            .eq('id', authData.user.id)
            .maybeSingle();

          const nowIso = new Date().toISOString();
          const account: KeoUserAccount = (profile as KeoUserAccount) || {
            id: authData.user.id,
            email: cleanId,
            user_label: cleanId.split('@')[0],
            playlists: [],
            favorites: [],
            hidden_groups: [],
            hidden_channels: [],
            excluded_prefixes: [],
            watched_positions: [],
            created_at: nowIso,
            updated_at: nowIso,
          };

          if (typeof window !== 'undefined') {
            localStorage.setItem(`keotv_account_${cleanId}`, JSON.stringify(account));
            localStorage.setItem('keotv_active_user', JSON.stringify(account));
          }
          return { user: account };
        }
      } catch (authErr) {
        console.warn('Supabase auth attempt error:', authErr);
      }
    }

    // B. Check keotv_users table for identifier or username accounts (e.g. "hacene")
    const expectedHash = hashPassword(cleanPass);
    try {
      const { data: legacyUser, error: legErr } = await supabase
        .from('keotv_users')
        .select('*')
        .or(`username.eq.${cleanId},id.eq.usr_${cleanId},id.eq.${cleanId}`)
        .maybeSingle();

      if (!legErr && legacyUser) {
        if (legacyUser.password_hash && legacyUser.password_hash !== expectedHash) {
          return { error: 'Mot de passe incorrect.' };
        }

        const nowIso = new Date().toISOString();
        const account: KeoUserAccount = {
          id: legacyUser.id,
          email: legacyUser.email || legacyUser.username || cleanId,
          user_label: legacyUser.user_label || legacyUser.username || cleanId,
          username: legacyUser.username || cleanId,
          playlists: legacyUser.playlists || [],
          favorites: legacyUser.favorites || [],
          hidden_groups: legacyUser.hidden_groups || [],
          hidden_channels: legacyUser.hidden_channels || [],
          excluded_prefixes: legacyUser.excluded_prefixes || [],
          watched_positions: legacyUser.watched_positions || [],
          created_at: legacyUser.created_at || nowIso,
          updated_at: nowIso,
        };

        if (typeof window !== 'undefined') {
          localStorage.setItem(`keotv_account_${cleanId}`, JSON.stringify(account));
          localStorage.setItem('keotv_active_user', JSON.stringify(account));
        }
        return { user: account };
      }
    } catch (legEx) {
      console.warn('Legacy login check notice:', legEx);
    }

    // C. Check local storage if offline
    if (typeof window !== 'undefined') {
      const localStr = localStorage.getItem(`keotv_account_${cleanId}`);
      if (localStr) {
        try {
          const parsed = JSON.parse(localStr);
          localStorage.setItem('keotv_active_user', localStr);
          return { user: parsed };
        } catch {}
      }
    }

    return { error: 'Compte introuvable ou mot de passe incorrect. Vérifiez vos identifiants.' };
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
    if (account.email) localStorage.setItem(`keotv_account_${account.email.toLowerCase()}`, JSON.stringify(updated));
    if (account.username) localStorage.setItem(`keotv_account_${account.username.toLowerCase()}`, JSON.stringify(updated));
    localStorage.setItem('keotv_active_user', JSON.stringify(updated));
  }

  // Strip email from payload since remote table keotv_users doesn't have an email column
  const { email: _unusedEmail, ...dbPayload } = updated as any;
  if (!dbPayload.username && updated.email) {
    dbPayload.username = updated.email.split('@')[0];
  }

  try {
    const { error } = await supabase
      .from('keotv_users')
      .upsert(dbPayload, { onConflict: 'id' });
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

// Fetch freshest account data directly from cloud (supports both Supabase auth session and legacy username)
export async function fetchLatestKeoUser(identifier?: string): Promise<KeoUserAccount | null> {
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
          if (identifier) localStorage.setItem(`keotv_account_${identifier.toLowerCase()}`, JSON.stringify(data));
          localStorage.setItem('keotv_active_user', JSON.stringify(data));
        }
        return data as KeoUserAccount;
      }
    } else {
      const active = getActiveKeoUser();
      const targetId = identifier || active?.username || active?.email || active?.id;
      if (targetId) {
        const cleanId = targetId.trim().toLowerCase();
        const { data, error } = await supabase
          .from('keotv_users')
          .select('*')
          .or(`username.eq.${cleanId},id.eq.usr_${cleanId},id.eq.${cleanId}`)
          .maybeSingle();

        if (!error && data) {
          if (typeof window !== 'undefined') {
            localStorage.setItem(`keotv_account_${cleanId}`, JSON.stringify(data));
            localStorage.setItem('keotv_active_user', JSON.stringify(data));
          }
          return data as KeoUserAccount;
        }
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
