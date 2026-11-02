package fr.keo.tv;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteStatement;

import java.util.ArrayList;
import java.util.List;

public class KeoDatabase extends SQLiteOpenHelper {

    private static final String DB_NAME = "keotv_native.db";
    private static final int DB_VERSION = 4;
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
        safeEnsureColumn(db, "categories", "is_adult", "INTEGER DEFAULT 0");
        safeEnsureColumn(db, "categories", "is_hidden", "INTEGER DEFAULT 0");
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
                db.execSQL("ALTER TABLE " + table + " ADD COLUMN " + column + " " + typeDef);
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
                + "epg_channel_id TEXT)");

        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ch_group ON channels(group_id)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ch_type ON channels(stream_type)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_ch_fav ON channels(is_fav)");

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
        try {
            db.execSQL("DROP TABLE IF EXISTS categories");
            db.execSQL("DROP TABLE IF EXISTS channels");
            onCreate(db);
        } catch (Exception ignored) {}
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

        public ChannelItem() {}
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
    public List<CategoryItem> getCategories(String type) {
        List<CategoryItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();

        // Add virtual favorites bouquet for live channels
        if ("live".equals(type) || type == null) {
            int favCount = getFavoriteCount();
            if (favCount > 0) {
                CategoryItem fav = new CategoryItem("grp_favs", "⭐ Favoris", "live", favCount, 0);
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
        Cursor c = db.rawQuery("SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id "
                + "FROM channels WHERE group_id = ? AND tv_archive = 1 AND is_separator = 0 ORDER BY num ASC, name ASC", new String[]{groupId});
        while (c.moveToNext()) {
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
            list.add(item);
        }
        c.close();
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
        Cursor c = db.rawQuery("SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id "
                + "FROM channels WHERE group_id = ? AND is_separator = 0 ORDER BY num ASC, name ASC", new String[]{groupId});

        while (c.moveToNext()) {
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
            list.add(item);
        }
        c.close();
        return list;
    }

    public List<ChannelItem> getFavoriteChannels() {
        List<ChannelItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id "
                + "FROM channels WHERE is_fav = 1 AND is_separator = 0 ORDER BY name ASC", null);

        while (c.moveToNext()) {
            ChannelItem item = new ChannelItem();
            item.id = c.getString(0);
            item.name = c.getString(1);
            item.num = c.getInt(2);
            item.groupId = c.getString(3);
            item.groupName = c.getString(4);
            item.streamUrl = c.getString(5);
            item.streamType = c.getString(6);
            item.logo = c.getString(7);
            item.isFav = true;
            item.resolution = c.getString(9);
            item.isSeparator = c.getInt(10) == 1;
            item.streamId = c.getString(11);
            item.tvArchive = c.getInt(12);
            item.tvArchiveDuration = c.getInt(13);
            item.epgChannelId = c.getString(14);
            list.add(item);
        }
        c.close();
        return list;
    }

    public List<ChannelItem> getFavoriteChannels(String typeFilter) {
        if (typeFilter == null || typeFilter.isEmpty()) {
            return getFavoriteChannels();
        }
        List<ChannelItem> list = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id "
                + "FROM channels WHERE is_fav = 1 AND is_separator = 0 AND stream_type = ? ORDER BY name ASC", new String[]{typeFilter});

        while (c.moveToNext()) {
            ChannelItem item = new ChannelItem();
            item.id = c.getString(0);
            item.name = c.getString(1);
            item.num = c.getInt(2);
            item.groupId = c.getString(3);
            item.groupName = c.getString(4);
            item.streamUrl = c.getString(5);
            item.streamType = c.getString(6);
            item.logo = c.getString(7);
            item.isFav = true;
            item.resolution = c.getString(9);
            item.isSeparator = c.getInt(10) == 1;
            item.streamId = c.getString(11);
            item.tvArchive = c.getInt(12);
            item.tvArchiveDuration = c.getInt(13);
            item.epgChannelId = c.getString(14);
            list.add(item);
        }
        c.close();
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

    public List<ChannelItem> searchChannels(String query, String streamType) {
        List<ChannelItem> list = new ArrayList<>();
        if (query == null || query.trim().isEmpty()) return list;
        SQLiteDatabase db = getReadableDatabase();
        String q = "%" + query.trim() + "%";
        String sql = "SELECT id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id "
                + "FROM channels WHERE name LIKE ? AND is_separator = 0";
        String[] args;
        if (streamType != null && !streamType.isEmpty()) {
            sql += " AND stream_type = ?";
            args = new String[]{q, streamType};
        } else {
            args = new String[]{q};
        }
        sql += " ORDER BY num ASC, name ASC LIMIT 100";

        Cursor c = db.rawQuery(sql, args);
        while (c.moveToNext()) {
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
            list.add(item);
        }
        c.close();
        return list;
    }

    public void toggleFavorite(String channelId) {
        SQLiteDatabase db = getWritableDatabase();
        db.execSQL("UPDATE channels SET is_fav = CASE WHEN is_fav = 1 THEN 0 ELSE 1 END WHERE id = ?", new String[]{channelId});
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
            if (typeToClear != null && !typeToClear.isEmpty()) {
                db.execSQL("DELETE FROM categories WHERE type = ?", new String[]{typeToClear});
            }
            SQLiteStatement stmt = db.compileStatement(
                    "INSERT OR REPLACE INTO categories (id, name, type, count, custom_order, icon, is_hidden, is_adult) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

            for (CategoryItem cat : categories) {
                stmt.bindString(1, cat.id);
                stmt.bindString(2, cat.name != null ? cat.name : "");
                stmt.bindString(3, cat.type != null ? cat.type : "live");
                stmt.bindLong(4, cat.count);
                stmt.bindLong(5, cat.customOrder);
                stmt.bindString(6, "Tv");
                stmt.bindLong(7, cat.isHidden ? 1 : 0);
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
        } catch (android.database.sqlite.SQLiteException e) {
            android.util.Log.e("KeoDatabase", "bulkInsertChannels failed, repairing schema: " + e.getMessage());
            try {
                db.execSQL("DROP TABLE IF EXISTS channels");
                onCreate(db);
                doBulkInsertChannels(db, channels, typeToClear);
            } catch (Exception retryEx) {
                android.util.Log.e("KeoDatabase", "Retry bulkInsertChannels failed: " + retryEx.getMessage());
            }
        }
    }

    private void doBulkInsertChannels(SQLiteDatabase db, List<ChannelItem> channels, String typeToClear) {
        db.beginTransaction();
        try {
            if (typeToClear != null && !typeToClear.isEmpty()) {
                db.execSQL("DELETE FROM channels WHERE stream_type = ?", new String[]{typeToClear});
            }
            SQLiteStatement stmt = db.compileStatement(
                    "INSERT OR REPLACE INTO channels (id, name, num, group_id, group_name, stream_url, stream_type, logo, is_fav, resolution, is_separator, stream_id, tv_archive, tv_archive_duration, epg_channel_id) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

            for (ChannelItem ch : channels) {
                stmt.bindString(1, ch.id != null ? ch.id : "");
                stmt.bindString(2, ch.name != null ? ch.name : "");
                stmt.bindLong(3, ch.num);
                stmt.bindString(4, ch.groupId != null ? ch.groupId : "");
                stmt.bindString(5, ch.groupName != null ? ch.groupName : "");
                stmt.bindString(6, ch.streamUrl != null ? ch.streamUrl : "");
                stmt.bindString(7, ch.streamType != null ? ch.streamType : "live");
                stmt.bindString(8, ch.logo != null ? ch.logo : "");
                stmt.bindLong(9, ch.isFav ? 1 : 0);
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
