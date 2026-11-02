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

    public List<ChannelItem> searchChannels(String query, String streamType) {
        List<ChannelItem> list = new ArrayList<>();
        if (query == null || query.trim().isEmpty()) return list;
        SQLiteDatabase db = getReadableDatabase();
        String q = "%" + query.trim() + "%";

        Cursor c = null;
        try {
            String sql = "SELECT DISTINCT " + CHANNEL_COLUMNS
                    + " FROM channels WHERE (name LIKE ? OR movie_cast LIKE ? OR director LIKE ? "
                    + " OR id IN (SELECT channel_id FROM movie_actors WHERE actor_name LIKE ?)) "
                    + " AND is_separator = 0";

            List<String> argsList = new ArrayList<>();
            argsList.add(q);
            argsList.add(q);
            argsList.add(q);
            argsList.add(q);

            if (streamType != null && !streamType.isEmpty() && !"all".equalsIgnoreCase(streamType)) {
                sql += " AND stream_type = ?";
                argsList.add(streamType);
            }

            sql += " ORDER BY (CASE WHEN name LIKE ? THEN 0 WHEN movie_cast LIKE ? THEN 1 ELSE 2 END), name ASC LIMIT 100";
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
                        + " FROM channels WHERE name LIKE ? AND is_separator = 0";
                List<String> argsList = new ArrayList<>();
                argsList.add(q);
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

            if (cast != null && !cast.trim().isEmpty()) {
                Cursor c = null;
                String st = "vod";
                try {
                    c = db.rawQuery("SELECT stream_type FROM channels WHERE id = ? LIMIT 1", new String[]{id});
                    if (c != null && c.moveToFirst()) st = c.getString(0);
                } catch (Exception ignored) {
                } finally {
                    if (c != null) try { c.close(); } catch (Exception ignored) {}
                }
                saveActorsForChannel(db, id, cast, st);
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

    private void doBulkInsertChannels(SQLiteDatabase db, List<ChannelItem> channels, String typeToClear) {
        db.beginTransaction();
        try {
            if (typeToClear != null && !typeToClear.isEmpty()) {
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
                stmt.bindString(16, ch.cast != null ? ch.cast : "");
                stmt.bindString(17, ch.director != null ? ch.director : "");
                stmt.bindString(18, ch.plot != null ? ch.plot : "");
                stmt.bindString(19, ch.genre != null ? ch.genre : "");
                stmt.bindString(20, ch.releaseDate != null ? ch.releaseDate : "");
                stmt.bindString(21, ch.rating != null ? ch.rating : "");
                stmt.executeInsert();

                if (actorStmt != null && ch.cast != null && !ch.cast.trim().isEmpty()) {
                    try {
                        String[] actors = ch.cast.split("[,;/]");
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
