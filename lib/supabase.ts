import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qvfmfstwrkcerzlbemzb.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2Zm1mc3R3cmtjZXJ6bGJlbXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjE1NDksImV4cCI6MjEwNzYzNzU0OX0.-VCES2YX_FDjWct12sTgTaDtfqnqUfXfPcMS39UmRBs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: typeof window !== 'undefined',
  },
});

export interface CloudDeviceSync {
  sync_code: string;
  user_label?: string;
  favorites: string[];
  hidden_groups: string[];
  playlists: any[];
  updated_at: string;
}

// Push local preferences to cloud
export async function pushSyncToCloud(code: string, data: Partial<CloudDeviceSync>) {
  try {
    const payload = {
      sync_code: code.trim().toUpperCase(),
      ...data,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('keotv_sync')
      .upsert(payload, { onConflict: 'sync_code' });
    if (error) {
      console.warn('Cloud sync error (will retry or local only):', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Cloud sync unavailable:', err);
    return false;
  }
}

// Pull cloud preferences to local
export async function pullSyncFromCloud(code: string): Promise<CloudDeviceSync | null> {
  try {
    const { data, error } = await supabase
      .from('keotv_sync')
      .select('*')
      .eq('sync_code', code.trim().toUpperCase())
      .single();
    if (error || !data) {
      return null;
    }
    return data as CloudDeviceSync;
  } catch (err) {
    console.warn('Failed to pull from cloud:', err);
    return null;
  }
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
