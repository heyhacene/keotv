export interface Channel {
  id: string;
  num: number;
  name: string;
  logo: string;
  stream_url: string;
  stream_type: 'live' | 'vod' | 'series';
  group_id: string;
  group_name: string;
  epg_id?: string;
  is_favorite: boolean;
  is_hidden: boolean;
  custom_order: number;
  resolution?: string; // '4K' | 'FHD' | 'HD' | 'SD'
  is_adult?: boolean;
  is_separator?: boolean;
  type?: string;
  stream_id?: number | string;
  has_archive?: boolean;
  archive_days?: number;
}

export interface Category {
  id: string;
  name: string;
  type: 'live' | 'vod' | 'series';
  count: number;
  icon?: string;
  is_hidden: boolean;
  custom_order: number;
  is_adult?: boolean;
}

export interface EpgProgram {
  id: string;
  channel_id: string;
  title: string;
  description: string;
  start: string; // ISO string
  end: string;   // ISO string
  duration_min: number;
  category?: string;
  rating?: string;
  has_catchup?: boolean;
  catchup_url?: string;
}

export interface PlaylistConfig {
  id: string;
  name: string;
  type: 'xtream' | 'm3u';
  server_url: string;
  username?: string;
  password?: string;
  m3u_url?: string;
  status: 'active' | 'syncing' | 'error' | 'idle';
  channel_count: number;
  last_sync_at?: string;
}

export interface UserSettings {
  buffer_size: 'ultralow' | 'normal' | 'large';
  aspect_ratio: 'fit' | 'fill' | '16:9' | '4:3';
  theme: 'tivimate-dark' | 'oled-black' | 'deep-blue';
  epg_time_offset: number; // décalage horaire en heures
  preview_player_enabled: boolean;
  auto_play_on_startup: boolean;
  sync_code?: string;
  sync_last_at?: string;
  parental_pin?: string;
  parental_enabled?: boolean;
  parental_hide_adult?: boolean;
  show_favorites_category?: boolean;
  excluded_prefixes?: string[];
  hidden_channel_ids?: string[];
}

export type NavigationPane =
  | 'menu'
  | 'categories'
  | 'channels'
  | 'category_header'
  | 'channel_header'
  | 'player_osd'
  | 'settings'
  | 'modal';
