package fr.keo.tv;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteStatement;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "NativeDatabase")
public class NativeDatabasePlugin extends Plugin {

    private static final String TAG = "NativeDatabase";
    private static final String DB_NAME = "keotv_native.db";
    private static final int DB_VERSION = 1;

    private DBHelper dbHelper;

    private static class DBHelper extends SQLiteOpenHelper {
        public DBHelper(Context context) {
            super(context, DB_NAME, null, DB_VERSION);
        }

        @Override
        public void onConfigure(SQLiteDatabase db) {
            super.onConfigure(db);
            db.enableWriteAheadLogging();
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
                    + "m3u_url TEXT, "
                    + "status TEXT, "
                    + "channel_count INTEGER, "
                    + "live_count INTEGER, "
                    + "vod_count INTEGER, "
                    + "series_count INTEGER, "
                    + "exp_date TEXT, "
                    + "max_connections TEXT, "
                    + "account_status TEXT, "
                    + "last_sync_at TEXT"
                    + ");");

            db.execSQL("CREATE TABLE IF NOT EXISTS categories ("
                    + "id TEXT PRIMARY KEY, "
                    + "playlist_id TEXT, "
                    + "name TEXT, "
                    + "type TEXT, "
                    + "count INTEGER, "
                    + "icon TEXT, "
                    + "is_hidden INTEGER DEFAULT 0, "
                    + "custom_order INTEGER DEFAULT 0, "
                    + "is_adult INTEGER DEFAULT 0"
                    + ");");

            db.execSQL("CREATE TABLE IF NOT EXISTS channels ("
                    + "id TEXT PRIMARY KEY, "
                    + "playlist_id TEXT, "
                    + "num INTEGER, "
                    + "name TEXT, "
                    + "logo TEXT, "
                    + "stream_url TEXT, "
                    + "stream_type TEXT, "
                    + "group_id TEXT, "
                    + "group_name TEXT, "
                    + "epg_id TEXT, "
                    + "is_favorite INTEGER DEFAULT 0, "
                    + "is_hidden INTEGER DEFAULT 0, "
                    + "custom_order INTEGER DEFAULT 0, "
                    + "resolution TEXT, "
                    + "is_adult INTEGER DEFAULT 0, "
                    + "is_separator INTEGER DEFAULT 0, "
                    + "stream_id TEXT, "
                    + "has_archive INTEGER DEFAULT 0, "
                    + "archive_days INTEGER DEFAULT 0, "
                    + "added INTEGER DEFAULT 0"
                    + ");");

            db.execSQL("CREATE TABLE IF NOT EXISTS settings ("
                    + "key TEXT PRIMARY KEY, "
                    + "value TEXT"
                    + ");");

            db.execSQL("CREATE INDEX IF NOT EXISTS idx_channels_group ON channels(group_id);");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(stream_type);");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_channels_fav ON channels(is_favorite);");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_categories_order ON categories(custom_order);");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            // Future schema migrations
        }
    }

    @Override
    public void load() {
        super.load();
        dbHelper = new DBHelper(getContext());
    }

    private SQLiteDatabase getDb() {
        if (dbHelper == null) {
            dbHelper = new DBHelper(getContext());
        }
        return dbHelper.getWritableDatabase();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("type", "sqlite_native");
        call.resolve(ret);
    }

    @PluginMethod
    public void bulkInsertCategories(PluginCall call) {
        JSArray cats = call.getArray("categories");
        if (cats == null || cats.length() == 0) {
            call.resolve();
            return;
        }

        new Thread(() -> {
            SQLiteDatabase db = getDb();
            db.beginTransactionNonExclusive();
            try {
                String sql = "INSERT OR REPLACE INTO categories (id, playlist_id, name, type, count, icon, is_hidden, custom_order, is_adult) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);";
                SQLiteStatement stmt = db.compileStatement(sql);

                for (int i = 0; i < cats.length(); i++) {
                    JSONObject obj = cats.optJSONObject(i);
                    if (obj == null) continue;

                    stmt.clearBindings();
                    stmt.bindString(1, obj.optString("id", ""));
                    stmt.bindString(2, obj.optString("playlist_id", ""));
                    stmt.bindString(3, obj.optString("name", ""));
                    stmt.bindString(4, obj.optString("type", "live"));
                    stmt.bindLong(5, obj.optLong("count", 0));
                    stmt.bindString(6, obj.optString("icon", ""));
                    stmt.bindLong(7, obj.optBoolean("is_hidden", false) ? 1 : 0);
                    stmt.bindLong(8, obj.optLong("custom_order", i));
                    stmt.bindLong(9, obj.optBoolean("is_adult", false) ? 1 : 0);
                    stmt.executeInsert();
                }

                db.setTransactionSuccessful();
                JSObject res = new JSObject();
                res.put("inserted", cats.length());
                call.resolve(res);
            } catch (Exception e) {
                Log.e(TAG, "bulkInsertCategories error", e);
                call.reject("Failed to insert categories: " + e.getMessage());
            } finally {
                db.endTransaction();
            }
        }).start();
    }

    @PluginMethod
    public void bulkInsertChannels(PluginCall call) {
        JSArray chs = call.getArray("channels");
        if (chs == null || chs.length() == 0) {
            call.resolve();
            return;
        }

        new Thread(() -> {
            SQLiteDatabase db = getDb();
            db.beginTransactionNonExclusive();
            try {
                String sql = "INSERT OR REPLACE INTO channels (id, playlist_id, num, name, logo, stream_url, stream_type, "
                        + "group_id, group_name, epg_id, is_favorite, is_hidden, custom_order, resolution, is_adult, is_separator, stream_id, has_archive, archive_days, added) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);";
                SQLiteStatement stmt = db.compileStatement(sql);

                for (int i = 0; i < chs.length(); i++) {
                    JSONObject obj = chs.optJSONObject(i);
                    if (obj == null) continue;

                    stmt.clearBindings();
                    stmt.bindString(1, obj.optString("id", ""));
                    stmt.bindString(2, obj.optString("playlist_id", ""));
                    stmt.bindLong(3, obj.optLong("num", i + 1));
                    stmt.bindString(4, obj.optString("name", ""));
                    stmt.bindString(5, obj.optString("logo", ""));
                    stmt.bindString(6, obj.optString("stream_url", ""));
                    stmt.bindString(7, obj.optString("stream_type", "live"));
                    stmt.bindString(8, obj.optString("group_id", ""));
                    stmt.bindString(9, obj.optString("group_name", ""));
                    stmt.bindString(10, obj.optString("epg_id", ""));
                    stmt.bindLong(11, obj.optBoolean("is_favorite", false) ? 1 : 0);
                    stmt.bindLong(12, obj.optBoolean("is_hidden", false) ? 1 : 0);
                    stmt.bindLong(13, obj.optLong("custom_order", i + 1));
                    stmt.bindString(14, obj.optString("resolution", ""));
                    stmt.bindLong(15, obj.optBoolean("is_adult", false) ? 1 : 0);
                    stmt.bindLong(16, obj.optBoolean("is_separator", false) ? 1 : 0);
                    stmt.bindString(17, obj.optString("stream_id", ""));
                    stmt.bindLong(18, obj.optBoolean("has_archive", false) ? 1 : 0);
                    stmt.bindLong(19, obj.optLong("archive_days", 0));
                    stmt.bindLong(20, obj.optLong("added", 0));
                    stmt.executeInsert();
                }

                db.setTransactionSuccessful();
                JSObject res = new JSObject();
                res.put("inserted", chs.length());
                call.resolve(res);
            } catch (Exception e) {
                Log.e(TAG, "bulkInsertChannels error", e);
                call.reject("Failed to insert channels: " + e.getMessage());
            } finally {
                db.endTransaction();
            }
        }).start();
    }

    @PluginMethod
    public void getCategories(PluginCall call) {
        String type = call.getString("type", null);
        boolean includeHidden = Boolean.TRUE.equals(call.getBoolean("includeHidden", false));

        new Thread(() -> {
            SQLiteDatabase db = getDb();
            List<String> whereArgs = new ArrayList<>();
            StringBuilder where = new StringBuilder("1=1");

            if (!includeHidden) {
                where.append(" AND is_hidden = 0");
            }
            if (type != null && !type.isEmpty() && !type.equals("all")) {
                where.append(" AND type = ?");
                whereArgs.add(type);
            }

            Cursor cursor = db.query("categories", null, where.toString(), whereArgs.toArray(new String[0]), null, null, "custom_order ASC");
            JSArray results = new JSArray();
            try {
                while (cursor.moveToNext()) {
                    JSObject cat = new JSObject();
                    cat.put("id", cursor.getString(cursor.getColumnIndexOrThrow("id")));
                    cat.put("playlist_id", cursor.getString(cursor.getColumnIndexOrThrow("playlist_id")));
                    cat.put("name", cursor.getString(cursor.getColumnIndexOrThrow("name")));
                    cat.put("type", cursor.getString(cursor.getColumnIndexOrThrow("type")));
                    cat.put("count", cursor.getInt(cursor.getColumnIndexOrThrow("count")));
                    cat.put("icon", cursor.getString(cursor.getColumnIndexOrThrow("icon")));
                    cat.put("is_hidden", cursor.getInt(cursor.getColumnIndexOrThrow("is_hidden")) == 1);
                    cat.put("custom_order", cursor.getInt(cursor.getColumnIndexOrThrow("custom_order")));
                    cat.put("is_adult", cursor.getInt(cursor.getColumnIndexOrThrow("is_adult")) == 1);
                    results.put(cat);
                }
            } catch (Exception e) {
                Log.e(TAG, "getCategories cursor error", e);
            } finally {
                cursor.close();
            }

            JSObject ret = new JSObject();
            ret.put("categories", results);
            call.resolve(ret);
        }).start();
    }

    @PluginMethod
    public void getChannels(PluginCall call) {
        String groupId = call.getString("groupId", null);
        String streamType = call.getString("streamType", null);
        Boolean isFavorite = call.getBoolean("isFavorite", null);
        int limit = call.getInt("limit", 200);
        int offset = call.getInt("offset", 0);
        String sort = call.getString("sort", "playlist");

        new Thread(() -> {
            SQLiteDatabase db = getDb();
            List<String> whereArgs = new ArrayList<>();
            StringBuilder where = new StringBuilder("is_hidden = 0");

            if (groupId != null && !groupId.isEmpty()) {
                where.append(" AND group_id = ?");
                whereArgs.add(groupId);
            }
            if (streamType != null && !streamType.isEmpty()) {
                where.append(" AND stream_type = ?");
                whereArgs.add(streamType);
            }
            if (isFavorite != null && isFavorite) {
                where.append(" AND is_favorite = 1");
            }

            String orderBy;
            if ("alpha".equals(sort)) {
                orderBy = "name COLLATE NOCASE ASC";
            } else if ("num".equals(sort)) {
                orderBy = "num ASC";
            } else {
                orderBy = "custom_order ASC";
            }

            String limitClause = limit > 0 ? (offset > 0 ? offset + "," + limit : String.valueOf(limit)) : null;

            Cursor cursor = db.query("channels", null, where.toString(), whereArgs.toArray(new String[0]), null, null, orderBy, limitClause);
            JSArray results = new JSArray();
            try {
                while (cursor.moveToNext()) {
                    JSObject ch = new JSObject();
                    ch.put("id", cursor.getString(cursor.getColumnIndexOrThrow("id")));
                    ch.put("playlist_id", cursor.getString(cursor.getColumnIndexOrThrow("playlist_id")));
                    ch.put("num", cursor.getInt(cursor.getColumnIndexOrThrow("num")));
                    ch.put("name", cursor.getString(cursor.getColumnIndexOrThrow("name")));
                    ch.put("logo", cursor.getString(cursor.getColumnIndexOrThrow("logo")));
                    ch.put("stream_url", cursor.getString(cursor.getColumnIndexOrThrow("stream_url")));
                    ch.put("stream_type", cursor.getString(cursor.getColumnIndexOrThrow("stream_type")));
                    ch.put("group_id", cursor.getString(cursor.getColumnIndexOrThrow("group_id")));
                    ch.put("group_name", cursor.getString(cursor.getColumnIndexOrThrow("group_name")));
                    ch.put("epg_id", cursor.getString(cursor.getColumnIndexOrThrow("epg_id")));
                    ch.put("is_favorite", cursor.getInt(cursor.getColumnIndexOrThrow("is_favorite")) == 1);
                    ch.put("is_hidden", cursor.getInt(cursor.getColumnIndexOrThrow("is_hidden")) == 1);
                    ch.put("custom_order", cursor.getInt(cursor.getColumnIndexOrThrow("custom_order")));
                    ch.put("resolution", cursor.getString(cursor.getColumnIndexOrThrow("resolution")));
                    ch.put("is_adult", cursor.getInt(cursor.getColumnIndexOrThrow("is_adult")) == 1);
                    ch.put("is_separator", cursor.getInt(cursor.getColumnIndexOrThrow("is_separator")) == 1);
                    ch.put("stream_id", cursor.getString(cursor.getColumnIndexOrThrow("stream_id")));
                    ch.put("has_archive", cursor.getInt(cursor.getColumnIndexOrThrow("has_archive")) == 1);
                    ch.put("archive_days", cursor.getInt(cursor.getColumnIndexOrThrow("archive_days")));
                    ch.put("added", cursor.getLong(cursor.getColumnIndexOrThrow("added")));
                    results.put(ch);
                }
            } catch (Exception e) {
                Log.e(TAG, "getChannels cursor error", e);
            } finally {
                cursor.close();
            }

            JSObject ret = new JSObject();
            ret.put("channels", results);
            call.resolve(ret);
        }).start();
    }

    @PluginMethod
    public void searchChannels(PluginCall call) {
        String query = call.getString("query", "");
        String streamType = call.getString("streamType", "all");
        int limit = call.getInt("limit", 100);

        if (query.trim().isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("channels", new JSArray());
            call.resolve(empty);
            return;
        }

        new Thread(() -> {
            SQLiteDatabase db = getDb();
            List<String> whereArgs = new ArrayList<>();
            StringBuilder where = new StringBuilder("is_hidden = 0 AND is_separator = 0 AND name LIKE ?");
            whereArgs.add("%" + query.trim() + "%");

            if (streamType != null && !streamType.isEmpty() && !streamType.equals("all")) {
                where.append(" AND stream_type = ?");
                whereArgs.add(streamType);
            }

            Cursor cursor = db.query("channels", null, where.toString(), whereArgs.toArray(new String[0]), null, null, "is_favorite DESC, name COLLATE NOCASE ASC", String.valueOf(limit));
            JSArray results = new JSArray();
            try {
                while (cursor.moveToNext()) {
                    JSObject ch = new JSObject();
                    ch.put("id", cursor.getString(cursor.getColumnIndexOrThrow("id")));
                    ch.put("num", cursor.getInt(cursor.getColumnIndexOrThrow("num")));
                    ch.put("name", cursor.getString(cursor.getColumnIndexOrThrow("name")));
                    ch.put("logo", cursor.getString(cursor.getColumnIndexOrThrow("logo")));
                    ch.put("stream_url", cursor.getString(cursor.getColumnIndexOrThrow("stream_url")));
                    ch.put("stream_type", cursor.getString(cursor.getColumnIndexOrThrow("stream_type")));
                    ch.put("group_id", cursor.getString(cursor.getColumnIndexOrThrow("group_id")));
                    ch.put("group_name", cursor.getString(cursor.getColumnIndexOrThrow("group_name")));
                    ch.put("epg_id", cursor.getString(cursor.getColumnIndexOrThrow("epg_id")));
                    ch.put("is_favorite", cursor.getInt(cursor.getColumnIndexOrThrow("is_favorite")) == 1);
                    ch.put("resolution", cursor.getString(cursor.getColumnIndexOrThrow("resolution")));
                    ch.put("is_separator", cursor.getInt(cursor.getColumnIndexOrThrow("is_separator")) == 1);
                    results.put(ch);
                }
            } catch (Exception e) {
                Log.e(TAG, "searchChannels cursor error", e);
            } finally {
                cursor.close();
            }

            JSObject ret = new JSObject();
            ret.put("channels", results);
            call.resolve(ret);
        }).start();
    }

    @PluginMethod
    public void toggleFavorite(PluginCall call) {
        String channelId = call.getString("channelId", "");
        Boolean isFavorite = call.getBoolean("isFavorite", null);

        if (channelId.isEmpty()) {
            call.reject("channelId requis");
            return;
        }

        new Thread(() -> {
            SQLiteDatabase db = getDb();
            ContentValues cv = new ContentValues();
            if (isFavorite != null) {
                cv.put("is_favorite", isFavorite ? 1 : 0);
            } else {
                db.execSQL("UPDATE channels SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?", new Object[]{channelId});
                call.resolve();
                return;
            }
            db.update("channels", cv, "id = ?", new String[]{channelId});
            call.resolve();
        }).start();
    }

    @PluginMethod
    public void updateCategoryCounts(PluginCall call) {
        new Thread(() -> {
            SQLiteDatabase db = getDb();
            try {
                db.execSQL("UPDATE categories SET count = ("
                        + "SELECT count(*) FROM channels WHERE channels.group_id = categories.id AND channels.is_separator = 0"
                        + ") WHERE categories.type = 'live';");
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to update counts: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void getSetting(PluginCall call) {
        String key = call.getString("key", "");
        if (key.isEmpty()) {
            call.resolve(new JSObject());
            return;
        }

        SQLiteDatabase db = getDb();
        Cursor cursor = db.query("settings", new String[]{"value"}, "key = ?", new String[]{key}, null, null, null);
        try {
            if (cursor.moveToFirst()) {
                String val = cursor.getString(0);
                JSObject ret = new JSObject();
                ret.put("value", val);
                call.resolve(ret);
                return;
            }
        } finally {
            cursor.close();
        }
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void setSetting(PluginCall call) {
        String key = call.getString("key", "");
        String val = call.getString("value", "");

        if (key.isEmpty()) {
            call.resolve();
            return;
        }

        new Thread(() -> {
            SQLiteDatabase db = getDb();
            ContentValues cv = new ContentValues();
            cv.put("key", key);
            cv.put("value", val);
            db.insertWithOnConflict("settings", null, cv, SQLiteDatabase.CONFLICT_REPLACE);
            call.resolve();
        }).start();
    }

    @PluginMethod
    public void clearAll(PluginCall call) {
        new Thread(() -> {
            SQLiteDatabase db = getDb();
            db.beginTransaction();
            try {
                db.delete("channels", null, null);
                db.delete("categories", null, null);
                db.delete("playlists", null, null);
                db.setTransactionSuccessful();
                call.resolve();
            } finally {
                db.endTransaction();
            }
        }).start();
    }
}
