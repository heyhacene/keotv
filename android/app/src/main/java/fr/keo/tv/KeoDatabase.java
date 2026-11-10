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
    private static final int DB_VERSION = 6;
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

    private volatile boolean schemaVerified = false;

    public synchronized void ensureColumnsExist(SQLiteDatabase db) {
        if (db == null || db.isReadOnly() || schemaVerified) return;
        Set<String> chCols = getTableColumnsLower(db, "channels");
        ensureColIfMissing(db, chCols, "channels", "is_fav", "INTEGER DEFAULT 0");
        ensureColIfMissing(db, chCols, "channels", "resolution", "TEXT");
        ensureColIfMissing(db, chCols, "channels", "is_separator", "INTEGER DEFAULT 0");
        ensureColIfMissing(db, chCols, "channels", "logo", "TEXT");
        ensureColIfMissing(db, chCols, "channels", "stream_id", "TEXT");
        ensureColIfMissing(db, chCols, "channels", "tv_archive", "INTEGER DEFAULT 0");
        ensureColIfMissing(db, chCols, "channels", "tv_archive_duration", "INTEGER DEFAULT 0");
        ensureColIfMissing(db, chCols, "channels", "epg_channel_id", "TEXT");
        ensureColIfMissing(db, chCols, "channels", "movie_cast", "TEXT");
        ensureColIfMissing(db, chCols, "channels", "director", "TEXT");
        ensureColIfMissing(db, chCols, "channels", "plot", "TEXT");
        ensureColIfMissing(db, chCols, "channels", "genre", "TEXT");
        ensureColIfMissing(db, chCols, "channels", "release_date", "TEXT");
        ensureColIfMissing(db, chCols, "channels", "rating", "TEXT");

        Set<String> catCols = getTableColumnsLower(db, "categories");
        ensureColIfMissing(db, catCols, "categories", "is_adult", "INTEGER DEFAULT 0");
        ensureColIfMissing(db, catCols, "categories", "is_hidden", "INTEGER DEFAULT 0");

        try {
            db.execSQL("CREATE TABLE IF NOT EXISTS movie_actors ("
                    + "channel_id TEXT, "
                    + "actor_name TEXT, "
                    + "stream_type TEXT, "
                    + "PRIMARY KEY (channel_id, actor_name))");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_actor_name ON movie_actors(actor_name)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_actor_channel ON movie_actors(channel_id)");
            db.execSQL("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
            Cursor sc = null;
            boolean alreadyCleaned = false;
            try {
                sc = db.rawQuery("SELECT value FROM settings WHERE key = 'clean_polluted_actors_v6'", null);
                alreadyCleaned = (sc != null && sc.moveToFirst());
            } finally {
                if (sc != null) try { sc.close(); } catch (Exception ignored) {}
            }
            if (!alreadyCleaned) {
                db.execSQL("DELETE FROM movie_actors WHERE channel_id IN (SELECT id FROM channels WHERE (plot IS NULL OR plot = '') AND movie_cast IS NOT NULL)");
                db.execSQL("UPDATE channels SET movie_cast = NULL, director = NULL WHERE (plot IS NULL OR plot = '') AND (movie_cast IS NOT NULL OR director IS NOT NULL)");
                db.execSQL("INSERT OR REPLACE INTO settings (key, value) VALUES ('clean_polluted_actors_v6', '1')");
                invalidateVodCatalogCache();
            }
            schemaVerified = true;
        } catch (Exception e) {
            android.util.Log.w("KeoDatabase", "ensureColumnsExist movie_actors failed: " + e.getMessage());
        }
    }

    private Set<String> getTableColumnsLower(SQLiteDatabase db, String table) {
        Set<String> cols = new HashSet<>();
        Cursor c = null;
        try {
            c = db.rawQuery("PRAGMA table_info(" + table + ")", null);
            if (c != null) {
                int nameIdx = c.getColumnIndex("name");
                while (c.moveToNext()) {
                    if (nameIdx >= 0) {
                        String n = c.getString(nameIdx);
                        if (n != null) cols.add(n.toLowerCase(java.util.Locale.ROOT));
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) try { c.close(); } catch (Exception ignored) {}
        }
        return cols;
    }

    private void ensureColIfMissing(SQLiteDatabase db, Set<String> existingLower, String table, String column, String typeDef) {
        if (existingLower != null && existingLower.contains(column.toLowerCase(java.util.Locale.ROOT))) {
            return;
        }
        try {
            db.execSQL("ALTER TABLE " + table + " ADD COLUMN `" + column + "` " + typeDef);
        } catch (Exception e) {
            android.util.Log.w("KeoDatabase", "ensureColIfMissing " + table + "." + column + " failed: " + e.getMessage());
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
    public static final java.util.regex.Pattern PAT_SUBTITLE_SPLIT = java.util.regex.Pattern.compile("\\s*:\\s*|\\s+[\\-–—]\\s+");
    private static final java.util.regex.Pattern PAT_EXTRACT_YEAR_PAREN = java.util.regex.Pattern.compile("[(\\[](19[2-9]\\d|20[0-3]\\d)[)\\]]");
    private static final java.util.regex.Pattern PAT_EXTRACT_YEAR_ANY = java.util.regex.Pattern.compile("\\b(19[2-9]\\d|20[0-3]\\d)\\b");

    private static final java.util.Set<String> GENERIC_FRANCHISE_STOPWORDS = new java.util.HashSet<>(
            java.util.Arrays.asList(
                    "amour", "monde", "secret", "histoire", "famille", "police", "maison", "femme",
                    "homme", "enfant", "ombre", "retour", "dernier", "derniere", "aventure", "voyage",
                    "affaire", "crime", "guerre", "destin", "vengeance", "justice", "verite", "silence",
                    "paradise", "friends", "alive", "dreams", "robots", "insomnia", "boulevard"
            )
    );

    private static int parseFourDigitYear(String s, int offset) {
        char c0 = s.charAt(offset);
        if (c0 != '1' && c0 != '2') return 0;
        char c1 = s.charAt(offset + 1);
        if (c1 < '0' || c1 > '9') return 0;
        char c2 = s.charAt(offset + 2);
        if (c2 < '0' || c2 > '9') return 0;
        char c3 = s.charAt(offset + 3);
        if (c3 < '0' || c3 > '9') return 0;
        return (c0 - '0') * 1000 + (c1 - '0') * 100 + (c2 - '0') * 10 + (c3 - '0');
    }

    public static int extractYear(String rawName, String releaseDate) {
        if (rawName != null) {
            int len = rawName.length();
            for (int i = len - 6; i >= 0; i--) {
                char open = rawName.charAt(i);
                char close = rawName.charAt(i + 5);
                if ((open == '(' && close == ')') || (open == '[' && close == ']')) {
                    int y = parseFourDigitYear(rawName, i + 1);
                    if (y >= 1920 && y <= 2039) return y;
                }
            }
        }
        if (releaseDate != null) {
            int len = releaseDate.length();
            for (int i = 0; i <= len - 4; i++) {
                int y = parseFourDigitYear(releaseDate, i);
                if (y >= 1920 && y <= 2039) {
                    boolean startOk = (i == 0) || !Character.isDigit(releaseDate.charAt(i - 1));
                    boolean endOk = (i + 4 >= len) || !Character.isDigit(releaseDate.charAt(i + 4));
                    if (startOk && endOk) return y;
                }
            }
        }
        return 0;
    }

    public static String[] splitSubtitleFast(String cleanTitle) {
        if (cleanTitle == null) return null;
        int len = cleanTitle.length();
        if (len < 5) return null;
        int colonIdx = cleanTitle.indexOf(':');
        int splitStart = -1;
        int splitEnd = -1;
        if (colonIdx > 0 && colonIdx < len - 1) {
            splitStart = colonIdx;
            splitEnd = colonIdx + 1;
        } else {
            for (int i = 1; i < len - 2; i++) {
                char c = cleanTitle.charAt(i);
                if ((c == '-' || c == '–' || c == '—')
                        && cleanTitle.charAt(i - 1) == ' '
                        && cleanTitle.charAt(i + 1) == ' ') {
                    splitStart = i - 1;
                    splitEnd = i + 2;
                    break;
                }
            }
        }
        if (splitStart <= 0) return null;
        String b = cleanTitle.substring(0, splitStart).trim();
        String s = cleanTitle.substring(splitEnd).trim();
        if (b.isEmpty() || s.isEmpty()) return null;
        return new String[]{b, s};
    }

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
        public int year;
        public final int langPriority;

        public VodCatalogEntry(String id, String streamType, String rawName, String cast, String director, String releaseDate) {
            this.id = id != null ? id : "";
            this.streamType = streamType != null ? streamType : "vod";
            this.rawName = rawName != null ? rawName : "";
            this.cleanTitle = extractCleanTitle(this.rawName);
            this.normFull = normalizeCleanedTitle(this.cleanTitle);
            this.normNoArt = stripLeadingArticle(this.normFull);

            String b = "";
            String s = "";
            String[] parts = splitSubtitleFast(this.cleanTitle);
            if (parts != null) {
                b = normalizeCleanedTitle(parts[0]);
                s = normalizeCleanedTitle(parts[1]);
            }
            this.normBase = b;
            this.normBaseNoArt = b.isEmpty() ? "" : stripLeadingArticle(b);
            this.normSub = s;
            this.castNorm = (cast != null && !cast.isEmpty()) ? stripAccentsLowerFast(cast) : "";
            this.directorNorm = (director != null && !director.isEmpty()) ? stripAccentsLowerFast(director) : "";
            this.year = extractYear(this.rawName, releaseDate);
            this.langPriority = hasPreferredLangTagFast(this.rawName) ? 0 : 1;
        }
    }

    private static boolean hasPreferredLangTagFast(String raw) {
        if (raw == null) return false;
        int limit = Math.min(raw.length(), 28);
        for (int i = 0; i < limit - 1; i++) {
            char c0 = raw.charAt(i);
            char c1 = raw.charAt(i + 1);
            if ((c0 == 'F' || c0 == 'f') && (c1 == 'R' || c1 == 'r')) return true;
            if ((c0 == 'V' || c0 == 'v') && (c1 == 'F' || c1 == 'f' || c1 == 'O' || c1 == 'o')) return true;
            if ((c0 == 'M' || c0 == 'm') && (c1 == 'U' || c1 == 'u')) return true;
        }
        return false;
    }

    private final Object catalogCacheLock = new Object();
    private volatile List<VodCatalogEntry> vodCatalogCache = null;
    private volatile List<VodCatalogEntry> liveCatalogCache = null;
    private volatile Map<String, VodCatalogEntry> vodCatalogById = null;
    private volatile Map<String, List<VodCatalogEntry>> vodByNormTitle = null;
    private volatile Map<String, List<VodCatalogEntry>> vodByFirstWord = null;
    private volatile boolean warmUpStarted = false;

    public void invalidateVodCatalogCache() {
        synchronized (catalogCacheLock) {
            vodCatalogCache = null;
            liveCatalogCache = null;
            vodCatalogById = null;
            vodByNormTitle = null;
            vodByFirstWord = null;
            warmUpStarted = false;
        }
    }

    public void warmUpSearchIndexAsync() {
        if (vodCatalogCache != null || warmUpStarted) return;
        warmUpStarted = true;
        Thread t = new Thread(() -> {
            try {
                android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);
                ensureVodCatalogIndex();
            } catch (Throwable ignored) {}
        }, "KeoSearchIndexWarmup");
        t.setDaemon(true);
        t.start();
    }

    private static void addEntryToMultiMap(Map<String, List<VodCatalogEntry>> map, String key, VodCatalogEntry entry) {
        if (key == null || key.isEmpty()) return;
        List<VodCatalogEntry> list = map.get(key);
        if (list == null) {
            list = new ArrayList<>(2);
            map.put(key, list);
        }
        list.add(entry);
    }

    private static String extractFirstWord(String norm) {
        if (norm == null || norm.isEmpty()) return "";
        int sp = norm.indexOf(' ');
        return sp > 0 ? norm.substring(0, sp) : norm;
    }

    private static void indexVodEntryInMaps(VodCatalogEntry entry,
                                            Map<String, List<VodCatalogEntry>> byNormTitle,
                                            Map<String, List<VodCatalogEntry>> byFirstWord) {
        addEntryToMultiMap(byNormTitle, entry.normFull, entry);
        if (!entry.normNoArt.isEmpty() && !entry.normNoArt.equals(entry.normFull)) {
            addEntryToMultiMap(byNormTitle, entry.normNoArt, entry);
        }
        if (entry.normBase.length() >= 4 && !entry.normBase.equals(entry.normFull)) {
            addEntryToMultiMap(byNormTitle, entry.normBase, entry);
        }
        if (entry.normBaseNoArt.length() >= 6 && !entry.normBaseNoArt.equals(entry.normBase) && !entry.normBaseNoArt.equals(entry.normNoArt)) {
            addEntryToMultiMap(byNormTitle, entry.normBaseNoArt, entry);
        }
        String fw1 = extractFirstWord(entry.normFull);
        if (fw1.length() >= 3) {
            addEntryToMultiMap(byFirstWord, fw1, entry);
        }
        String fw2 = extractFirstWord(entry.normNoArt);
        if (fw2.length() >= 3 && !fw2.equals(fw1)) {
            addEntryToMultiMap(byFirstWord, fw2, entry);
        }
    }

    private List<VodCatalogEntry> ensureVodCatalogIndex() {
        List<VodCatalogEntry> current = vodCatalogCache;
        if (current != null) return current;
        synchronized (catalogCacheLock) {
            if (vodCatalogCache != null) return vodCatalogCache;
            List<VodCatalogEntry> builtVod = new ArrayList<>(40000);
            List<VodCatalogEntry> builtLive = new ArrayList<>(15000);
            Map<String, VodCatalogEntry> byId = new HashMap<>(60000);
            Map<String, List<VodCatalogEntry>> byNormTitle = new HashMap<>(45000);
            Map<String, List<VodCatalogEntry>> byFirstWord = new HashMap<>(25000);
            SQLiteDatabase db = getReadableDatabase();
            Cursor c = null;
            try {
                c = db.rawQuery(
                        "SELECT id, stream_type, name, movie_cast, director, release_date FROM channels WHERE is_separator = 0",
                        null
                );
                while (c != null && c.moveToNext()) {
                    String id = c.getString(0);
                    String st = c.getString(1);
                    String name = c.getString(2);
                    String cast = c.getString(3);
                    String dir = c.getString(4);
                    String rel = c.getString(5);
                    if (id == null || name == null) continue;
                    VodCatalogEntry entry = new VodCatalogEntry(id, st, name, cast, dir, rel);
                    if (!entry.normFull.isEmpty()) {
                        if ("live".equalsIgnoreCase(st)) {
                            builtLive.add(entry);
                        } else {
                            builtVod.add(entry);
                            byId.put(id, entry);
                            indexVodEntryInMaps(entry, byNormTitle, byFirstWord);
                        }
                    }
                }
            } catch (Throwable t) {
                android.util.Log.w("KeoDatabase", "ensureVodCatalogIndex primary failed: " + t.getMessage());
                if (c != null) { try { c.close(); } catch (Exception ignored) {} c = null; }
                try {
                    c = db.rawQuery(
                            "SELECT id, stream_type, name FROM channels WHERE is_separator = 0",
                            null
                    );
                    while (c != null && c.moveToNext()) {
                        String id = c.getString(0);
                        String st = c.getString(1);
                        String name = c.getString(2);
                        if (id == null || name == null) continue;
                        VodCatalogEntry entry = new VodCatalogEntry(id, st, name, "", "", "");
                        if (!entry.normFull.isEmpty()) {
                            if ("live".equalsIgnoreCase(st)) {
                                builtLive.add(entry);
                            } else {
                                builtVod.add(entry);
                                byId.put(id, entry);
                                indexVodEntryInMaps(entry, byNormTitle, byFirstWord);
                            }
                        }
                    }
                } catch (Throwable ignored) {}
            } finally {
                if (c != null) try { c.close(); } catch (Exception ignored) {}
            }
            vodCatalogById = byId;
            vodByNormTitle = byNormTitle;
            vodByFirstWord = byFirstWord;
            liveCatalogCache = builtLive;
            vodCatalogCache = builtVod;
            return builtVod;
        }
    }

    public static String stripAccentsLowerFast(String s) {
        if (s == null || s.isEmpty()) return "";
        int len = s.length();
        boolean needsChange = false;
        for (int i = 0; i < len; i++) {
            char ch = s.charAt(i);
            if (ch >= 128 || (ch >= 'A' && ch <= 'Z')) {
                needsChange = true;
                break;
            }
        }
        if (!needsChange) return s;

        StringBuilder sb = new StringBuilder(len + 4);
        boolean needsNfd = false;
        for (int i = 0; i < len; i++) {
            char ch = s.charAt(i);
            if (ch < 128) {
                if (ch >= 'A' && ch <= 'Z') {
                    sb.append((char) (ch + 32));
                } else {
                    sb.append(ch);
                }
            } else {
                switch (ch) {
                    case '\u00A0': case '\u202F': case '\u2007': case '\u2060':
                        sb.append(' '); break;
                    case 'à': case 'â': case 'ä': case 'á': case 'ã': case 'å':
                    case 'À': case 'Â': case 'Ä': case 'Á': case 'Ã': case 'Å':
                        sb.append('a'); break;
                    case 'é': case 'è': case 'ê': case 'ë':
                    case 'É': case 'È': case 'Ê': case 'Ë':
                        sb.append('e'); break;
                    case 'î': case 'ï': case 'í': case 'ì':
                    case 'Î': case 'Ï': case 'Í': case 'Ì':
                        sb.append('i'); break;
                    case 'ô': case 'ö': case 'ó': case 'ò': case 'õ':
                    case 'Ô': case 'Ö': case 'Ó': case 'Ò': case 'Õ':
                        sb.append('o'); break;
                    case 'ù': case 'û': case 'ü': case 'ú':
                    case 'Ù': case 'Û': case 'Ü': case 'Ú':
                        sb.append('u'); break;
                    case 'ç': case 'Ç':
                        sb.append('c'); break;
                    case 'ñ': case 'Ñ':
                        sb.append('n'); break;
                    case 'ÿ': case 'ý': case 'Ÿ': case 'Ý':
                        sb.append('y'); break;
                    case 'œ': case 'Œ':
                        sb.append("oe"); break;
                    case 'æ': case 'Æ':
                        sb.append("ae"); break;
                    case '’': case '‘': case '´':
                        sb.append('\''); break;
                    case '–': case '—':
                        sb.append('-'); break;
                    default:
                        sb.append(Character.toLowerCase(ch));
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
        String s = rawName;
        if (s.indexOf('\u00A0') >= 0 || s.indexOf('\u202F') >= 0 || s.indexOf('\u2007') >= 0) {
            s = s.replace('\u00A0', ' ').replace('\u202F', ' ').replace('\u2007', ' ');
        }
        int len = s.length();
        int start = 0;
        while (start < len && s.charAt(start) <= ' ') start++;

        // Fast-path: strip leading |...| tags (e.g. "|FR|", "|VO|STFR|") without regex
        while (start < len && s.charAt(start) == '|') {
            int nextPipe = s.indexOf('|', start + 1);
            if (nextPipe > start && nextPipe - start <= 20) {
                start = nextPipe + 1;
                while (start < len && (s.charAt(start) == '|' || s.charAt(start) <= ' ')) {
                    if (s.charAt(start) == '|') {
                        int np2 = s.indexOf('|', start + 1);
                        if (np2 > start && np2 - start <= 20) {
                            start = np2 + 1;
                        } else {
                            start++;
                            break;
                        }
                    } else {
                        start++;
                    }
                }
            } else {
                break;
            }
        }

        // Fast-path: strip leading [...] tags without regex
        while (start < len && s.charAt(start) == '[') {
            int nextBracket = s.indexOf(']', start + 1);
            if (nextBracket > start && nextBracket - start <= 20) {
                start = nextBracket + 1;
                while (start < len && s.charAt(start) <= ' ') start++;
            } else {
                break;
            }
        }

        // Fast-path: strip leading (...) tags without regex
        while (start < len && s.charAt(start) == '(') {
            int nextParen = s.indexOf(')', start + 1);
            if (nextParen > start && nextParen - start <= 14) {
                start = nextParen + 1;
                while (start < len && s.charAt(start) <= ' ') start++;
            } else {
                break;
            }
        }

        int end = len;
        while (end > start && s.charAt(end - 1) <= ' ') end--;

        // Fast-path: strip trailing (YYYY) or [YYYY] without regex
        while (end - start >= 6) {
            char close = s.charAt(end - 1);
            char open = s.charAt(end - 6);
            if ((open == '(' && close == ')') || (open == '[' && close == ']')) {
                int y = parseFourDigitYear(s, end - 5);
                if (y >= 1900 && y <= 2099) {
                    end -= 6;
                    while (end > start && s.charAt(end - 1) <= ' ') end--;
                    continue;
                }
            }
            break;
        }

        if (start > 0 || end < len) {
            s = s.substring(start, end);
        }

        // Only invoke leading code regexes if a ':', '-', or '|' exists near the start
        int checkLeadLimit = Math.min(s.length(), 14);
        boolean hasLeadSep = false;
        for (int i = 1; i < checkLeadLimit; i++) {
            char c = s.charAt(i);
            if (c == ':' || c == '-' || c == '|') {
                hasLeadSep = true;
                break;
            }
        }
        if (hasLeadSep) {
            s = PAT_LEAD_LANG_TAG.matcher(s).replaceFirst("");
            s = PAT_LEAD_SHORT_CODE.matcher(s).replaceFirst("");
        }

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
        if (s.length() >= 5) {
            char lastCh = s.charAt(s.length() - 1);
            if (lastCh >= '0' && lastCh <= '9') {
                s = PAT_TRAIL_YEAR.matcher(s).replaceAll("");
            }
            if (s.indexOf('-') >= 0 || s.indexOf('|') >= 0) {
                s = PAT_TRAIL_LANG.matcher(s).replaceAll("");
            }
        }
        return s.trim();
    }

    public static String normalizeCleanedTitle(String cleaned) {
        if (cleaned == null || cleaned.isEmpty()) return "";
        int len = cleaned.length();
        StringBuilder sb = new StringBuilder(len + 6);
        boolean lastWasSpace = true;
        boolean hasIorV = false;
        boolean needsNfd = false;

        for (int i = 0; i < len; i++) {
            char ch = cleaned.charAt(i);
            char mapped = 0;
            if (ch < 128) {
                if (ch >= 'a' && ch <= 'z') {
                    mapped = ch;
                } else if (ch >= 'A' && ch <= 'Z') {
                    mapped = (char) (ch + 32);
                } else if (ch >= '0' && ch <= '9') {
                    mapped = ch;
                } else if (ch == '&') {
                    if (!lastWasSpace) sb.append(' ');
                    sb.append("et ");
                    lastWasSpace = true;
                    continue;
                } else {
                    // Space or punctuation
                    if (!lastWasSpace) {
                        sb.append(' ');
                        lastWasSpace = true;
                    }
                    continue;
                }
            } else {
                switch (ch) {
                    case 'à': case 'â': case 'ä': case 'á': case 'ã': case 'å':
                    case 'À': case 'Â': case 'Ä': case 'Á': case 'Ã': case 'Å':
                        mapped = 'a'; break;
                    case 'é': case 'è': case 'ê': case 'ë':
                    case 'É': case 'È': case 'Ê': case 'Ë':
                        mapped = 'e'; break;
                    case 'î': case 'ï': case 'í': case 'ì':
                    case 'Î': case 'Ï': case 'Í': case 'Ì':
                        mapped = 'i'; break;
                    case 'ô': case 'ö': case 'ó': case 'ò': case 'õ':
                    case 'Ô': case 'Ö': case 'Ó': case 'Ò': case 'Õ':
                        mapped = 'o'; break;
                    case 'ù': case 'û': case 'ü': case 'ú':
                    case 'Ù': case 'Û': case 'Ü': case 'Ú':
                        mapped = 'u'; break;
                    case 'ç': case 'Ç':
                        mapped = 'c'; break;
                    case 'ñ': case 'Ñ':
                        mapped = 'n'; break;
                    case 'ÿ': case 'ý': case 'Ÿ': case 'Ý':
                        mapped = 'y'; break;
                    case 'œ': case 'Œ':
                        sb.append("oe");
                        lastWasSpace = false;
                        continue;
                    case 'æ': case 'Æ':
                        sb.append("ae");
                        lastWasSpace = false;
                        continue;
                    case '\u00A0': case '\u202F': case '\u2007': case '\u2060':
                    case '’': case '‘': case '´': case '–': case '—':
                        if (!lastWasSpace) {
                            sb.append(' ');
                            lastWasSpace = true;
                        }
                        continue;
                    default:
                        if (Character.isLetterOrDigit(ch)) {
                            mapped = Character.toLowerCase(ch);
                            needsNfd = true;
                        } else {
                            if (!lastWasSpace) {
                                sb.append(' ');
                                lastWasSpace = true;
                            }
                            continue;
                        }
                        break;
                }
            }
            if (mapped == 'i' || mapped == 'v') hasIorV = true;
            sb.append(mapped);
            lastWasSpace = false;
        }

        if (lastWasSpace && sb.length() > 0) {
            sb.setLength(sb.length() - 1);
        }
        String s = sb.toString();
        if (needsNfd) {
            String normalized = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD);
            s = PAT_DIA.matcher(normalized).replaceAll("");
        }
        if (hasIorV) {
            s = replaceStandaloneRomanNumeralsFast(s);
        }
        return s;
    }

    private static String replaceStandaloneRomanNumeralsFast(String s) {
        int len = s.length();
        if (len == 0) return s;
        StringBuilder out = null;
        int lastCopied = 0;
        int i = 0;
        while (i < len) {
            int wordStart = i;
            while (i < len && s.charAt(i) != ' ') i++;
            int wLen = i - wordStart;
            if (wLen >= 1 && wLen <= 4) {
                char c0 = s.charAt(wordStart);
                if (c0 == 'i' || c0 == 'v') {
                    char rep = 0;
                    if (wLen == 1 && c0 == 'v') {
                        rep = '5';
                    } else if (wLen == 2) {
                        char c1 = s.charAt(wordStart + 1);
                        if (c0 == 'i' && c1 == 'i') rep = '2';
                        else if (c0 == 'i' && c1 == 'v') rep = '4';
                        else if (c0 == 'v' && c1 == 'i') rep = '6';
                    } else if (wLen == 3) {
                        char c1 = s.charAt(wordStart + 1);
                        char c2 = s.charAt(wordStart + 2);
                        if (c0 == 'i' && c1 == 'i' && c2 == 'i') rep = '3';
                        else if (c0 == 'v' && c1 == 'i' && c2 == 'i') rep = '7';
                    } else if (wLen == 4) {
                        if (c0 == 'v' && s.charAt(wordStart + 1) == 'i' && s.charAt(wordStart + 2) == 'i' && s.charAt(wordStart + 3) == 'i') {
                            rep = '8';
                        }
                    }
                    if (rep != 0) {
                        if (out == null) out = new StringBuilder(len);
                        out.append(s, lastCopied, wordStart);
                        out.append(rep);
                        lastCopied = i;
                    }
                }
            }
            i++; // skip space
        }
        if (out == null) return s;
        if (lastCopied < len) out.append(s, lastCopied, len);
        return out.toString();
    }

    public static String normalizeTitleForMatch(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        return normalizeCleanedTitle(extractCleanTitle(raw));
    }

    public static String stripLeadingArticle(String norm) {
        if (norm == null || norm.isEmpty()) return "";
        String rem = norm;
        if (norm.startsWith("les ") || norm.startsWith("the ") || norm.startsWith("des ") || norm.startsWith("une ")) {
            rem = norm.substring(4).trim();
        } else if (norm.startsWith("le ") || norm.startsWith("la ") || norm.startsWith("un ")) {
            rem = norm.substring(3).trim();
        } else if (norm.startsWith("l ") || norm.startsWith("d ")) {
            rem = norm.substring(2).trim();
        }
        if (rem.length() < 6 || GENERIC_FRANCHISE_STOPWORDS.contains(rem)) {
            return norm;
        }
        return rem;
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
            // Require whole word match when multi-word or < 6 chars so "Robin" never matches "Robinson"
            boolean requireWhole = (words.length > 1) || (w.length() < 6);
            if (!containsWholeWordOrPrefix(metaNorm, w, requireWhole)) {
                return false;
            }
        }
        return true;
    }

    private static boolean containsAllWholeWords(String metaNorm, String[] words) {
        if (metaNorm == null || metaNorm.isEmpty() || words == null || words.length == 0) return false;
        for (String w : words) {
            if (w.isEmpty()) continue;
            if (!containsWholeWordOrPrefix(metaNorm, w, true)) {
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
        final String qNormPrefix = qNorm + " ";
        final String qUnaccLower = stripAccentsLowerFast(trimmed).trim();
        final String[] qWords = qNorm.isEmpty() ? qUnaccLower.split("\\s+") : qNorm.split("\\s+");
        final boolean includeVodSeries = (streamType == null || streamType.isEmpty() || "all".equalsIgnoreCase(streamType)
                || "vod".equalsIgnoreCase(streamType) || "series".equalsIgnoreCase(streamType));
        final boolean includeLive = (streamType == null || streamType.isEmpty() || "all".equalsIgnoreCase(streamType)
                || "live".equalsIgnoreCase(streamType));
        final boolean filterVodByType = (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType));

        ensureVodCatalogIndex();

        // 1. Scan in-memory VOD & Series catalog (100% coverage, zero SQL LIMIT truncation)
        final Map<String, Integer> matchedVodTier = new HashMap<>();
        final List<VodCatalogEntry> matchedVodEntries = new ArrayList<>();

        if (includeVodSeries && !qNorm.isEmpty()) {
            List<VodCatalogEntry> catalog = vodCatalogCache;
            if (catalog != null) {
                for (VodCatalogEntry e : catalog) {
                    if (filterVodByType && !streamType.equalsIgnoreCase(e.streamType)) continue;
                    int tier = 99;
                    if (e.normFull.equals(qNorm) || e.normNoArt.equals(qNorm)
                            || (!e.normBase.isEmpty() && (e.normBase.equals(qNorm) || e.normBaseNoArt.equals(qNorm)))) {
                        tier = 1; // Exact title or base title match
                    } else if (e.normFull.startsWith(qNormPrefix) || e.normNoArt.startsWith(qNormPrefix)) {
                        tier = 2; // Title starts with query (e.g. "Rambo 2", "Rocky 4")
                    } else if (e.normFull.contains(qNorm)) {
                        if (containsWholeWordOrPrefix(e.normFull, qNorm, qNorm.length() < 4)) {
                            tier = 3; // Whole word/phrase in title (e.g. "John Rambo")
                        } else if (qNorm.length() >= 4) {
                            tier = 5; // Substring in title
                        }
                    } else if (qWords.length > 1 && containsAllWordsInMetadata(e.normFull, qWords)) {
                        tier = 4; // All query words present in title
                    }

                    if (tier == 99 && qUnaccLower.length() >= 3) {
                        if ((!e.castNorm.isEmpty() && containsAllWordsInMetadata(e.castNorm, qWords))
                                || (!e.directorNorm.isEmpty() && containsAllWordsInMetadata(e.directorNorm, qWords))) {
                            tier = 6; // Actor / Director match
                        }
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
        }

        // 2. Include Live channels from in-memory liveCatalogCache (zero disk scan!)
        if (includeLive && !qNorm.isEmpty()) {
            List<VodCatalogEntry> liveCat = liveCatalogCache;
            if (liveCat != null && !liveCat.isEmpty()) {
                List<VodCatalogEntry> matchedLive = new ArrayList<>();
                for (VodCatalogEntry e : liveCat) {
                    if (e.normFull.contains(qNorm) || (qWords.length > 1 && containsAllWordsInMetadata(e.normFull, qWords))) {
                        matchedLive.add(e);
                    }
                }
                Collections.sort(matchedLive, (a, b) -> {
                    if (a.langPriority != b.langPriority) return Integer.compare(a.langPriority, b.langPriority);
                    return a.rawName.compareToIgnoreCase(b.rawName);
                });
                List<String> liveIds = new ArrayList<>(Math.min(matchedLive.size(), 150));
                for (int i = 0; i < Math.min(matchedLive.size(), 150); i++) {
                    liveIds.add(matchedLive.get(i).id);
                }
                list.addAll(fetchChannelsByIdsOrdered(liveIds));
            }
        }

        return list;
    }

    public List<ChannelItem> searchChannelsByPersonName(String fullPersonName, String streamType) {
        List<ChannelItem> list = new ArrayList<>();
        if (fullPersonName == null || fullPersonName.trim().isEmpty()) return list;
        String cleanPerson = stripAccentsLowerFast(fullPersonName).trim();
        String[] nameTokens = cleanPerson.split("\\s+");
        if (nameTokens.length == 0 || nameTokens[0].isEmpty()) return list;

        List<VodCatalogEntry> catalog = ensureVodCatalogIndex();
        List<VodCatalogEntry> matched = new ArrayList<>();
        boolean filterByType = (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType));
        String firstToken = nameTokens[0];

        for (VodCatalogEntry e : catalog) {
            if (filterByType && !streamType.equalsIgnoreCase(e.streamType)) continue;
            boolean isMatch = false;
            if (!e.castNorm.isEmpty() && e.castNorm.contains(firstToken) && containsAllWholeWords(e.castNorm, nameTokens)) {
                isMatch = true;
            } else if (!e.directorNorm.isEmpty() && e.directorNorm.contains(firstToken) && containsAllWholeWords(e.directorNorm, nameTokens)) {
                isMatch = true;
            } else if (e.normFull.contains(firstToken) && containsAllWholeWords(e.normFull, nameTokens)) {
                isMatch = true;
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

    private static String stripTrailingSingleDigit(String s) {
        if (s == null) return "";
        int len = s.length();
        if (len >= 3 && s.charAt(len - 2) == ' ') {
            char last = s.charAt(len - 1);
            if (last >= '1' && last <= '9') {
                return s.substring(0, len - 2).trim();
            }
        }
        return s;
    }

    private static void addYearToKey(Map<String, Set<Integer>> map, String key, int year) {
        if (map == null || key == null || key.isEmpty() || year <= 0) return;
        Set<Integer> set = map.get(key);
        if (set == null) {
            set = new HashSet<>(4);
            map.put(key, set);
        }
        set.add(year);
    }

    public static void registerTitleYear(Map<String, Set<Integer>> map, String rawTitle, int year) {
        if (map == null || rawTitle == null || year <= 0) return;
        String cleaned = extractCleanTitle(rawTitle);
        if (cleaned.length() < 2) return;
        String normFull = normalizeCleanedTitle(cleaned);
        if (normFull.length() < 2) return;

        addYearToKey(map, normFull, year);
        addYearToKey(map, normFull + " 1", year);
        String rootFull = stripTrailingSingleDigit(normFull);
        if (rootFull.length() >= 4) {
            addYearToKey(map, rootFull, year);
        }

        String noArt = stripLeadingArticle(normFull);
        if (noArt.length() >= 4 && !noArt.equals(normFull)) {
            addYearToKey(map, noArt, year);
            addYearToKey(map, noArt + " 1", year);
            String rootNoArt = stripTrailingSingleDigit(noArt);
            if (rootNoArt.length() >= 4) {
                addYearToKey(map, rootNoArt, year);
            }
        }

        String[] parts = splitSubtitleFast(cleaned);
        if (parts != null) {
            String normBase = normalizeCleanedTitle(parts[0]);
            String normSub = normalizeCleanedTitle(parts[1]);
            if (normBase.length() >= 4) {
                addYearToKey(map, normBase, year);
                addYearToKey(map, normBase + " 1", year);
                String baseRoot = stripTrailingSingleDigit(normBase);
                if (baseRoot.length() >= 4) {
                    addYearToKey(map, baseRoot, year);
                    if (normSub.length() >= 4) {
                        addYearToKey(map, baseRoot + " " + normSub, year);
                    }
                }
                String baseNoArt = stripLeadingArticle(normBase);
                if (baseNoArt.length() >= 4) {
                    addYearToKey(map, baseNoArt, year);
                    addYearToKey(map, baseNoArt + " 1", year);
                    String baseNoArtRoot = stripTrailingSingleDigit(baseNoArt);
                    if (baseNoArtRoot.length() >= 4) {
                        addYearToKey(map, baseNoArtRoot, year);
                    }
                }
            }
        }
    }

    private static boolean isEntryYearCompatible(VodCatalogEntry e, String matchedKey, Map<String, Set<Integer>> normTitleYears) {
        if (e == null || e.year <= 0 || normTitleYears == null || normTitleYears.isEmpty()) {
            return true;
        }
        Set<Integer> allowed = null;
        if (matchedKey != null) {
            allowed = normTitleYears.get(matchedKey);
        }
        if ((allowed == null || allowed.isEmpty()) && !e.normFull.isEmpty()) {
            allowed = normTitleYears.get(e.normFull);
        }
        if ((allowed == null || allowed.isEmpty()) && !e.normBase.isEmpty()) {
            allowed = normTitleYears.get(e.normBase);
        }
        if (allowed == null || allowed.isEmpty()) {
            return true;
        }
        boolean isSeries = "series".equalsIgnoreCase(e.streamType);
        for (int y : allowed) {
            if (y <= 0) return true;
            if (isSeries) {
                if (e.year >= y - 1) return true;
            } else {
                if (Math.abs(e.year - y) <= 2) return true;
            }
        }
        return false;
    }

    private static boolean isAllDigits(String s) {
        if (s == null || s.isEmpty()) return false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c < '0' || c > '9') return false;
        }
        return true;
    }

    private static void incrementRootCount(Map<String, Integer> rootCounts, String candidateRoot, Set<String> seenRootsInSameTitle) {
        if (candidateRoot == null) return;
        String root = stripTrailingSingleDigit(candidateRoot);
        if (root.length() >= 5 && !isAllDigits(root) && !GENERIC_FRANCHISE_STOPWORDS.contains(root)) {
            if (seenRootsInSameTitle.add(root)) {
                Integer cur = rootCounts.get(root);
                rootCounts.put(root, cur == null ? 1 : (cur + 1));
            }
        }
    }

    public List<ChannelItem> searchChannelsByTitles(List<String> titles, String streamType) {
        return searchChannelsByTitles(titles, null, streamType);
    }

    public List<ChannelItem> searchChannelsByTitles(List<String> titles, Map<String, Set<Integer>> normTitleYears, String streamType) {
        List<ChannelItem> list = new ArrayList<>();
        if (titles == null || titles.isEmpty()) return list;

        Set<String> exactTargets = new HashSet<>(titles.size() * 3);
        Set<String> franchiseRoots = new HashSet<>();
        Map<String, Integer> rootCounts = new HashMap<>();

        for (String t : titles) {
            if (t == null) continue;
            String cleaned = extractCleanTitle(t);
            if (cleaned.length() < 2 || isAllDigits(cleaned)) continue;

            String normFull = normalizeCleanedTitle(cleaned);
            if (normFull.length() < 2 || isAllDigits(normFull)) continue;

            Set<String> seenRoots = new HashSet<>(4);
            exactTargets.add(normFull);
            exactTargets.add(normFull + " 1");

            String noArt = stripLeadingArticle(normFull);
            if (noArt.length() >= 6 && !noArt.equals(normFull)) {
                exactTargets.add(noArt);
                exactTargets.add(noArt + " 1");
            }

            incrementRootCount(rootCounts, normFull, seenRoots);
            if (noArt.length() >= 6 && !noArt.equals(normFull)) {
                incrementRootCount(rootCounts, noArt, seenRoots);
            }

            // Subtitle separated ONLY by ':' or whitespace-surrounded dash (' - ', ' – ', ' — ')
            String[] parts = splitSubtitleFast(cleaned);
            if (parts != null) {
                String normBase = normalizeCleanedTitle(parts[0]);
                String normSub = normalizeCleanedTitle(parts[1]);
                if (normBase.length() >= 4 && !isAllDigits(normBase)) {
                    exactTargets.add(normBase);
                    exactTargets.add(normBase + " 1");
                    String baseNoArt = stripLeadingArticle(normBase);
                    if (baseNoArt.length() >= 6 && !baseNoArt.equals(normBase)) {
                        exactTargets.add(baseNoArt);
                        exactTargets.add(baseNoArt + " 1");
                    }
                    incrementRootCount(rootCounts, normBase, seenRoots);
                    if (baseNoArt.length() >= 6 && !baseNoArt.equals(normBase)) {
                        incrementRootCount(rootCounts, baseNoArt, seenRoots);
                    }
                    if (normSub.length() >= 4) {
                        String baseRoot = stripTrailingSingleDigit(normBase);
                        if (baseRoot.length() >= 4) {
                            exactTargets.add(baseRoot + " " + normSub);
                        }
                    }
                }
            }
        }

        // Only promote a root to franchiseRoots if it appears in >= 3 variants of this person OR has explicit sequel 2/3
        for (Map.Entry<String, Integer> entry : rootCounts.entrySet()) {
            String root = entry.getKey();
            int count = entry.getValue();
            if (count >= 3 || exactTargets.contains(root + " 2") || exactTargets.contains(root + " 3")) {
                franchiseRoots.add(root);
                exactTargets.add(root);
                for (int n = 1; n <= 9; n++) {
                    exactTargets.add(root + " " + n);
                }
            }
        }

        if (exactTargets.isEmpty()) return list;

        // Ensure in-memory multi-index is built
        ensureVodCatalogIndex();
        Map<String, List<VodCatalogEntry>> byNormTitle = vodByNormTitle;
        Map<String, List<VodCatalogEntry>> byFirstWord = vodByFirstWord;
        if (byNormTitle == null) return list;

        // Collect candidate entries in O(1) via hash index instead of scanning 150,000 catalog items!
        Set<VodCatalogEntry> candidateEntries = new HashSet<>(256);
        for (String target : exactTargets) {
            List<VodCatalogEntry> hits = byNormTitle.get(target);
            if (hits != null) {
                candidateEntries.addAll(hits);
            }
        }
        if (!franchiseRoots.isEmpty() && byFirstWord != null) {
            for (String root : franchiseRoots) {
                String fw = extractFirstWord(root);
                List<VodCatalogEntry> wordHits = byFirstWord.get(fw);
                if (wordHits != null) {
                    candidateEntries.addAll(wordHits);
                }
            }
        }

        if (candidateEntries.isEmpty()) return list;

        List<VodCatalogEntry> matchedEntries = new ArrayList<>(candidateEntries.size());
        boolean filterByType = (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType));

        for (VodCatalogEntry e : candidateEntries) {
            if (filterByType && !streamType.equalsIgnoreCase(e.streamType)) continue;

            String matchedKey = null;
            if (exactTargets.contains(e.normFull)) {
                matchedKey = e.normFull;
            } else if (exactTargets.contains(e.normNoArt)) {
                matchedKey = e.normNoArt;
            }

            // Check base title before ':' or ' - ' (e.g. "|FR| Rambo 1 : First Blood", "|FR| Rambo 4 : John Rambo", "|FR| Rocky 6 : Rocky Balboa")
            if (matchedKey == null && e.normBase.length() >= 4) {
                if (exactTargets.contains(e.normBase) || exactTargets.contains(e.normBaseNoArt)) {
                    String baseRoot = stripTrailingSingleDigit(e.normBase);
                    String baseNoArtRoot = stripTrailingSingleDigit(e.normBaseNoArt);
                    if (franchiseRoots.contains(baseRoot)
                            || franchiseRoots.contains(baseNoArtRoot)
                            || (!e.normSub.isEmpty() && exactTargets.contains(e.normSub))) {
                        matchedKey = exactTargets.contains(e.normBase) ? e.normBase : e.normBaseNoArt;
                    }
                }
            }

            // Check franchise prefix + sequel number or known subtitle when IPTV title omits ':' / '-' (e.g. "|FR| Rambo 1 First Blood")
            if (matchedKey == null && e.normFull.length() >= 6 && !franchiseRoots.isEmpty()) {
                for (String root : franchiseRoots) {
                    int rLen = root.length();
                    String candidate = null;
                    if (e.normFull.length() > rLen + 1 && e.normFull.charAt(rLen) == ' ' && e.normFull.startsWith(root)) {
                        candidate = e.normFull.substring(rLen + 1).trim();
                    } else if (e.normNoArt.length() > rLen + 1 && e.normNoArt.charAt(rLen) == ' ' && e.normNoArt.startsWith(root)) {
                        candidate = e.normNoArt.substring(rLen + 1).trim();
                    }
                    if (candidate != null && !candidate.isEmpty()) {
                        char firstCh = candidate.charAt(0);
                        boolean startsWithSeqDigit = (firstCh >= '1' && firstCh <= '9')
                                && (candidate.length() == 1 || !Character.isLetterOrDigit(candidate.charAt(1)));
                        if (startsWithSeqDigit
                                || exactTargets.contains(candidate)
                                || exactTargets.contains(stripLeadingArticle(candidate))) {
                            matchedKey = root;
                            break;
                        }
                    }
                }
            }

            if (matchedKey != null && isEntryYearCompatible(e, matchedKey, normTitleYears)) {
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
        String cleanPersonNorm = stripAccentsLowerFast(cleanPerson);
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
                    boolean alreadyInCache = (cachedEntry != null && cachedEntry.castNorm != null && cachedEntry.castNorm.contains(cleanPersonNorm));
                    String existingCast = item.cast != null ? item.cast : "";
                    if (!alreadyInCache && !stripAccentsLowerFast(existingCast).contains(cleanPersonNorm)) {
                        String updatedCast = existingCast.isEmpty() ? cleanPerson : (existingCast + ", " + cleanPerson);
                        cv.put("movie_cast", updatedCast);
                        item.cast = updatedCast;
                        if (cachedEntry != null) {
                            cachedEntry.castNorm = stripAccentsLowerFast(updatedCast);
                        }
                        insActor.bindString(1, item.id);
                        insActor.bindString(2, cleanPerson);
                        insActor.bindString(3, item.streamType != null ? item.streamType : "vod");
                        insActor.executeInsert();
                    }
                }
                if (asDirector) {
                    boolean alreadyInCache = (cachedEntry != null && cachedEntry.directorNorm != null && cachedEntry.directorNorm.contains(cleanPersonNorm));
                    String existingDir = item.director != null ? item.director : "";
                    if (!alreadyInCache && !stripAccentsLowerFast(existingDir).contains(cleanPersonNorm)) {
                        String updatedDir = existingDir.isEmpty() ? cleanPerson : (existingDir + ", " + cleanPerson);
                        cv.put("director", updatedDir);
                        item.director = updatedDir;
                        if (cachedEntry != null) {
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

    public void updateChannelMetadataInMemoryOnly(String id, String cast, String director) {
        if (id == null || id.isEmpty()) return;
        Map<String, VodCatalogEntry> byId = vodCatalogById;
        if (byId == null) return;
        VodCatalogEntry mainEntry = byId.get(id);
        if (mainEntry == null) return;
        String castNormNew = (cast != null && !cast.isEmpty()) ? stripAccentsLowerFast(cast) : null;
        String dirNormNew = (director != null && !director.isEmpty()) ? stripAccentsLowerFast(director) : null;
        if (castNormNew != null) mainEntry.castNorm = castNormNew;
        if (dirNormNew != null) mainEntry.directorNorm = dirNormNew;
        Map<String, List<VodCatalogEntry>> byNormTitle = vodByNormTitle;
        if (byNormTitle != null && !mainEntry.normFull.isEmpty()) {
            List<VodCatalogEntry> siblings = byNormTitle.get(mainEntry.normFull);
            if (siblings != null) {
                for (VodCatalogEntry sib : siblings) {
                    if (sib == null || sib.id.equals(id)) continue;
                    if (!mainEntry.streamType.equalsIgnoreCase(sib.streamType)) continue;
                    if (!sib.normFull.equals(mainEntry.normFull)) continue;
                    if (mainEntry.year > 0 && sib.year > 0 && Math.abs(mainEntry.year - sib.year) > 1) continue;
                    if (castNormNew != null) sib.castNorm = castNormNew;
                    if (dirNormNew != null) sib.directorNorm = dirNormNew;
                }
            }
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
            String castNormNew = (cast != null) ? stripAccentsLowerFast(cast) : null;
            String dirNormNew = (director != null) ? stripAccentsLowerFast(director) : null;
            if (mainEntry != null) {
                if (castNormNew != null) mainEntry.castNorm = castNormNew;
                if (dirNormNew != null) mainEntry.directorNorm = dirNormNew;
            }

            String st = (mainEntry != null) ? mainEntry.streamType : "vod";
            if (cast != null && !cast.trim().isEmpty()) {
                saveActorsForChannel(db, id, cast, st);
            }

            // O(1) in-memory sibling propagation via vodByNormTitle (zero SQLite full-table LIKE scan!)
            Map<String, List<VodCatalogEntry>> byNormTitle = vodByNormTitle;
            if (mainEntry != null && byNormTitle != null && !mainEntry.normFull.isEmpty()) {
                List<VodCatalogEntry> siblings = byNormTitle.get(mainEntry.normFull);
                if (siblings != null) {
                    for (VodCatalogEntry sib : siblings) {
                        if (sib == null || sib.id.equals(id)) continue;
                        if (!st.equalsIgnoreCase(sib.streamType)) continue;
                        if (!sib.normFull.equals(mainEntry.normFull)) continue;
                        if (mainEntry.year > 0 && sib.year > 0 && Math.abs(mainEntry.year - sib.year) > 1) continue;
                        db.update("channels", cv, "id = ?", new String[]{sib.id});
                        if (cast != null && !cast.trim().isEmpty()) {
                            saveActorsForChannel(db, sib.id, cast, st);
                        }
                        if (castNormNew != null) sib.castNorm = castNormNew;
                        if (dirNormNew != null) sib.directorNorm = dirNormNew;
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
