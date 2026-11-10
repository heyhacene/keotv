package fr.keo.tv;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteStatement;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class KeoDatabase extends SQLiteOpenHelper {

    private static final String DB_NAME = "keotv_native.db";
    private static final int DB_VERSION = 5;
    private static KeoDatabase instance;

    public static synchronized KeoDatabase getInstance(Context context) {
        if (instance == null) {
            instance = new KeoDatabase(context.getApplicationContext());
        }
        return instance;
    }

    public KeoDatabase(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onConfigure(SQLiteDatabase db) {
        super.onConfigure(db);
        db.enableWriteAheadLogging();
    }

    @Override
    public void onOpen(SQLiteDatabase db) {
        super.onOpen(db);
        if (!db.isReadOnly()) {
            ensureColumnsExist(db);
        }
    }

    public synchronized void ensureColumnsExist(SQLiteDatabase db) {
        if (db == null || db.isReadOnly()) return;
        safeEnsureColumn(db, "channels", "is_fav", "INTEGER DEFAULT 0");
        safeEnsureColumn(db, "channels", "resolution", "TEXT");
        safeEnsureColumn(db, "channels", "is_separator", "INTEGER DEFAULT 0");
        safeEnsureColumn(db, "channels", "logo", "TEXT");
        safeEnsureColumn(db, "channels", "stream_id", "TEXT");
        safeEnsureColumn(db, "channels", "tv_archive", "INTEGER DEFAULT 0");
        safeEnsureColumn(db, "channels", "tv_archive_duration", "INTEGER DEFAULT 0");
        safeEnsureColumn(db, "channels", "epg_channel_id", "TEXT");
        safeEnsureColumn(db, "channels", "movie_cast", "TEXT");
        safeEnsureColumn(db, "channels", "director", "TEXT");
        safeEnsureColumn(db, "channels", "plot", "TEXT");
        safeEnsureColumn(db, "channels", "genre", "TEXT");
        safeEnsureColumn(db, "channels", "release_date", "TEXT");
        safeEnsureColumn(db, "channels", "rating", "TEXT");
        safeEnsureColumn(db, "categories", "is_adult", "INTEGER DEFAULT 0");
        safeEnsureColumn(db, "categories", "is_hidden", "INTEGER DEFAULT 0");

        try {
            db.execSQL("CREATE TABLE IF NOT EXISTS movie_actors ("
                    + "channel_id TEXT, "
                    + "actor_name TEXT, "
                    + "stream_type TEXT, "
                    + "PRIMARY KEY (channel_id, actor_name))");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_actor_name ON movie_actors(actor_name)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_actor_channel ON movie_actors(channel_id)");
        } catch (Exception e) {
            android.util.Log.w("KeoDatabase", "ensureColumnsExist movie_actors failed: " + e.getMessage());
        }
    }

    private void safeEnsureColumn(SQLiteDatabase db, String table, String column, String typeDef) {
        Cursor c = null;
        try {
            c = db.rawQuery("PRAGMA table_info(" + table + ")", null);
            boolean exists = false;
            if (c != null) {
                int nameIdx = c.getColumnIndex("name");
                while (c.moveToNext()) {
                    if (nameIdx >= 0 && column.equalsIgnoreCase(c.getString(nameIdx))) {
                        exists = true;
                        break;
                    }
                }
            }
            if (!exists) {
                db.execSQL("ALTER TABLE " + table + " ADD COLUMN `" + column + "` " + typeDef);
            }
        } catch (Exception e) {
            android.util.Log.w("KeoDatabase", "safeEnsureColumn " + table + "." + column + " failed: " + e.getMessage());
        } finally {
            if (c != null) {
                try { c.close(); } catch (Exception ignored) {}
            }
        }
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS playlists ("
                + "id TEXT PRIMARY KEY, "
                + "name TEXT, "
                + "type TEXT, "
                + "server_url TEXT, "
                + "username TEXT, "
                + "password TEXT, "
                + "exp_date TEXT, "
                + "last_sync_at TEXT)");

        db.execSQL("CREATE TABLE IF NOT EXISTS categories ("
                + "id TEXT PRIMARY KEY, "
                + "name TEXT, "
                + "type TEXT, "
                + "count INTEGER DEFAULT 0, "
                + "custom_order INTEGER DEFAULT 0, "
                + "icon TEXT, "
                + "is_hidden INTEGER DEFAULT 0, "
                + "is_adult INTEGER DEFAULT 0)");

        db.execSQL("CREATE INDEX IF NOT EXISTS idx_cat_type ON categories(type)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_cat_order ON categories(custom_order)");

        db.execSQL("CREATE TABLE IF NOT EXISTS channels ("
                + "id TEXT PRIMARY KEY, "
                + "name TEXT, "
                + "num INTEGER DEFAULT 0, "
                + "group_id TEXT, "
                + "group_name TEXT, "
                + "stream_url TEXT, "
                + "stream_type TEXT, "
                + "logo TEXT, "
                + "is_fav INTEGER DEFAULT 0, "
                + "resolution TEXT, "
                + "is_separator INTEGER DEFAULT 0, "
                + "stream_id TEXT, "
                + "tv_archive INTEGER DEFAULT 0, "
                + "tv_archive_duration INTEGER DEFAULT 0, "
                + "epg_channel_id TEXT, "
                + "movie_cast TEXT, "
                + "director TEXT, "
                + "plot TEXT, "
                + "genre TEXT, "
                + "release_date TEXT, "
                + "rating TEXT)");

        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ch_group ON channels(group_id)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ch_type ON channels(stream_type)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ch_fav ON channels(is_fav)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ch_name ON channels(name)");

        db.execSQL("CREATE TABLE IF NOT EXISTS movie_actors ("
                + "channel_id TEXT, "
                + "actor_name TEXT, "
                + "stream_type TEXT, "
                + "PRIMARY KEY (channel_id, actor_name))");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_actor_name ON movie_actors(actor_name)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_actor_channel ON movie_actors(channel_id)");

        db.execSQL("CREATE TABLE IF NOT EXISTS settings ("
                + "key TEXT PRIMARY KEY, "
                + "value TEXT)");
    }

    public void purgeCache(boolean keepPlaylist) {
        invalidateVodCatalogCache();
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.execSQL("DELETE FROM categories");
            db.execSQL("DELETE FROM channels");
            db.execSQL("DELETE FROM movie_actors");
            if (!keepPlaylist) {
                db.execSQL("DELETE FROM playlists");
                db.execSQL("DELETE FROM settings");
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        ensureColumnsExist(db);
    }

    // Models
    public static class CategoryItem {
        public String id;
        public String name;
        public String type; // live, vod, series
        public int count;
        public int customOrder;
        public boolean isHidden;
        public boolean isAdult;

        public CategoryItem(String id, String name, String type, int count, int customOrder) {
            this.id = id;
            this.name = name;
            this.type = type;
            this.count = count;
            this.customOrder = customOrder;
        }
    }

    public static class ChannelItem {
        public String id;
        public String name;
        public int num;
        public String groupId;
        public String groupName;
        public String streamUrl;
        public String streamType; // live, vod, series
        public String logo;
        public boolean isFav;
        public String resolution;
        public boolean isSeparator;
        public String streamId;
        public int tvArchive;
        public int tvArchiveDuration;
        public String epgChannelId;
        public String cast;
        public String director;
        public String plot;
        public String genre;
        public String releaseDate;
        public String rating;

        public ChannelItem() {}
    }

    public static final String CHANNEL_COLUMNS = "id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id, movie_cast, director, plot, genre, release_date, rating";

    public ChannelItem cursorToChannel(Cursor c) {
        ChannelItem item = new ChannelItem();
        item.id = c.getString(0);
        item.name = c.getString(1);
        item.num = c.getInt(2);
        item.groupId = c.getString(3);
        item.groupName = c.getString(4);
        item.streamUrl = c.getString(5);
        item.streamType = c.getString(6);
        item.logo = c.getString(7);
        item.isFav = c.getInt(8) == 1;
        item.resolution = c.getString(9);
        item.isSeparator = c.getInt(10) == 1;
        item.streamId = c.getString(11);
        item.tvArchive = c.getInt(12);
        item.tvArchiveDuration = c.getInt(13);
        item.epgChannelId = c.getString(14);
        if (c.getColumnCount() > 15) {
            item.cast = c.getString(15);
            item.director = c.getString(16);
            item.plot = c.getString(17);
            item.genre = c.getString(18);
            item.releaseDate = c.getString(19);
            item.rating = c.getString(20);
        }
        return item;
    }

    public static class PlaylistItem {
        public String id;
        public String name;
        public String type;
        public String serverUrl;
        public String username;
        public String password;
        public String expDate;
        public String lastSyncAt;
    }

    // Playlist queries
    public PlaylistItem getActivePlaylist() {
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT id, name, type, server_url, username, password, exp_date, last_sync_at FROM playlists LIMIT 1", null);
        PlaylistItem item = null;
        if (c.moveToFirst()) {
            item = new PlaylistItem();
            item.id = c.getString(0);
            item.name = c.getString(1);
            item.type = c.getString(2);
            item.serverUrl = c.getString(3);
            item.username = c.getString(4);
            item.password = c.getString(5);
            item.expDate = c.getString(6);
            item.lastSyncAt = c.getString(7);
        }
        c.close();
        return item;
    }

    public void savePlaylist(PlaylistItem pl) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("id", pl.id != null ? pl.id : "active_xtream");
        cv.put("name", pl.name);
        cv.put("type", pl.type != null ? pl.type : "xtream");
        cv.put("server_url", pl.serverUrl);
        cv.put("username", pl.username);
        cv.put("password", pl.password);
        cv.put("exp_date", pl.expDate);
        cv.put("last_sync_at", pl.lastSyncAt);
        db.insertWithOnConflict("playlists", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
    }

    // Categories queries
    public List<CategoryItem> getCategories(String type, boolean includeFavs) {
        List<CategoryItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();

        // Add virtual favorites bouquet for live channels if requested
        if (includeFavs && ("live".equals(type) || type == null)) {
            int favCount = getFavoriteCount();
            if (favCount > 0) {
                CategoryItem fav = new CategoryItem("grp_favs", "⭐ Favoris", "live", favCount, -100);
                list.add(fav);
            }
        }

        boolean isParentalLocked = "true".equals(getSetting("parental_locked", "false"));
        String sql = "SELECT id, name, type, count, custom_order, is_hidden, is_adult FROM categories WHERE is_hidden = 0";
        if (isParentalLocked) {
            sql += " AND is_adult = 0";
        }
        String[] args = null;
        if (type != null && !type.isEmpty()) {
            sql += " AND type = ?";
            args = new String[]{type};
        }
        sql += " ORDER BY custom_order ASC";

        Cursor c = db.rawQuery(sql, args);
        while (c.moveToNext()) {
            CategoryItem item = new CategoryItem(
                    c.getString(0),
                    c.getString(1),
                    c.getString(2),
                    c.getInt(3),
                    c.getInt(4)
            );
            item.isHidden = c.getInt(5) == 1;
            item.isAdult = c.getInt(6) == 1;
            list.add(item);
        }
        c.close();
        return list;
    }

    public List<CategoryItem> getCategories(String type) {
        return getCategories(type, true);
    }

    public List<CategoryItem> getAllCategoriesForManager(String type) {
        List<CategoryItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        String sql = "SELECT id, name, type, count, custom_order, is_hidden, is_adult FROM categories";
        String[] args = null;
        if (type != null && !type.isEmpty()) {
            sql += " WHERE type = ?";
            args = new String[]{type};
        }
        sql += " ORDER BY custom_order ASC, name ASC";
        Cursor c = db.rawQuery(sql, args);
        while (c != null && c.moveToNext()) {
            CategoryItem item = new CategoryItem(
                    c.getString(0),
                    c.getString(1),
                    c.getString(2),
                    c.getInt(3),
                    c.getInt(4)
            );
            item.isHidden = c.getInt(5) == 1;
            item.isAdult = c.getInt(6) == 1;
            list.add(item);
        }
        if (c != null) c.close();
        return list;
    }

    public void updateCategoryOrder(String catId, int order) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("custom_order", order);
        db.update("categories", cv, "id = ?", new String[]{catId});
    }

    public void swapCategoryOrder(String catId1, int order1, String catId2, int order2) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ContentValues cv1 = new ContentValues();
            cv1.put("custom_order", order2);
            db.update("categories", cv1, "id = ?", new String[]{catId1});

            ContentValues cv2 = new ContentValues();
            cv2.put("custom_order", order1);
            db.update("categories", cv2, "id = ?", new String[]{catId2});
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public void toggleCategoryHidden(String catId, boolean hidden) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("is_hidden", hidden ? 1 : 0);
        db.update("categories", cv, "id = ?", new String[]{catId});
    }

    public void resetCategoryOrder(String type) {
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("UPDATE categories SET custom_order = (SELECT count(*) FROM categories c2 WHERE c2.type = categories.type AND c2.name < categories.name) WHERE type = ?", new String[]{type});
    }

    public void swapChannelOrder(String chId1, int num1, String chId2, int num2) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ContentValues cv1 = new ContentValues();
            cv1.put("num", num2);
            db.update("channels", cv1, "id = ?", new String[]{chId1});

            ContentValues cv2 = new ContentValues();
            cv2.put("num", num1);
            db.update("channels", cv2, "id = ?", new String[]{chId2});
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public int getForYouVodCount() {
        return Math.min(50, getChannelCount("vod"));
    }

    public int getForYouSeriesCount() {
        return Math.min(50, getChannelCount("series"));
    }

    public List<ChannelItem> getForYouVod(Context context, int limit) {
        List<ChannelItem> list = new ArrayList<>();
        Set<String> seenIds = new HashSet<>();

        // 1. In-progress movies from KEY_POSITIONS_JSON (Continue Watching)
        try {
            if (context != null) {
                SharedPreferences prefs = context.getSharedPreferences(PlayerActivity.PREFS_POSITIONS, Context.MODE_PRIVATE);
                String jsonStr = prefs.getString(PlayerActivity.KEY_POSITIONS_JSON, "{}");
                org.json.JSONObject root = new org.json.JSONObject(jsonStr);
                java.util.Iterator<String> keys = root.keys();
                List<org.json.JSONObject> inProgress = new ArrayList<>();
                while (keys.hasNext()) {
                    String key = keys.next();
                    org.json.JSONObject obj = root.optJSONObject(key);
                    if (obj != null && !obj.optBoolean("completed", false)) {
                        long pos = obj.optLong("positionMs", 0L);
                        long dur = obj.optLong("durationMs", 0L);
                        if (pos > 15000L && (dur == 0 || pos < dur - 45000L)) {
                            inProgress.add(obj);
                        }
                    }
                }
                Collections.sort(inProgress, (a, b) -> Long.compare(b.optLong("updatedAt", 0L), a.optLong("updatedAt", 0L)));
                SQLiteDatabase db = getReadableDatabase();
                for (org.json.JSONObject obj : inProgress) {
                    String url = obj.optString("url", "");
                    String title = obj.optString("title", "");
                    Cursor c = db.rawQuery("SELECT " + CHANNEL_COLUMNS + " FROM channels WHERE stream_type = 'vod' AND (stream_url = ? OR name = ?) LIMIT 1", new String[]{url, title});
                    if (c != null && c.moveToNext()) {
                        ChannelItem item = cursorToChannel(c);
                        if (seenIds.add(item.id)) {
                            list.add(item);
                        }
                    }
                    if (c != null) c.close();
                    if (list.size() >= 15) break;
                }
            }
        } catch (Exception ignored) {}

        // 2. High-rated and recent movies from SQLite
        try {
            SQLiteDatabase db = getReadableDatabase();
            Cursor c = db.rawQuery("SELECT " + CHANNEL_COLUMNS + " FROM channels WHERE stream_type = 'vod' AND is_separator = 0 ORDER BY rating DESC, id DESC LIMIT " + (limit * 2), null);
            while (c != null && c.moveToNext() && list.size() < limit) {
                ChannelItem item = cursorToChannel(c);
                if (seenIds.add(item.id)) {
                    list.add(item);
                }
            }
            if (c != null) c.close();
        } catch (Exception ignored) {}

        return list;
    }

    public List<ChannelItem> getForYouSeries(Context context, int limit) {
        List<ChannelItem> list = new ArrayList<>();
        Set<String> seenIds = new HashSet<>();

        // 1. In-progress series from KEY_POSITIONS_JSON
        try {
            if (context != null) {
                SharedPreferences prefs = context.getSharedPreferences(PlayerActivity.PREFS_POSITIONS, Context.MODE_PRIVATE);
                String jsonStr = prefs.getString(PlayerActivity.KEY_POSITIONS_JSON, "{}");
                org.json.JSONObject root = new org.json.JSONObject(jsonStr);
                java.util.Iterator<String> keys = root.keys();
                List<org.json.JSONObject> inProgress = new ArrayList<>();
                while (keys.hasNext()) {
                    String key = keys.next();
                    org.json.JSONObject obj = root.optJSONObject(key);
                    if (obj != null && !obj.optBoolean("completed", false)) {
                        String sId = obj.optString("seriesId", "");
                        if (!sId.isEmpty()) {
                            inProgress.add(obj);
                        }
                    }
                }
                Collections.sort(inProgress, (a, b) -> Long.compare(b.optLong("updatedAt", 0L), a.optLong("updatedAt", 0L)));
                SQLiteDatabase db = getReadableDatabase();
                for (org.json.JSONObject obj : inProgress) {
                    String sId = obj.optString("seriesId", "");
                    Cursor c = db.rawQuery("SELECT " + CHANNEL_COLUMNS + " FROM channels WHERE stream_type = 'series' AND (stream_id = ? OR id = ?) LIMIT 1", new String[]{sId, "xtream_series_" + sId});
                    if (c != null && c.moveToNext()) {
                        ChannelItem item = cursorToChannel(c);
                        if (seenIds.add(item.id)) {
                            list.add(item);
                        }
                    }
                    if (c != null) c.close();
                    if (list.size() >= 15) break;
                }
            }
        } catch (Exception ignored) {}

        // 2. High-rated and popular series from SQLite
        try {
            SQLiteDatabase db = getReadableDatabase();
            Cursor c = db.rawQuery("SELECT " + CHANNEL_COLUMNS + " FROM channels WHERE stream_type = 'series' AND is_separator = 0 ORDER BY rating DESC, id DESC LIMIT " + (limit * 2), null);
            while (c != null && c.moveToNext() && list.size() < limit) {
                ChannelItem item = cursorToChannel(c);
                if (seenIds.add(item.id)) {
                    list.add(item);
                }
            }
            if (c != null) c.close();
        } catch (Exception ignored) {}

        return list;
    }

    public List<CategoryItem> getReplayCategories() {
        List<CategoryItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT c.id, c.name, c.type, count(ch.id) as cnt, c.custom_order "
                + "FROM categories c JOIN channels ch ON c.id = ch.group_id "
                + "WHERE ch.tv_archive = 1 AND ch.is_separator = 0 "
                + "GROUP BY c.id ORDER BY c.custom_order ASC, c.name ASC", null);
        while (c.moveToNext()) {
            CategoryItem item = new CategoryItem(
                    c.getString(0),
                    c.getString(1),
                    c.getString(2),
                    c.getInt(3),
                    c.getInt(4)
            );
            list.add(item);
        }
        c.close();
        // Fallback: if provider does not tag tv_archive=1, display all live bouquets for Replay
        if (list.isEmpty()) {
            return getCategories("live");
        }
        return list;
    }

    public List<ChannelItem> getReplayChannelsByGroup(String groupId) {
        List<ChannelItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT " + CHANNEL_COLUMNS
                    + " FROM channels WHERE group_id = ? AND tv_archive = 1 AND is_separator = 0 ORDER BY num ASC, name ASC", new String[]{groupId});
            while (c != null && c.moveToNext()) {
                list.add(cursorToChannel(c));
            }
        } catch (Throwable t) {
            android.util.Log.w("KeoDatabase", "getReplayChannelsByGroup primary query failed: " + t.getMessage());
            if (c != null) { try { c.close(); } catch (Exception ignored) {} c = null; }
            try {
                c = db.rawQuery("SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id FROM channels WHERE group_id = ? AND tv_archive = 1 AND is_separator = 0 ORDER BY num ASC, name ASC", new String[]{groupId});
                while (c != null && c.moveToNext()) {
                    list.add(cursorToChannel(c));
                }
            } catch (Throwable t2) {
                android.util.Log.e("KeoDatabase", "getReplayChannelsByGroup fallback failed: " + t2.getMessage());
            }
        } finally {
            if (c != null) {
                try { c.close(); } catch (Exception ignored) {}
            }
        }
        // Fallback: if provider does not tag tv_archive=1, display all bouquet channels for Replay
        if (list.isEmpty()) {
            return getChannelsByGroup(groupId);
        }
        return list;
    }

    // Channels queries
    public List<ChannelItem> getChannelsByGroup(String groupId) {
        if ("grp_favs".equals(groupId)) {
            return getFavoriteChannels();
        }

        List<ChannelItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT " + CHANNEL_COLUMNS
                    + " FROM channels WHERE group_id = ? AND is_separator = 0 ORDER BY num ASC, name ASC", new String[]{groupId});
            while (c != null && c.moveToNext()) {
                list.add(cursorToChannel(c));
            }
        } catch (Throwable t) {
            android.util.Log.w("KeoDatabase", "getChannelsByGroup primary query failed: " + t.getMessage());
            if (c != null) { try { c.close(); } catch (Exception ignored) {} c = null; }
            try {
                c = db.rawQuery("SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id FROM channels WHERE group_id = ? AND is_separator = 0 ORDER BY num ASC, name ASC", new String[]{groupId});
                while (c != null && c.moveToNext()) {
                    list.add(cursorToChannel(c));
                }
            } catch (Throwable t2) {
                android.util.Log.e("KeoDatabase", "getChannelsByGroup fallback failed: " + t2.getMessage());
            }
        } finally {
            if (c != null) {
                try { c.close(); } catch (Exception ignored) {}
            }
        }
        return list;
    }

    public List<ChannelItem> getFavoriteChannels() {
        List<ChannelItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT " + CHANNEL_COLUMNS
                    + " FROM channels WHERE is_fav = 1 AND is_separator = 0 ORDER BY name ASC", null);
            while (c != null && c.moveToNext()) {
                list.add(cursorToChannel(c));
            }
        } catch (Throwable t) {
            android.util.Log.w("KeoDatabase", "getFavoriteChannels primary failed: " + t.getMessage());
            if (c != null) { try { c.close(); } catch (Exception ignored) {} c = null; }
            try {
                c = db.rawQuery("SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id FROM channels WHERE is_fav = 1 AND is_separator = 0 ORDER BY name ASC", null);
                while (c != null && c.moveToNext()) {
                    list.add(cursorToChannel(c));
                }
            } catch (Throwable t2) {
                android.util.Log.e("KeoDatabase", "getFavoriteChannels fallback failed: " + t2.getMessage());
            }
        } finally {
            if (c != null) {
                try { c.close(); } catch (Exception ignored) {}
            }
        }
        return list;
    }

    public List<ChannelItem> getFavoriteChannels(String typeFilter) {
        if (typeFilter == null || typeFilter.isEmpty()) {
            return getFavoriteChannels();
        }
        List<ChannelItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT " + CHANNEL_COLUMNS
                    + " FROM channels WHERE is_fav = 1 AND is_separator = 0 AND stream_type = ? ORDER BY name ASC", new String[]{typeFilter});
            while (c != null && c.moveToNext()) {
                list.add(cursorToChannel(c));
            }
        } catch (Throwable t) {
            android.util.Log.w("KeoDatabase", "getFavoriteChannels filter primary failed: " + t.getMessage());
            if (c != null) { try { c.close(); } catch (Exception ignored) {} c = null; }
            try {
                c = db.rawQuery("SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id FROM channels WHERE is_fav = 1 AND is_separator = 0 AND stream_type = ? ORDER BY name ASC", new String[]{typeFilter});
                while (c != null && c.moveToNext()) {
                    list.add(cursorToChannel(c));
                }
            } catch (Throwable t2) {
                android.util.Log.e("KeoDatabase", "getFavoriteChannels filter fallback failed: " + t2.getMessage());
            }
        } finally {
            if (c != null) {
                try { c.close(); } catch (Exception ignored) {}
            }
        }
        return list;
    }

    public int getFavoriteCount() {
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT COUNT(*) FROM channels WHERE is_fav = 1 AND is_separator = 0", null);
        int cnt = 0;
        if (c.moveToFirst()) cnt = c.getInt(0);
        c.close();
        return cnt;
    }

    public int getFavoriteCount(String typeFilter) {
        if (typeFilter == null || typeFilter.isEmpty()) {
            return getFavoriteCount();
        }
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT COUNT(*) FROM channels WHERE is_fav = 1 AND is_separator = 0 AND stream_type = ?", new String[]{typeFilter});
        int cnt = 0;
        if (c.moveToFirst()) cnt = c.getInt(0);
        c.close();
        return cnt;
    }

    public List<String> getFavoriteChannelIds() {
        List<String> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = null;
        try {
            c = db.rawQuery("SELECT id FROM channels WHERE is_fav = 1 AND is_separator = 0", null);
            while (c != null && c.moveToNext()) {
                list.add(c.getString(0));
            }
        } catch (Exception e) {
            android.util.Log.e("KeoDatabase", "getFavoriteChannelIds error: " + e.getMessage());
        } finally {
            if (c != null) try { c.close(); } catch (Exception ignored) {}
        }
        return list;
    }

    public int restoreFavorites(List<String> favIds) {
        if (favIds == null || favIds.isEmpty()) return 0;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        int count = 0;
        try {
            SQLiteStatement stmt = db.compileStatement("UPDATE channels SET is_fav = 1 WHERE id = ?");
            for (String id : favIds) {
                if (id == null || id.isEmpty()) continue;
                stmt.bindString(1, id);
                count += stmt.executeUpdateDelete();
            }
            db.setTransactionSuccessful();
        } catch (Exception e) {
            android.util.Log.e("KeoDatabase", "restoreFavorites error: " + e.getMessage());
        } finally {
            db.endTransaction();
        }
        return count;
    }

    private static final java.util.regex.Pattern PAT_LEAD_PIPES = java.util.regex.Pattern.compile("^(\\|[^|]{1,18})+\\|\\s*");
    private static final java.util.regex.Pattern PAT_LEAD_BRACKETS = java.util.regex.Pattern.compile("^(\\[[^\\]]{1,18}\\]\\s*)+");
    private static final java.util.regex.Pattern PAT_LEAD_PARENS = java.util.regex.Pattern.compile("^(\\([^\\)]{1,12}\\)\\s*)+");
    private static final java.util.regex.Pattern PAT_LEAD_LANG_TAG = java.util.regex.Pattern.compile("(?i)^(FR|VF|VFF|VFQ|VO|VOSTFR|VOST|MULTI|TRUEFRENCH|EN|AR|ES|DE|IT|PT|NL|TR|RU|4K|UHD|FHD|HD|SD|HEVC)\\s*[:\\-|]+\\s*");
    private static final java.util.regex.Pattern PAT_LEAD_SHORT_CODE = java.util.regex.Pattern.compile("^[A-Za-z]{2,4}\\s*[:\\-|]\\s+");
    private static final java.util.regex.Pattern PAT_TRAIL_BRACKET_TAG = java.util.regex.Pattern.compile("(?i)\\s*\\[(VF|VFF|VFQ|VO|VOSTFR|VOST|TRUEFRENCH|MULTI|EN|FR|4K|UHD|FHD|HD|SD|HEVC|1080P|720P)\\]");
    private static final java.util.regex.Pattern PAT_TRAIL_PAREN_TAG = java.util.regex.Pattern.compile("(?i)\\s*\\((VF|VFF|VFQ|VO|VOSTFR|VOST|TRUEFRENCH|MULTI|EN|FR|4K|UHD|FHD|HD|SD|HEVC|1080P|720P)\\)");
    private static final java.util.regex.Pattern PAT_TRAIL_PIPE_TAG = java.util.regex.Pattern.compile("(?i)\\s*\\|(VF|VFF|VFQ|VO|VOSTFR|VOST|TRUEFRENCH|MULTI|EN|FR|4K|UHD|FHD|HD|SD|HEVC|1080P|720P)\\|?");
    private static final java.util.regex.Pattern PAT_PAREN_YEAR = java.util.regex.Pattern.compile("\\s*\\((19|20)\\d{2}\\)");
    private static final java.util.regex.Pattern PAT_BRACKET_YEAR = java.util.regex.Pattern.compile("\\s*\\[(19|20)\\d{2}\\]");
    private static final java.util.regex.Pattern PAT_TRAIL_YEAR = java.util.regex.Pattern.compile("(?i)\\s+[-|]?\\s*(19|20)\\d{2}\\s*$");
    private static final java.util.regex.Pattern PAT_QUAL_WORDS = java.util.regex.Pattern.compile("(?i)\\s*\\b(VOSTFR|TRUEFRENCH|MULTI|4K|UHD|FHD|HD|HEVC|1080p|720p)\\b");
    private static final java.util.regex.Pattern PAT_TRAIL_LANG = java.util.regex.Pattern.compile("(?i)\\s+[-|]\\s*(VF|VFF|VFQ|VO|VOST|FR|EN)\\s*$");
    private static final java.util.regex.Pattern PAT_PUNCT_TO_SPACE = java.util.regex.Pattern.compile("['’‘`´:\\-–—/.,!?\"()\\[\\]]+");
    private static final java.util.regex.Pattern PAT_ROMAN_II = java.util.regex.Pattern.compile("\\bii\\b");
    private static final java.util.regex.Pattern PAT_ROMAN_III = java.util.regex.Pattern.compile("\\biii\\b");
    private static final java.util.regex.Pattern PAT_ROMAN_IV = java.util.regex.Pattern.compile("\\biv\\b");
    private static final java.util.regex.Pattern PAT_ROMAN_V = java.util.regex.Pattern.compile("\\bv\\b");
    private static final java.util.regex.Pattern PAT_ROMAN_VI = java.util.regex.Pattern.compile("\\bvi\\b");
    private static final java.util.regex.Pattern PAT_ROMAN_VII = java.util.regex.Pattern.compile("\\bvii\\b");
    private static final java.util.regex.Pattern PAT_ROMAN_VIII = java.util.regex.Pattern.compile("\\bviii\\b");
    private static final java.util.regex.Pattern PAT_MULTI_SPACE = java.util.regex.Pattern.compile("\\s+");
    private static final java.util.regex.Pattern PAT_DIA = java.util.regex.Pattern.compile("\\p{InCombiningDiacriticalMarks}+");

    private static final java.util.Set<String> GENERIC_FRANCHISE_STOPWORDS = new java.util.HashSet<>(
            java.util.Arrays.asList(
                    "amour", "monde", "secret", "histoire", "famille", "police", "maison", "femme",
                    "homme", "enfant", "ombre", "retour", "dernier", "derniere", "aventure", "voyage",
                    "affaire", "crime", "guerre", "destin", "vengeance", "justice", "verite", "silence"
            )
    );

    public static class VodCatalogEntry {
        public final String id;
        public final String streamType;
        public final String rawName;
        public final String cleanTitle;
        public final String normFull;
        public final String normNoArt;
        public final String normBase;
        public final String normBaseNoArt;
        public final String normSub;
        public String castNorm;
        public String directorNorm;
        public final int langPriority;

        public VodCatalogEntry(String id, String streamType, String rawName, String cast, String director) {
            this.id = id != null ? id : "";
            this.streamType = streamType != null ? streamType : "vod";
            this.rawName = rawName != null ? rawName : "";
            this.cleanTitle = extractCleanTitle(this.rawName);
            this.normFull = normalizeTitleForMatch(this.cleanTitle);
            this.normNoArt = stripLeadingArticle(this.normFull);

            String b = "";
            String s = "";
            String[] parts = this.cleanTitle.split("[:\\-–—]");
            if (parts.length > 1) {
                b = normalizeTitleForMatch(parts[0]);
                s = normalizeTitleForMatch(parts[1]);
            }
            this.normBase = b;
            this.normBaseNoArt = stripLeadingArticle(b);
            this.normSub = s;
            this.castNorm = (cast != null && !cast.isEmpty()) ? stripAccents(cast).toLowerCase(java.util.Locale.ROOT) : "";
            this.directorNorm = (director != null && !director.isEmpty()) ? stripAccents(director).toLowerCase(java.util.Locale.ROOT) : "";
            String upper = this.rawName.toUpperCase(java.util.Locale.ROOT);
            this.langPriority = (upper.contains("FR") || upper.contains("VF") || upper.contains("VO") || upper.contains("MULTI")) ? 0 : 1;
        }
    }

    private final Object catalogCacheLock = new Object();
    private volatile List<VodCatalogEntry> vodCatalogCache = null;
    private volatile Map<String, VodCatalogEntry> vodCatalogById = null;

    public void invalidateVodCatalogCache() {
        synchronized (catalogCacheLock) {
            vodCatalogCache = null;
            vodCatalogById = null;
        }
    }

    private List<VodCatalogEntry> ensureVodCatalogIndex() {
        List<VodCatalogEntry> current = vodCatalogCache;
        if (current != null) return current;
        synchronized (catalogCacheLock) {
            if (vodCatalogCache != null) return vodCatalogCache;
            List<VodCatalogEntry> built = new ArrayList<>(25000);
            Map<String, VodCatalogEntry> byId = new HashMap<>(25000);
            SQLiteDatabase db = getReadableDatabase();
            Cursor c = null;
            try {
                c = db.rawQuery(
                        "SELECT id, stream_type, name, movie_cast, director FROM channels WHERE is_separator = 0 AND stream_type IN ('vod', 'series')",
                        null
                );
                while (c != null && c.moveToNext()) {
                    String id = c.getString(0);
                    String st = c.getString(1);
                    String name = c.getString(2);
                    String cast = c.getString(3);
                    String dir = c.getString(4);
                    if (id == null || name == null) continue;
                    VodCatalogEntry entry = new VodCatalogEntry(id, st, name, cast, dir);
                    if (!entry.normFull.isEmpty()) {
                        built.add(entry);
                        byId.put(id, entry);
                    }
                }
            } catch (Throwable t) {
                android.util.Log.w("KeoDatabase", "ensureVodCatalogIndex primary failed: " + t.getMessage());
                if (c != null) { try { c.close(); } catch (Exception ignored) {} c = null; }
                try {
                    c = db.rawQuery(
                            "SELECT id, stream_type, name FROM channels WHERE is_separator = 0 AND stream_type IN ('vod', 'series')",
                            null
                    );
                    while (c != null && c.moveToNext()) {
                        String id = c.getString(0);
                        String st = c.getString(1);
                        String name = c.getString(2);
                        if (id == null || name == null) continue;
                        VodCatalogEntry entry = new VodCatalogEntry(id, st, name, "", "");
                        if (!entry.normFull.isEmpty()) {
                            built.add(entry);
                            byId.put(id, entry);
                        }
                    }
                } catch (Throwable ignored) {}
            } finally {
                if (c != null) try { c.close(); } catch (Exception ignored) {}
            }
            vodCatalogById = byId;
            vodCatalogCache = built;
            return built;
        }
    }

    public static String stripAccents(String s) {
        if (s == null || s.isEmpty()) return "";
        int len = s.length();
        boolean hasSpecial = false;
        for (int i = 0; i < len; i++) {
            if (s.charAt(i) >= 128) {
                hasSpecial = true;
                break;
            }
        }
        if (!hasSpecial) return s;

        StringBuilder sb = new StringBuilder(len + 4);
        boolean needsNfd = false;
        for (int i = 0; i < len; i++) {
            char ch = s.charAt(i);
            if (ch < 128) {
                sb.append(ch);
            } else {
                switch (ch) {
                    case '\u00A0':
                    case '\u202F':
                    case '\u2007':
                    case '\u2060':
                        sb.append(' ');
                        break;
                    case 'à': case 'â': case 'ä': case 'á': case 'ã': case 'å':
                        sb.append('a'); break;
                    case 'À': case 'Â': case 'Ä': case 'Á': case 'Ã': case 'Å':
                        sb.append('A'); break;
                    case 'é': case 'è': case 'ê': case 'ë':
                        sb.append('e'); break;
                    case 'É': case 'È': case 'Ê': case 'Ë':
                        sb.append('E'); break;
                    case 'î': case 'ï': case 'í': case 'ì':
                        sb.append('i'); break;
                    case 'Î': case 'Ï': case 'Í': case 'Ì':
                        sb.append('I'); break;
                    case 'ô': case 'ö': case 'ó': case 'ò': case 'õ':
                        sb.append('o'); break;
                    case 'Ô': case 'Ö': case 'Ó': case 'Ò': case 'Õ':
                        sb.append('O'); break;
                    case 'ù': case 'û': case 'ü': case 'ú':
                        sb.append('u'); break;
                    case 'Ù': case 'Û': case 'Ü': case 'Ú':
                        sb.append('U'); break;
                    case 'ç':
                        sb.append('c'); break;
                    case 'Ç':
                        sb.append('C'); break;
                    case 'ñ':
                        sb.append('n'); break;
                    case 'Ñ':
                        sb.append('N'); break;
                    case 'ÿ': case 'ý':
                        sb.append('y'); break;
                    case 'Ÿ': case 'Ý':
                        sb.append('Y'); break;
                    case 'œ':
                        sb.append("oe"); break;
                    case 'Œ':
                        sb.append("OE"); break;
                    case 'æ':
                        sb.append("ae"); break;
                    case 'Æ':
                        sb.append("AE"); break;
                    case '’': case '‘': case '´':
                        sb.append('\''); break;
                    case '–': case '—':
                        sb.append('-'); break;
                    default:
                        sb.append(ch);
                        needsNfd = true;
                        break;
                }
            }
        }
        String res = sb.toString();
        if (needsNfd) {
            String normalized = java.text.Normalizer.normalize(res, java.text.Normalizer.Form.NFD);
            res = PAT_DIA.matcher(normalized).replaceAll("");
        }
        return res;
    }

    public static String extractCleanTitle(String rawName) {
        if (rawName == null || rawName.isEmpty()) return "";
        String s = rawName.replace('\u00A0', ' ').replace('\u202F', ' ').replace('\u2007', ' ').trim();
        if (s.startsWith("|")) {
            s = PAT_LEAD_PIPES.matcher(s).replaceFirst("");
            if (s.startsWith("|")) {
                int lastPipe = s.lastIndexOf('|', Math.min(28, s.length() - 1));
                if (lastPipe >= 0 && lastPipe < s.length() - 1) {
                    s = s.substring(lastPipe + 1).trim();
                }
            }
        }
        if (s.startsWith("[")) {
            s = PAT_LEAD_BRACKETS.matcher(s).replaceFirst("");
            if (s.startsWith("[")) {
                int lastBracket = s.lastIndexOf(']', Math.min(28, s.length() - 1));
                if (lastBracket >= 0 && lastBracket < s.length() - 1) {
                    s = s.substring(lastBracket + 1).trim();
                }
            }
        }
        if (s.startsWith("(")) {
            s = PAT_LEAD_PARENS.matcher(s).replaceFirst("");
        }
        s = PAT_LEAD_LANG_TAG.matcher(s).replaceFirst("");
        s = PAT_LEAD_SHORT_CODE.matcher(s).replaceFirst("");
        if (s.indexOf('[') >= 0) {
            s = PAT_TRAIL_BRACKET_TAG.matcher(s).replaceAll("");
            s = PAT_BRACKET_YEAR.matcher(s).replaceAll("");
        }
        if (s.indexOf('(') >= 0) {
            s = PAT_TRAIL_PAREN_TAG.matcher(s).replaceAll("");
            s = PAT_PAREN_YEAR.matcher(s).replaceAll("");
        }
        if (s.indexOf('|') >= 0) {
            s = PAT_TRAIL_PIPE_TAG.matcher(s).replaceAll("");
        }
        s = PAT_TRAIL_YEAR.matcher(s).replaceAll("");
        s = PAT_QUAL_WORDS.matcher(s).replaceAll("");
        s = PAT_TRAIL_LANG.matcher(s).replaceAll("");
        return s.trim();
    }

    public static String normalizeTitleForMatch(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        String s = stripAccents(extractCleanTitle(raw)).toLowerCase(java.util.Locale.ROOT);
        if (s.indexOf('&') >= 0) {
            s = s.replace("&", " et ");
        }
        s = PAT_PUNCT_TO_SPACE.matcher(s).replaceAll(" ");
        if (s.indexOf('i') >= 0 || s.indexOf('v') >= 0) {
            s = PAT_ROMAN_VIII.matcher(s).replaceAll("8");
            s = PAT_ROMAN_VII.matcher(s).replaceAll("7");
            s = PAT_ROMAN_III.matcher(s).replaceAll("3");
            s = PAT_ROMAN_II.matcher(s).replaceAll("2");
            s = PAT_ROMAN_IV.matcher(s).replaceAll("4");
            s = PAT_ROMAN_VI.matcher(s).replaceAll("6");
            s = PAT_ROMAN_V.matcher(s).replaceAll("5");
        }
        s = PAT_MULTI_SPACE.matcher(s).replaceAll(" ").trim();
        return s;
    }

    public static String stripLeadingArticle(String norm) {
        if (norm == null || norm.isEmpty()) return "";
        if (norm.startsWith("les ") || norm.startsWith("the ") || norm.startsWith("des ") || norm.startsWith("une ")) {
            return norm.substring(4).trim();
        }
        if (norm.startsWith("le ") || norm.startsWith("la ") || norm.startsWith("un ")) {
            return norm.substring(3).trim();
        }
        if (norm.startsWith("l ") || norm.startsWith("d ")) {
            return norm.substring(2).trim();
        }
        return norm;
    }

    private static boolean containsWholeWordOrPrefix(String textNorm, String word, boolean requireWholeWord) {
        if (textNorm == null || textNorm.isEmpty() || word == null || word.isEmpty()) return false;
        int idx = 0;
        int wLen = word.length();
        int tLen = textNorm.length();
        while ((idx = textNorm.indexOf(word, idx)) >= 0) {
            boolean startOk = (idx == 0) || !Character.isLetterOrDigit(textNorm.charAt(idx - 1));
            if (startOk) {
                int endIdx = idx + wLen;
                if (!requireWholeWord) return true;
                boolean endOk = (endIdx >= tLen) || !Character.isLetterOrDigit(textNorm.charAt(endIdx));
                if (endOk) return true;
            }
            idx += 1;
        }
        return false;
    }

    private static boolean containsAllWordsInMetadata(String metaNorm, String[] words) {
        if (metaNorm == null || metaNorm.isEmpty() || words == null || words.length == 0) return false;
        for (String w : words) {
            if (w.isEmpty()) continue;
            // Require whole word match for short words (< 5 chars) so "Syl" or "Dan" doesn't match random names
            boolean requireWhole = w.length() < 5;
            if (!containsWholeWordOrPrefix(metaNorm, w, requireWhole)) {
                return false;
            }
        }
        return true;
    }

    private List<ChannelItem> fetchChannelsByIdsOrdered(List<String> orderedIds) {
        List<ChannelItem> result = new ArrayList<>(orderedIds.size());
        if (orderedIds.isEmpty()) return result;
        SQLiteDatabase db = getReadableDatabase();
        Map<String, ChannelItem> map = new HashMap<>(orderedIds.size() * 2);

        int batchSize = 350;
        for (int start = 0; start < orderedIds.size(); start += batchSize) {
            int end = Math.min(orderedIds.size(), start + batchSize);
            List<String> sub = orderedIds.subList(start, end);
            StringBuilder sb = new StringBuilder();
            sb.append("SELECT ").append(CHANNEL_COLUMNS).append(" FROM channels WHERE id IN (");
            for (int i = 0; i < sub.size(); i++) {
                if (i > 0) sb.append(',');
                sb.append('?');
            }
            sb.append(')');
            Cursor c = null;
            try {
                c = db.rawQuery(sb.toString(), sub.toArray(new String[0]));
                while (c != null && c.moveToNext()) {
                    ChannelItem item = cursorToChannel(c);
                    if (item != null && item.id != null) {
                        map.put(item.id, item);
                    }
                }
            } catch (Throwable t) {
                if (c != null) { try { c.close(); } catch (Exception ignored) {} c = null; }
                try {
                    StringBuilder sb2 = new StringBuilder();
                    sb2.append("SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id FROM channels WHERE id IN (");
                    for (int i = 0; i < sub.size(); i++) {
                        if (i > 0) sb2.append(',');
                        sb2.append('?');
                    }
                    sb2.append(')');
                    c = db.rawQuery(sb2.toString(), sub.toArray(new String[0]));
                    while (c != null && c.moveToNext()) {
                        ChannelItem item = cursorToChannel(c);
                        if (item != null && item.id != null) {
                            map.put(item.id, item);
                        }
                    }
                } catch (Throwable ignored) {}
            } finally {
                if (c != null) try { c.close(); } catch (Exception ignored) {}
            }
        }

        for (String id : orderedIds) {
            ChannelItem item = map.get(id);
            if (item != null) {
                result.add(item);
            }
        }
        return result;
    }

    public List<ChannelItem> searchChannels(String query, String streamType) {
        List<ChannelItem> list = new ArrayList<>();
        if (query == null) return list;
        String trimmed = query.replace('\u00A0', ' ').trim();
        if (trimmed.length() < 2) return list;

        final String qNorm = normalizeTitleForMatch(trimmed);
        final String qUnaccLower = stripAccents(trimmed).toLowerCase(java.util.Locale.ROOT).trim();
        final String[] qWords = qNorm.isEmpty() ? qUnaccLower.split("\\s+") : qNorm.split("\\s+");
        final boolean includeVodSeries = (streamType == null || streamType.isEmpty() || "all".equalsIgnoreCase(streamType)
                || "vod".equalsIgnoreCase(streamType) || "series".equalsIgnoreCase(streamType));
        final boolean includeLive = (streamType == null || streamType.isEmpty() || "all".equalsIgnoreCase(streamType)
                || "live".equalsIgnoreCase(streamType));

        // 1. Scan full in-memory VOD & Series catalog (100% coverage, zero SQL LIMIT truncation)
        final Map<String, Integer> matchedVodTier = new HashMap<>();
        final List<VodCatalogEntry> matchedVodEntries = new ArrayList<>();

        if (includeVodSeries && !qNorm.isEmpty()) {
            List<VodCatalogEntry> catalog = ensureVodCatalogIndex();
            // Also check movie_actors table for indexed actor names
            Set<String> actorMatchedIds = new HashSet<>();
            if (qUnaccLower.length() >= 3) {
                SQLiteDatabase db = getReadableDatabase();
                Cursor ac = null;
                try {
                    ac = db.rawQuery("SELECT channel_id, actor_name FROM movie_actors WHERE actor_name LIKE ?", new String[]{"%" + qUnaccLower + "%"});
                    while (ac != null && ac.moveToNext()) {
                        String cid = ac.getString(0);
                        String aName = ac.getString(1);
                        if (cid != null && aName != null) {
                            String aNorm = stripAccents(aName).toLowerCase(java.util.Locale.ROOT);
                            if (containsAllWordsInMetadata(aNorm, qWords)) {
                                actorMatchedIds.add(cid);
                            }
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    if (ac != null) try { ac.close(); } catch (Exception ignored) {}
                }
            }

            for (VodCatalogEntry e : catalog) {
                if (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType)) {
                    if (!streamType.equalsIgnoreCase(e.streamType)) continue;
                }
                int tier = 99;
                if (e.normFull.equals(qNorm) || e.normNoArt.equals(qNorm)
                        || (!e.normBase.isEmpty() && (e.normBase.equals(qNorm) || e.normBaseNoArt.equals(qNorm)))) {
                    tier = 1; // Exact title or base title match
                } else if (e.normFull.startsWith(qNorm + " ") || e.normNoArt.startsWith(qNorm + " ")) {
                    tier = 2; // Title starts with query (e.g. "Rambo 2", "Rocky 4")
                } else if (containsWholeWordOrPrefix(e.normFull, qNorm, qNorm.length() < 4)) {
                    tier = 3; // Whole word/phrase in title (e.g. "John Rambo")
                } else if (qWords.length > 1 && containsAllWordsInMetadata(e.normFull, qWords)) {
                    tier = 4; // All query words present in title
                } else if (qNorm.length() >= 4 && e.normFull.contains(qNorm)) {
                    tier = 5; // Substring in title
                } else if (actorMatchedIds.contains(e.id)
                        || (qUnaccLower.length() >= 3 && (containsAllWordsInMetadata(e.castNorm, qWords) || containsAllWordsInMetadata(e.directorNorm, qWords)))) {
                    tier = 6; // Actor / Director match
                }

                if (tier < 99) {
                    matchedVodTier.put(e.id, tier);
                    matchedVodEntries.add(e);
                }
            }

            Collections.sort(matchedVodEntries, (a, b) -> {
                int ta = matchedVodTier.get(a.id);
                int tb = matchedVodTier.get(b.id);
                if (ta != tb) return Integer.compare(ta, tb);
                int cNorm = a.normFull.compareTo(b.normFull);
                if (cNorm != 0) return cNorm;
                if (a.langPriority != b.langPriority) return Integer.compare(a.langPriority, b.langPriority);
                return a.rawName.compareToIgnoreCase(b.rawName);
            });

            List<String> orderedVodIds = new ArrayList<>(Math.min(matchedVodEntries.size(), 500));
            for (int i = 0; i < Math.min(matchedVodEntries.size(), 500); i++) {
                orderedVodIds.add(matchedVodEntries.get(i).id);
            }
            list.addAll(fetchChannelsByIdsOrdered(orderedVodIds));
        }

        // 2. Include Live channels if applicable
        if (includeLive) {
            SQLiteDatabase db = getReadableDatabase();
            String q = "%" + trimmed + "%";
            String qUnaccented = "%" + stripAccents(trimmed) + "%";
            Cursor c = null;
            try {
                String sql = "SELECT DISTINCT " + CHANNEL_COLUMNS
                        + " FROM channels WHERE is_separator = 0 AND stream_type = 'live' AND (name LIKE ? OR name LIKE ?)"
                        + " ORDER BY (CASE WHEN name LIKE '%FR%' OR name LIKE '%VF%' THEN 0 ELSE 1 END), num ASC, name ASC LIMIT 150";
                c = db.rawQuery(sql, new String[]{q, qUnaccented});
                Set<String> seenIds = new HashSet<>();
                for (ChannelItem item : list) seenIds.add(item.id);
                while (c != null && c.moveToNext()) {
                    ChannelItem ch = cursorToChannel(c);
                    if (ch != null && seenIds.add(ch.id)) {
                        list.add(ch);
                    }
                }
            } catch (Throwable ignored) {
            } finally {
                if (c != null) try { c.close(); } catch (Exception ignored) {}
            }
        }

        return list;
    }

    public List<ChannelItem> searchChannelsByPersonName(String fullPersonName, String streamType) {
        List<ChannelItem> list = new ArrayList<>();
        if (fullPersonName == null || fullPersonName.trim().isEmpty()) return list;
        String cleanPerson = stripAccents(fullPersonName).toLowerCase(java.util.Locale.ROOT).trim();
        String[] nameTokens = cleanPerson.split("\\s+");
        String lastName = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : cleanPerson;
        boolean canMatchSurnameAlone = lastName.length() >= 6;

        Set<String> actorChannelIds = new HashSet<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor ac = null;
        try {
            if (canMatchSurnameAlone) {
                ac = db.rawQuery("SELECT channel_id, actor_name FROM movie_actors WHERE actor_name LIKE ? OR actor_name LIKE ?",
                        new String[]{"%" + cleanPerson + "%", "%" + lastName + "%"});
            } else {
                ac = db.rawQuery("SELECT channel_id, actor_name FROM movie_actors WHERE actor_name LIKE ?",
                        new String[]{"%" + cleanPerson + "%"});
            }
            while (ac != null && ac.moveToNext()) {
                String cid = ac.getString(0);
                String aName = ac.getString(1);
                if (cid != null && aName != null) {
                    String aNorm = stripAccents(aName).toLowerCase(java.util.Locale.ROOT);
                    if (containsAllWordsInMetadata(aNorm, nameTokens)
                            || (canMatchSurnameAlone && containsWholeWordOrPrefix(aNorm, lastName, true))) {
                        actorChannelIds.add(cid);
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (ac != null) try { ac.close(); } catch (Exception ignored) {}
        }

        List<VodCatalogEntry> catalog = ensureVodCatalogIndex();
        List<VodCatalogEntry> matched = new ArrayList<>();
        for (VodCatalogEntry e : catalog) {
            if (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType)) {
                if (!streamType.equalsIgnoreCase(e.streamType)) continue;
            }
            boolean isMatch = actorChannelIds.contains(e.id)
                    || containsAllWordsInMetadata(e.castNorm, nameTokens)
                    || containsAllWordsInMetadata(e.directorNorm, nameTokens)
                    || containsAllWordsInMetadata(e.normFull, nameTokens);
            if (!isMatch && canMatchSurnameAlone) {
                if (containsWholeWordOrPrefix(e.castNorm, lastName, true)
                        || containsWholeWordOrPrefix(e.directorNorm, lastName, true)
                        || containsWholeWordOrPrefix(e.normFull, lastName, true)) {
                    isMatch = true;
                }
            }
            if (isMatch) {
                matched.add(e);
            }
        }

        Collections.sort(matched, (a, b) -> {
            int cNorm = a.normFull.compareTo(b.normFull);
            if (cNorm != 0) return cNorm;
            if (a.langPriority != b.langPriority) return Integer.compare(a.langPriority, b.langPriority);
            return a.rawName.compareToIgnoreCase(b.rawName);
        });

        List<String> ids = new ArrayList<>(matched.size());
        for (VodCatalogEntry e : matched) ids.add(e.id);
        return fetchChannelsByIdsOrdered(ids);
    }

    private static void addFranchiseRootAndSequels(Set<String> franchiseRoots, Set<String> exactTargets, String candidateRoot) {
        if (candidateRoot == null) return;
        String root = candidateRoot.replaceAll("\\s+([1-9]|i)$", "").trim();
        if (root.length() >= 5 && !root.matches("^\\d+$") && !GENERIC_FRANCHISE_STOPWORDS.contains(root)) {
            franchiseRoots.add(root);
            exactTargets.add(root);
            exactTargets.add(root + " i");
            for (int n = 1; n <= 9; n++) {
                exactTargets.add(root + " " + n);
            }
        }
    }

    public List<ChannelItem> searchChannelsByTitles(List<String> titles, String streamType) {
        List<ChannelItem> list = new ArrayList<>();
        if (titles == null || titles.isEmpty()) return list;

        Set<String> exactTargets = new HashSet<>();
        Set<String> franchiseRoots = new HashSet<>();

        for (String t : titles) {
            if (t == null) continue;
            String cleaned = extractCleanTitle(t);
            if (cleaned.length() < 2 || cleaned.matches("^\\d+$")) continue;

            String normFull = normalizeTitleForMatch(cleaned);
            if (normFull.length() < 2 || normFull.matches("^\\d+$")) continue;

            exactTargets.add(normFull);
            exactTargets.add(normFull + " 1");
            exactTargets.add(normFull + " i");

            String noArt = stripLeadingArticle(normFull);
            if (noArt.length() >= 4) {
                exactTargets.add(noArt);
                exactTargets.add(noArt + " 1");
                exactTargets.add(noArt + " i");
            }

            // If this title itself doesn't end in 2..9, it can serve as a franchise root (e.g. "rambo", "rocky", "creed", "expendables")
            if (!normFull.matches(".*\\s+[2-9]$")) {
                addFranchiseRootAndSequels(franchiseRoots, exactTargets, normFull);
                if (noArt.length() >= 5) {
                    addFranchiseRootAndSequels(franchiseRoots, exactTargets, noArt);
                }
            }

            // If title has a subtitle separated by ':', ' - ', ' – ', extract base title and subtitle
            String[] parts = cleaned.split("[:\\-–—]");
            if (parts.length > 1) {
                String baseRaw = parts[0].trim();
                String subRaw = parts[1].trim();
                String normBase = normalizeTitleForMatch(baseRaw);
                String normSub = normalizeTitleForMatch(subRaw);
                if (normBase.length() >= 4 && !normBase.matches("^\\d+$")) {
                    exactTargets.add(normBase);
                    exactTargets.add(normBase + " 1");
                    exactTargets.add(normBase + " i");
                    String baseNoArt = stripLeadingArticle(normBase);
                    if (baseNoArt.length() >= 4) {
                        exactTargets.add(baseNoArt);
                        exactTargets.add(baseNoArt + " 1");
                    }
                    addFranchiseRootAndSequels(franchiseRoots, exactTargets, normBase);
                    if (baseNoArt.length() >= 5) {
                        addFranchiseRootAndSequels(franchiseRoots, exactTargets, baseNoArt);
                    }
                    if (normSub.length() >= 4) {
                        String baseRoot = normBase.replaceAll("\\s+([1-9]|i)$", "").trim();
                        if (baseRoot.length() >= 4) {
                            exactTargets.add(baseRoot + " " + normSub);
                        }
                    }
                }
            }
        }

        if (exactTargets.isEmpty()) return list;

        // Scan 100% of the in-memory VOD & Series catalog (never truncates at 2500 rows!)
        List<VodCatalogEntry> catalog = ensureVodCatalogIndex();
        List<VodCatalogEntry> matchedEntries = new ArrayList<>();

        for (VodCatalogEntry e : catalog) {
            if (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType)) {
                if (!streamType.equalsIgnoreCase(e.streamType)) continue;
            }

            boolean matched = exactTargets.contains(e.normFull) || exactTargets.contains(e.normNoArt);

            // Check base title before ':' or ' - ' (e.g. "|FR| Rambo 1 : First Blood", "|FR| Rambo 4 : John Rambo", "|FR| Rocky 6 : Rocky Balboa")
            if (!matched && e.normBase.length() >= 4) {
                if (exactTargets.contains(e.normBase) || exactTargets.contains(e.normBaseNoArt)) {
                    if (e.normBase.matches(".*\\s+([1-9]|i)$")
                            || franchiseRoots.contains(e.normBase)
                            || franchiseRoots.contains(e.normBaseNoArt)
                            || (!e.normSub.isEmpty() && exactTargets.contains(e.normSub))) {
                        matched = true;
                    }
                }
            }

            // Check franchise prefix + sequel number or known subtitle when IPTV title omits ':' / '-' (e.g. "|FR| Rambo 1 First Blood", "|FR| Rambo First Blood")
            if (!matched && e.normFull.length() >= 6) {
                for (String root : franchiseRoots) {
                    String candidate = null;
                    if (e.normFull.startsWith(root + " ")) {
                        candidate = e.normFull.substring(root.length() + 1).trim();
                    } else if (e.normNoArt.startsWith(root + " ")) {
                        candidate = e.normNoArt.substring(root.length() + 1).trim();
                    }
                    if (candidate != null && !candidate.isEmpty()) {
                        if (candidate.matches("^([1-9]|i)(\\b.*|$)")
                                || exactTargets.contains(candidate)
                                || exactTargets.contains(stripLeadingArticle(candidate))) {
                            matched = true;
                            break;
                        }
                    }
                }
            }

            if (matched) {
                matchedEntries.add(e);
            }
        }

        Collections.sort(matchedEntries, (a, b) -> {
            int cNorm = a.normFull.compareTo(b.normFull);
            if (cNorm != 0) return cNorm;
            if (a.langPriority != b.langPriority) return Integer.compare(a.langPriority, b.langPriority);
            return a.rawName.compareToIgnoreCase(b.rawName);
        });

        List<String> orderedIds = new ArrayList<>(matchedEntries.size());
        for (VodCatalogEntry e : matchedEntries) {
            orderedIds.add(e.id);
        }
        return fetchChannelsByIdsOrdered(orderedIds);
    }

    public void indexPersonForChannels(List<ChannelItem> items, String personName, boolean asDirector, boolean asActor) {
        if (items == null || items.isEmpty() || personName == null || personName.trim().isEmpty()) return;
        String cleanPerson = personName.trim();
        String cleanPersonNorm = stripAccents(cleanPerson).toLowerCase(java.util.Locale.ROOT);
        Map<String, VodCatalogEntry> byId = vodCatalogById;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            SQLiteStatement insActor = db.compileStatement("INSERT OR IGNORE INTO movie_actors (channel_id, actor_name, stream_type) VALUES (?, ?, ?)");
            for (ChannelItem item : items) {
                if (item == null || item.id == null || item.id.isEmpty()) continue;
                ContentValues cv = new ContentValues();
                VodCatalogEntry cachedEntry = (byId != null) ? byId.get(item.id) : null;
                if (asActor) {
                    String existingCast = item.cast != null ? item.cast : "";
                    if (!existingCast.toLowerCase(java.util.Locale.ROOT).contains(cleanPerson.toLowerCase(java.util.Locale.ROOT))) {
                        String updatedCast = existingCast.isEmpty() ? cleanPerson : (existingCast + ", " + cleanPerson);
                        cv.put("movie_cast", updatedCast);
                        item.cast = updatedCast;
                        if (cachedEntry != null) {
                            cachedEntry.castNorm = stripAccents(updatedCast).toLowerCase(java.util.Locale.ROOT);
                        }
                    }
                    insActor.bindString(1, item.id);
                    insActor.bindString(2, cleanPerson);
                    insActor.bindString(3, item.streamType != null ? item.streamType : "vod");
                    insActor.executeInsert();
                }
                if (asDirector) {
                    String existingDir = item.director != null ? item.director : "";
                    if (!existingDir.toLowerCase(java.util.Locale.ROOT).contains(cleanPerson.toLowerCase(java.util.Locale.ROOT))) {
                        String updatedDir = existingDir.isEmpty() ? cleanPerson : (existingDir + ", " + cleanPerson);
                        cv.put("director", updatedDir);
                        item.director = updatedDir;
                        if (cachedEntry != null && !cachedEntry.directorNorm.contains(cleanPersonNorm)) {
                            cachedEntry.directorNorm = cachedEntry.directorNorm.isEmpty() ? cleanPersonNorm : (cachedEntry.directorNorm + ", " + cleanPersonNorm);
                        }
                    }
                }
                if (cv.size() > 0) {
                    db.update("channels", cv, "id = ?", new String[]{item.id});
                }
            }
            db.setTransactionSuccessful();
        } catch (Exception e) {
            android.util.Log.w("KeoDatabase", "indexPersonForChannels error: " + e.getMessage());
        } finally {
            db.endTransaction();
        }
    }

    public void saveActorsForChannel(SQLiteDatabase db, String channelId, String cast, String streamType) {
        if (channelId == null || cast == null || cast.trim().isEmpty()) return;
        try {
            SQLiteStatement del = db.compileStatement("DELETE FROM movie_actors WHERE channel_id = ?");
            del.bindString(1, channelId);
            del.executeUpdateDelete();

            SQLiteStatement ins = db.compileStatement("INSERT OR IGNORE INTO movie_actors (channel_id, actor_name, stream_type) VALUES (?, ?, ?)");
            String[] actors = cast.split("[,;/]");
            for (String a : actors) {
                String actorName = a.trim();
                if (actorName.length() > 1) {
                    ins.bindString(1, channelId);
                    ins.bindString(2, actorName);
                    ins.bindString(3, streamType != null ? streamType : "vod");
                    ins.executeInsert();
                }
            }
        } catch (Exception e) {
            android.util.Log.w("KeoDatabase", "saveActorsForChannel error: " + e.getMessage());
        }
    }

    public void updateChannelMetadata(String id, String cast, String director, String plot, String genre, String releaseDate, String rating) {
        if (id == null || id.isEmpty()) return;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            ContentValues cv = new ContentValues();
            if (cast != null) cv.put("movie_cast", cast);
            if (director != null) cv.put("director", director);
            if (plot != null) cv.put("plot", plot);
            if (genre != null) cv.put("genre", genre);
            if (releaseDate != null) cv.put("release_date", releaseDate);
            if (rating != null) cv.put("rating", rating);

            db.update("channels", cv, "id = ?", new String[]{id});

            Map<String, VodCatalogEntry> byId = vodCatalogById;
            VodCatalogEntry mainEntry = (byId != null) ? byId.get(id) : null;
            if (mainEntry != null) {
                if (cast != null) mainEntry.castNorm = stripAccents(cast).toLowerCase(java.util.Locale.ROOT);
                if (director != null) mainEntry.directorNorm = stripAccents(director).toLowerCase(java.util.Locale.ROOT);
            }

            String st = "vod";
            String rawName = null;
            Cursor c = null;
            try {
                c = db.rawQuery("SELECT stream_type, name FROM channels WHERE id = ? LIMIT 1", new String[]{id});
                if (c != null && c.moveToFirst()) {
                    st = c.getString(0);
                    rawName = c.getString(1);
                }
            } catch (Exception ignored) {
            } finally {
                if (c != null) try { c.close(); } catch (Exception ignored) {}
            }

            if (cast != null && !cast.trim().isEmpty()) {
                saveActorsForChannel(db, id, cast, st);
            }

            // Propagate metadata to sibling versions of the same movie/series (e.g. VO, VF, 4K, FHD)
            if (rawName != null && !rawName.trim().isEmpty()) {
                String cleanTitle = extractCleanTitle(rawName);
                if (cleanTitle != null && cleanTitle.length() >= 3) {
                    String cleanUnacc = stripAccents(cleanTitle).toLowerCase(java.util.Locale.ROOT);
                    Cursor siblingCursor = null;
                    try {
                        siblingCursor = db.rawQuery(
                            "SELECT id, name FROM channels WHERE stream_type = ? AND name LIKE ? AND id != ?",
                            new String[]{st, "%" + cleanTitle + "%", id}
                        );
                        List<String> siblingIds = new ArrayList<>();
                        while (siblingCursor != null && siblingCursor.moveToNext()) {
                            String sibId = siblingCursor.getString(0);
                            String sibName = siblingCursor.getString(1);
                            String sibClean = stripAccents(extractCleanTitle(sibName)).toLowerCase(java.util.Locale.ROOT);
                            if (sibClean.equals(cleanUnacc)) {
                                siblingIds.add(sibId);
                            }
                        }
                        if (!siblingIds.isEmpty()) {
                            for (String sibId : siblingIds) {
                                db.update("channels", cv, "id = ?", new String[]{sibId});
                                if (cast != null && !cast.trim().isEmpty()) {
                                    saveActorsForChannel(db, sibId, cast, st);
                                }
                                VodCatalogEntry sibEntry = (byId != null) ? byId.get(sibId) : null;
                                if (sibEntry != null) {
                                    if (cast != null) sibEntry.castNorm = stripAccents(cast).toLowerCase(java.util.Locale.ROOT);
                                    if (director != null) sibEntry.directorNorm = stripAccents(director).toLowerCase(java.util.Locale.ROOT);
                                }
                            }
                        }
                    } catch (Exception e) {
                        android.util.Log.w("KeoDatabase", "update sibling metadata error: " + e.getMessage());
                    } finally {
                        if (siblingCursor != null) try { siblingCursor.close(); } catch (Exception ignored) {}
                    }
                }
            }

            db.setTransactionSuccessful();
        } catch (Exception e) {
            android.util.Log.e("KeoDatabase", "updateChannelMetadata failed: " + e.getMessage());
        } finally {
            db.endTransaction();
        }
    }

    public void toggleFavorite(String channelId) {
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("UPDATE channels SET is_fav = CASE WHEN is_fav = 1 THEN 0 ELSE 1 END WHERE id = ?", new String[]{channelId});
    }

    public void toggleFavorite(String channelId, boolean isFav) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("is_fav", isFav ? 1 : 0);
        db.update("channels", cv, "id = ?", new String[]{channelId});
    }

    // High performance bulk inserts in atomic transaction with auto-schema repair
    public void bulkInsertCategories(List<CategoryItem> categories, String typeToClear) {
        SQLiteDatabase db = getWritableDatabase();
        ensureColumnsExist(db);
        try {
            doBulkInsertCategories(db, categories, typeToClear);
        } catch (android.database.sqlite.SQLiteException e) {
            android.util.Log.e("KeoDatabase", "bulkInsertCategories failed, repairing schema: " + e.getMessage());
            try {
                db.execSQL("DROP TABLE IF EXISTS categories");
                onCreate(db);
                doBulkInsertCategories(db, categories, typeToClear);
            } catch (Exception retryEx) {
                android.util.Log.e("KeoDatabase", "Retry bulkInsertCategories failed: " + retryEx.getMessage());
            }
        }
    }

    private void doBulkInsertCategories(SQLiteDatabase db, List<CategoryItem> categories, String typeToClear) {
        db.beginTransaction();
        try {
            // Read existing user customization (custom_order & is_hidden) before clearing/replacing
            Map<String, int[]> customPrefs = new HashMap<>();
            Cursor c = null;
            try {
                c = db.rawQuery("SELECT id, custom_order, is_hidden FROM categories", null);
                while (c != null && c.moveToNext()) {
                    customPrefs.put(c.getString(0), new int[]{c.getInt(1), c.getInt(2)});
                }
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.close();
            }

            if (typeToClear != null && !typeToClear.isEmpty()) {
                db.execSQL("DELETE FROM categories WHERE type = ?", new String[]{typeToClear});
            }
            SQLiteStatement stmt = db.compileStatement(
                    "INSERT OR REPLACE INTO categories (id, name, type, count, custom_order, icon, is_hidden, is_adult) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

            for (CategoryItem cat : categories) {
                int order = cat.customOrder;
                boolean hidden = cat.isHidden;
                if (customPrefs.containsKey(cat.id)) {
                    int[] p = customPrefs.get(cat.id);
                    if (p != null) {
                        order = p[0];
                        hidden = p[1] == 1;
                    }
                }
                stmt.bindString(1, cat.id);
                stmt.bindString(2, cat.name != null ? cat.name : "");
                stmt.bindString(3, cat.type != null ? cat.type : "live");
                stmt.bindLong(4, cat.count);
                stmt.bindLong(5, order);
                stmt.bindString(6, "Tv");
                stmt.bindLong(7, hidden ? 1 : 0);
                stmt.bindLong(8, cat.isAdult ? 1 : 0);
                stmt.executeInsert();
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    public void bulkInsertChannels(List<ChannelItem> channels, String typeToClear) {
        invalidateVodCatalogCache();
        SQLiteDatabase db = getWritableDatabase();
        ensureColumnsExist(db);
        try {
            doBulkInsertChannels(db, channels, typeToClear);
        } catch (Throwable e) {
            android.util.Log.e("KeoDatabase", "bulkInsertChannels failed: " + e.getMessage());
            try {
                doBaseBulkInsertChannels(db, channels, typeToClear);
            } catch (Throwable retryEx) {
                android.util.Log.e("KeoDatabase", "Fallback base bulkInsertChannels failed: " + retryEx.getMessage());
            }
        }
        invalidateVodCatalogCache();
    }

    private void doBaseBulkInsertChannels(SQLiteDatabase db, List<ChannelItem> channels, String typeToClear) {
        db.beginTransaction();
        try {
            java.util.Set<String> existingFavIds = new java.util.HashSet<>();
            if (typeToClear != null && !typeToClear.isEmpty()) {
                Cursor fc = null;
                try {
                    fc = db.rawQuery("SELECT id FROM channels WHERE is_fav = 1 AND stream_type = ?", new String[]{typeToClear});
                    while (fc != null && fc.moveToNext()) {
                        existingFavIds.add(fc.getString(0));
                    }
                } catch (Exception ignored) {
                } finally {
                    if (fc != null) try { fc.close(); } catch (Exception ignored) {}
                }
                db.execSQL("DELETE FROM channels WHERE stream_type = ?", new String[]{typeToClear});
            }
            SQLiteStatement stmt = db.compileStatement(
                    "INSERT OR REPLACE INTO channels (id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            for (ChannelItem ch : channels) {
                boolean isFav = ch.isFav || existingFavIds.contains(ch.id);
                stmt.bindString(1, ch.id != null ? ch.id : "");
                stmt.bindString(2, ch.name != null ? ch.name : "");
                stmt.bindLong(3, ch.num);
                stmt.bindString(4, ch.groupId != null ? ch.groupId : "");
                stmt.bindString(5, ch.groupName != null ? ch.groupName : "");
                stmt.bindString(6, ch.streamUrl != null ? ch.streamUrl : "");
                stmt.bindString(7, ch.streamType != null ? ch.streamType : "live");
                stmt.bindString(8, ch.logo != null ? ch.logo : "");
                stmt.bindLong(9, isFav ? 1 : 0);
                stmt.bindString(10, ch.resolution != null ? ch.resolution : "HD");
                stmt.bindLong(11, ch.isSeparator ? 1 : 0);
                stmt.bindString(12, ch.streamId != null ? ch.streamId : "");
                stmt.bindLong(13, ch.tvArchive);
                stmt.bindLong(14, ch.tvArchiveDuration);
                stmt.bindString(15, ch.epgChannelId != null ? ch.epgChannelId : "");
                stmt.executeInsert();
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private void doBulkInsertChannels(SQLiteDatabase db, List<ChannelItem> channels, String typeToClear) {
        db.beginTransaction();
        try {
            java.util.Map<String, String[]> cachedMeta = new java.util.HashMap<>();
            if (typeToClear != null && !typeToClear.isEmpty()) {
                Cursor mc = null;
                try {
                    mc = db.rawQuery("SELECT id, is_fav, movie_cast, director, plot, genre, release_date, rating FROM channels WHERE stream_type = ?", new String[]{typeToClear});
                    while (mc != null && mc.moveToNext()) {
                        String id = mc.getString(0);
                        int isFav = mc.getInt(1);
                        String cast = mc.getString(2);
                        String director = mc.getString(3);
                        String plot = mc.getString(4);
                        String genre = mc.getString(5);
                        String releaseDate = mc.getString(6);
                        String rating = mc.getString(7);
                        if (isFav == 1 || (cast != null && !cast.isEmpty()) || (director != null && !director.isEmpty())) {
                            cachedMeta.put(id, new String[]{String.valueOf(isFav), cast, director, plot, genre, releaseDate, rating});
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    if (mc != null) try { mc.close(); } catch (Exception ignored) {}
                }

                db.execSQL("DELETE FROM channels WHERE stream_type = ?", new String[]{typeToClear});
                try {
                    db.execSQL("DELETE FROM movie_actors WHERE stream_type = ?", new String[]{typeToClear});
                } catch (Exception ignored) {}
            }
            SQLiteStatement stmt = db.compileStatement(
                    "INSERT OR REPLACE INTO channels (id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id, movie_cast, director, plot, genre, release_date, rating) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            SQLiteStatement actorStmt = null;
            try {
                actorStmt = db.compileStatement(
                        "INSERT OR IGNORE INTO movie_actors (channel_id, actor_name, stream_type) VALUES (?, ?, ?)");
            } catch (Exception ignored) {}

            for (ChannelItem ch : channels) {
                String[] cached = cachedMeta.get(ch.id);
                boolean isFav = ch.isFav || (cached != null && "1".equals(cached[0]));
                String cast = (ch.cast != null && !ch.cast.isEmpty()) ? ch.cast : (cached != null && cached[1] != null ? cached[1] : "");
                String director = (ch.director != null && !ch.director.isEmpty()) ? ch.director : (cached != null && cached[2] != null ? cached[2] : "");
                String plot = (ch.plot != null && !ch.plot.isEmpty()) ? ch.plot : (cached != null && cached[3] != null ? cached[3] : "");
                String genre = (ch.genre != null && !ch.genre.isEmpty()) ? ch.genre : (cached != null && cached[4] != null ? cached[4] : "");
                String releaseDate = (ch.releaseDate != null && !ch.releaseDate.isEmpty()) ? ch.releaseDate : (cached != null && cached[5] != null ? cached[5] : "");
                String rating = (ch.rating != null && !ch.rating.isEmpty()) ? ch.rating : (cached != null && cached[6] != null ? cached[6] : "");

                stmt.bindString(1, ch.id != null ? ch.id : "");
                stmt.bindString(2, ch.name != null ? ch.name : "");
                stmt.bindLong(3, ch.num);
                stmt.bindString(4, ch.groupId != null ? ch.groupId : "");
                stmt.bindString(5, ch.groupName != null ? ch.groupName : "");
                stmt.bindString(6, ch.streamUrl != null ? ch.streamUrl : "");
                stmt.bindString(7, ch.streamType != null ? ch.streamType : "live");
                stmt.bindString(8, ch.logo != null ? ch.logo : "");
                stmt.bindLong(9, isFav ? 1 : 0);
                stmt.bindString(10, ch.resolution != null ? ch.resolution : "HD");
                stmt.bindLong(11, ch.isSeparator ? 1 : 0);
                stmt.bindString(12, ch.streamId != null ? ch.streamId : "");
                stmt.bindLong(13, ch.tvArchive);
                stmt.bindLong(14, ch.tvArchiveDuration);
                stmt.bindString(15, ch.epgChannelId != null ? ch.epgChannelId : "");
                stmt.bindString(16, cast);
                stmt.bindString(17, director);
                stmt.bindString(18, plot);
                stmt.bindString(19, genre);
                stmt.bindString(20, releaseDate);
                stmt.bindString(21, rating);
                stmt.executeInsert();

                if (actorStmt != null && !cast.trim().isEmpty()) {
                    try {
                        String[] actors = cast.split("[,;/]");
                        for (String a : actors) {
                            String actorName = a.trim();
                            if (actorName.length() > 1) {
                                actorStmt.bindString(1, ch.id != null ? ch.id : "");
                                actorStmt.bindString(2, actorName);
                                actorStmt.bindString(3, ch.streamType != null ? ch.streamType : "vod");
                                actorStmt.executeInsert();
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    // Category count update
    public void updateCategoryCounts() {
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("UPDATE categories SET count = (SELECT COUNT(*) FROM channels WHERE channels.group_id = categories.id AND channels.is_separator = 0)");
    }

    // Counts
    public int getChannelCount(String streamType) {
        SQLiteDatabase db = getReadableDatabase();
        String sql = "SELECT COUNT(*) FROM channels WHERE is_separator = 0";
        String[] args = null;
        if (streamType != null) {
            sql += " AND stream_type = ?";
            args = new String[]{streamType};
        }
        Cursor c = db.rawQuery(sql, args);
        int cnt = 0;
        if (c.moveToFirst()) cnt = c.getInt(0);
        c.close();
        return cnt;
    }

    public int getCategoryCount(String type) {
        SQLiteDatabase db = getReadableDatabase();
        String sql = "SELECT COUNT(*) FROM categories";
        String[] args = null;
        if (type != null) {
            sql += " WHERE type = ?";
            args = new String[]{type};
        }
        Cursor c = db.rawQuery(sql, args);
        int cnt = 0;
        if (c.moveToFirst()) cnt = c.getInt(0);
        c.close();
        return cnt;
    }

    // Settings
    public String getSetting(String key, String defValue) {
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT value FROM settings WHERE key = ?", new String[]{key});
        String val = defValue;
        if (c.moveToFirst()) val = c.getString(0);
        c.close();
        return val;
    }

    public void setSetting(String key, String value) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("key", key);
        cv.put("value", value);
        db.insertWithOnConflict("settings", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
    }
}
