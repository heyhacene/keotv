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
