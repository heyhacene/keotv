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

    public static String stripAccents(String s) {
        if (s == null) return "";
        String normalized = java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD);
        return normalized.replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
    }

    public static String extractCleanTitle(String rawName) {
        if (rawName == null) return "";
        String s = rawName.trim();
        if (s.startsWith("|")) {
            int lastPipe = s.lastIndexOf('|', Math.min(25, s.length() - 1));
            if (lastPipe >= 0 && lastPipe < s.length() - 1) {
                s = s.substring(lastPipe + 1).trim();
            }
        }
        if (s.startsWith("[")) {
            int lastBracket = s.lastIndexOf(']', Math.min(25, s.length() - 1));
            if (lastBracket >= 0 && lastBracket < s.length() - 1) {
                s = s.substring(lastBracket + 1).trim();
            }
        }
        s = s.replaceAll("^[A-Za-z]{2,6}\\s*[:\\-]\\s*", "");
        s = s.replaceAll("(?i)\\s*\\[(VF|VO|VOSTFR|TRUEFRENCH|MULTI|EN|FR|4K|UHD|FHD|HD|HEVC|1080P|720P)\\]", "");
        s = s.replaceAll("(?i)\\s*\\((VF|VO|VOSTFR|TRUEFRENCH|MULTI|EN|FR|4K|UHD|FHD|HD|HEVC|1080P|720P)\\)", "");
        s = s.replaceAll("\\s*\\((19|20)\\d{2}\\)", "");
        s = s.replaceAll("\\s*\\[(19|20)\\d{2}\\]", "");
        s = s.replaceAll("(?i)\\s*\\b(4K|UHD|FHD|HD|HEVC|1080p|720p)\\b", "");
        return s.trim();
    }

    public List<ChannelItem> searchChannels(String query, String streamType) {
        List<ChannelItem> list = new ArrayList<>();
        if (query == null || query.trim().isEmpty()) return list;
        SQLiteDatabase db = getReadableDatabase();
        String trimmed = query.trim();
        String q = "%" + trimmed + "%";
        String qClean = "%" + extractCleanTitle(trimmed) + "%";
        String qUnaccented = "%" + stripAccents(trimmed) + "%";

        Cursor c = null;
        try {
            String sql = "SELECT DISTINCT " + CHANNEL_COLUMNS
                    + " FROM channels WHERE (name LIKE ? OR name LIKE ? OR name LIKE ? OR movie_cast LIKE ? OR movie_cast LIKE ? OR director LIKE ? OR director LIKE ? OR plot LIKE ? "
                    + " OR id IN (SELECT channel_id FROM movie_actors WHERE actor_name LIKE ? OR actor_name LIKE ?)) "
                    + " AND is_separator = 0";

            List<String> argsList = new ArrayList<>();
            argsList.add(q);
            argsList.add(qClean);
            argsList.add(qUnaccented);
            argsList.add(q);
            argsList.add(qUnaccented);
            argsList.add(q);
            argsList.add(qUnaccented);
            argsList.add(q);
            argsList.add(q);
            argsList.add(qUnaccented);

            if (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType)) {
                sql += " AND stream_type = ?";
                argsList.add(streamType);
            }

            sql += " ORDER BY (CASE WHEN name LIKE ? THEN 0 WHEN movie_cast LIKE ? THEN 1 WHEN director LIKE ? THEN 2 ELSE 3 END), name ASC LIMIT 100";
            argsList.add(q);
            argsList.add(q);
            argsList.add(q);

            c = db.rawQuery(sql, argsList.toArray(new String[0]));
            while (c != null && c.moveToNext()) {
                list.add(cursorToChannel(c));
            }
        } catch (Throwable t) {
            android.util.Log.w("KeoDatabase", "searchChannels primary query failed: " + t.getMessage());
            if (c != null) { try { c.close(); } catch (Exception ignored) {} c = null; }
            try {
                String sql = "SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id "
                        + " FROM channels WHERE (name LIKE ? OR name LIKE ?) AND is_separator = 0";
                List<String> argsList = new ArrayList<>();
                argsList.add(q);
                argsList.add(qUnaccented);
                if (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType)) {
                    sql += " AND stream_type = ?";
                    argsList.add(streamType);
                }
                sql += " ORDER BY num ASC, name ASC LIMIT 100";
                c = db.rawQuery(sql, argsList.toArray(new String[0]));
                while (c != null && c.moveToNext()) {
                    list.add(cursorToChannel(c));
                }
            } catch (Throwable t2) {
                android.util.Log.e("KeoDatabase", "searchChannels fallback failed: " + t2.getMessage());
            }
        } finally {
            if (c != null) {
                try { c.close(); } catch (Exception ignored) {}
            }
        }
        return list;
    }

    public List<ChannelItem> searchChannelsByTitles(List<String> titles, String streamType) {
        List<ChannelItem> list = new ArrayList<>();
        if (titles == null || titles.isEmpty()) return list;
        SQLiteDatabase db = getReadableDatabase();

        List<String> cleanTitles = new ArrayList<>();
        for (String t : titles) {
            if (t == null) continue;
            String s = t.trim();
            if (s.length() < 3) continue;
            if (s.matches("^\\d+$")) continue;
            if (!cleanTitles.contains(s)) {
                cleanTitles.add(s);
                if (cleanTitles.size() >= 150) break;
            }
        }
        if (cleanTitles.isEmpty()) return list;

        StringBuilder sb = new StringBuilder();
        sb.append("SELECT DISTINCT ").append(CHANNEL_COLUMNS).append(" FROM channels WHERE is_separator = 0 AND (");
        List<String> args = new ArrayList<>();
        for (int i = 0; i < cleanTitles.size(); i++) {
            if (i > 0) sb.append(" OR ");
            sb.append("name LIKE ?");
            args.add("%" + cleanTitles.get(i) + "%");
        }
        sb.append(")");

        if (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType)) {
            sb.append(" AND stream_type = ?");
            args.add(streamType);
        }
        sb.append(" ORDER BY name ASC LIMIT 150");

        Cursor c = null;
        try {
            c = db.rawQuery(sb.toString(), args.toArray(new String[0]));
            while (c != null && c.moveToNext()) {
                list.add(cursorToChannel(c));
            }
        } catch (Throwable t) {
            android.util.Log.e("KeoDatabase", "searchChannelsByTitles error: " + t.getMessage());
        } finally {
            if (c != null) try { c.close(); } catch (Exception ignored) {}
        }
        return list;
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
        ensureColumnsExist(db);
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
                    Cursor siblingCursor = null;
                    try {
                        siblingCursor = db.rawQuery(
                            "SELECT id FROM channels WHERE stream_type = ? AND name LIKE ? AND id != ?",
                            new String[]{st, "%" + cleanTitle + "%", id}
                        );
                        List<String> siblingIds = new ArrayList<>();
                        while (siblingCursor != null && siblingCursor.moveToNext()) {
                            siblingIds.add(siblingCursor.getString(0));
                        }
                        if (!siblingIds.isEmpty()) {
                            for (String sibId : siblingIds) {
                                db.update("channels", cv, "id = ?", new String[]{sibId});
                                if (cast != null && !cast.trim().isEmpty()) {
                                    saveActorsForChannel(db, sibId, cast, st);
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
