package fr.keo.tv;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

public class XtreamClient {

    private static final String TAG = "XtreamClient";
    private static final String USER_AGENT = "IPTVSmartersPro/3.1.5 (Linux; Android 12)";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    static {
        // Trust all SSL certificates for IPTV endpoints (handles self-signed / expired IPTV provider certs)
        try {
            TrustManager[] trustAllCerts = new TrustManager[]{
                    new X509TrustManager() {
                        public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                        public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                        public void checkServerTrusted(X509Certificate[] certs, String authType) {}
                    }
            };
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, trustAllCerts, new SecureRandom());
            HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
            HttpsURLConnection.setDefaultHostnameVerifier((hostname, session) -> true);
        } catch (Exception ignored) {}
    }

    public interface SyncCallback {
        void onProgress(String message);
        void onSuccess(int liveCount, int vodCount, int seriesCount);
        void onError(String error);
    }

    public interface SeriesInfoCallback {
        void onSuccess(JsonObject seriesDetails);
        void onError(String error);
    }

    public void syncPlaylist(final String serverUrl, final String username, final String password,
                             final KeoDatabase db, final SyncCallback callback) {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    postProgress(callback, "Connexion au serveur Xtream...");

                    if (serverUrl == null || serverUrl.trim().isEmpty()) {
                        throw new Exception("L'adresse du serveur est vide");
                    }
                    if (username == null || username.trim().isEmpty() || password == null || password.trim().isEmpty()) {
                        throw new Exception("Identifiant ou mot de passe manquant");
                    }

                    String server = serverUrl.trim().replaceAll("/+$", "");
                    if (!server.startsWith("http://") && !server.startsWith("https://")) {
                        server = "http://" + server;
                    }

                    String cleanUser = username.trim();
                    String cleanPass = password.trim();
                    String encUser = URLEncoder.encode(cleanUser, "UTF-8");
                    String encPass = URLEncoder.encode(cleanPass, "UTF-8");

                    // 1. Authenticate & fetch user info
                    String authUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass;
                    String authJson = fetchUrl(authUrl);

                    JsonElement authElement = JsonParser.parseString(authJson.trim());
                    if (!authElement.isJsonObject()) {
                        throw new Exception("Réponse serveur invalide (Non-JSON)");
                    }

                    JsonObject authObj = authElement.getAsJsonObject();
                    JsonObject userInfo = authObj.has("user_info") && authObj.get("user_info").isJsonObject()
                            ? authObj.getAsJsonObject("user_info") : null;

                    if (userInfo != null) {
                        if (userInfo.has("auth")) {
                            int auth = getOptInt(userInfo, "auth", 1);
                            if (auth == 0) {
                                throw new Exception("Identifiant ou mot de passe refusé par le serveur.");
                            }
                        }
                        if (userInfo.has("status") && "Expired".equalsIgnoreCase(getOptString(userInfo, "status", ""))) {
                            throw new Exception("Abonnement IPTV expiré auprès du fournisseur.");
                        }
                    }

                    String expDate = "Illimité";
                    if (userInfo != null && userInfo.has("exp_date")) {
                        String exp = getOptString(userInfo, "exp_date", "");
                        if (!"null".equalsIgnoreCase(exp) && !"0".equals(exp) && !exp.isEmpty()) {
                            try {
                                long sec = Long.parseLong(exp);
                                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.FRANCE);
                                expDate = sdf.format(new java.util.Date(sec * 1000));
                            } catch (Exception ignored) {}
                        }
                    }

                    // Save verified playlist info
                    KeoDatabase.PlaylistItem pl = new KeoDatabase.PlaylistItem();
                    pl.id = "active_xtream";
                    pl.name = "Abonnement Xtream";
                    pl.type = "xtream";
                    pl.serverUrl = server;
                    pl.username = cleanUser;
                    pl.password = cleanPass;
                    pl.expDate = expDate;
                    pl.lastSyncAt = new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.FRANCE).format(new java.util.Date());
                    db.savePlaylist(pl);

                    // 2. Fetch Live Categories
                    postProgress(callback, "Téléchargement des bouquets TV...");
                    String catUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_live_categories";
                    String catJson = fetchUrl(catUrl);

                    List<JsonObject> catObjects = parseJsonList(catJson);
                    List<KeoDatabase.CategoryItem> liveCategories = new ArrayList<>();
                    int order = 1;

                    for (JsonObject obj : catObjects) {
                        String catId = getOptString(obj, "category_id", null);
                        String catName = getOptString(obj, "category_name", "Bouquet");
                        if (catId == null || catId.isEmpty()) continue;

                        boolean isAdult = isAdultCategory(catName);
                        KeoDatabase.CategoryItem c = new KeoDatabase.CategoryItem(
                                "grp_live_" + catId,
                                catName,
                                "live",
                                0,
                                order++
                        );
                        c.isAdult = isAdult;
                        liveCategories.add(c);
                    }
                    db.bulkInsertCategories(liveCategories, "live");

                    // 3. Fetch Live Streams
                    postProgress(callback, "Téléchargement des chaînes TV en direct...");
                    String streamsUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_live_streams";
                    String streamsJson = fetchUrl(streamsUrl);

                    List<JsonObject> streamObjects = parseJsonList(streamsJson);
                    List<KeoDatabase.ChannelItem> liveChannels = new ArrayList<>();

                    for (JsonObject obj : streamObjects) {
                        String name = getOptString(obj, "name", "").trim();
                        String streamId = getOptString(obj, "stream_id", "");
                        String catId = getOptString(obj, "category_id", "");
                        int num = getOptInt(obj, "num", liveChannels.size() + 1);
                        String logo = getOptString(obj, "stream_icon", "");
                        int tvArchive = getOptInt(obj, "tv_archive", 0);
                        int tvArchiveDuration = getOptInt(obj, "tv_archive_duration", 0);
                        String epgChannelId = getOptString(obj, "epg_channel_id", "");

                        if (streamId.isEmpty() || isSeparatorChannel(name)) {
                            continue;
                        }

                        String streamUrlFinal = server + "/live/" + encUser + "/" + encPass + "/" + streamId + ".m3u8";

                        KeoDatabase.ChannelItem ch = new KeoDatabase.ChannelItem();
                        ch.id = "xtream_live_" + streamId;
                        ch.name = name;
                        ch.num = num;
                        ch.groupId = "grp_live_" + catId;
                        ch.groupName = "Bouquet " + catId;
                        ch.streamUrl = streamUrlFinal;
                        ch.streamType = "live";
                        ch.logo = logo;
                        ch.isFav = false;
                        ch.resolution = detectResolution(name);
                        ch.isSeparator = false;
                        ch.streamId = streamId;
                        ch.tvArchive = tvArchive;
                        ch.tvArchiveDuration = tvArchiveDuration;
                        ch.epgChannelId = epgChannelId;

                        liveChannels.add(ch);
                    }
                    db.bulkInsertChannels(liveChannels, "live");

                    // 4. Fetch VOD Categories & Streams (Films)
                    int vodCount = 0;
                    try {
                        postProgress(callback, "Téléchargement des catégories Films (VOD)...");
                        String vodCatUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_vod_categories";
                        String vodCatJson = fetchUrl(vodCatUrl);
                        List<JsonObject> vodCatObjects = parseJsonList(vodCatJson);
                        List<KeoDatabase.CategoryItem> vodCategories = new ArrayList<>();
                        int vodOrder = 1;
                        for (JsonObject obj : vodCatObjects) {
                            String catId = getOptString(obj, "category_id", null);
                            String catName = getOptString(obj, "category_name", "Films");
                            if (catId == null || catId.isEmpty()) continue;
                            KeoDatabase.CategoryItem c = new KeoDatabase.CategoryItem(
                                    "grp_vod_" + catId,
                                    catName,
                                    "vod",
                                    0,
                                    vodOrder++
                            );
                            c.isAdult = isAdultCategory(catName);
                            vodCategories.add(c);
                        }
                        db.bulkInsertCategories(vodCategories, "vod");

                        postProgress(callback, "Téléchargement du catalogue Films (VOD)...");
                        String vodStreamsUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_vod_streams";
                        String vodStreamsJson = fetchUrl(vodStreamsUrl);
                        List<JsonObject> vodStreamObjects = parseJsonList(vodStreamsJson);
                        List<KeoDatabase.ChannelItem> vodMovies = new ArrayList<>();

                        for (JsonObject obj : vodStreamObjects) {
                            String name = getOptString(obj, "name", "").trim();
                            String streamId = getOptString(obj, "stream_id", "");
                            String catId = getOptString(obj, "category_id", "");
                            int num = getOptInt(obj, "num", vodMovies.size() + 1);
                            String logo = getOptString(obj, "stream_icon", "");
                            String ext = getOptString(obj, "container_extension", "mp4");
                            if (ext.isEmpty()) ext = "mp4";

                            if (streamId.isEmpty() || isSeparatorChannel(name)) continue;

                            String streamUrlFinal = server + "/movie/" + encUser + "/" + encPass + "/" + streamId + "." + ext;

                            KeoDatabase.ChannelItem ch = new KeoDatabase.ChannelItem();
                            ch.id = "xtream_vod_" + streamId;
                            ch.name = name;
                            ch.num = num;
                            ch.groupId = "grp_vod_" + catId;
                            ch.groupName = "Films " + catId;
                            ch.streamUrl = streamUrlFinal;
                            ch.streamType = "vod";
                            ch.logo = logo;
                            ch.isFav = false;
                            ch.resolution = detectResolution(name);
                            ch.isSeparator = false;
                            ch.streamId = streamId;

                            vodMovies.add(ch);
                        }
                        db.bulkInsertChannels(vodMovies, "vod");
                        vodCount = vodMovies.size();
                    } catch (Throwable t) {
                        Log.e(TAG, "Erreur téléchargement VOD (Films)", t);
                    }

                    // 5. Fetch Series Categories & Series
                    int seriesCount = 0;
                    try {
                        postProgress(callback, "Téléchargement des Séries...");
                        String seriesCatUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_series_categories";
                        String seriesCatJson = fetchUrl(seriesCatUrl);
                        List<JsonObject> seriesCatObjects = parseJsonList(seriesCatJson);
                        List<KeoDatabase.CategoryItem> seriesCategories = new ArrayList<>();
                        int seriesOrder = 1;
                        for (JsonObject obj : seriesCatObjects) {
                            String catId = getOptString(obj, "category_id", null);
                            String catName = getOptString(obj, "category_name", "Séries");
                            if (catId == null || catId.isEmpty()) continue;
                            KeoDatabase.CategoryItem c = new KeoDatabase.CategoryItem(
                                    "grp_series_" + catId,
                                    catName,
                                    "series",
                                    0,
                                    seriesOrder++
                            );
                            c.isAdult = isAdultCategory(catName);
                            seriesCategories.add(c);
                        }
                        db.bulkInsertCategories(seriesCategories, "series");

                        String seriesStreamsUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_series";
                        String seriesStreamsJson = fetchUrl(seriesStreamsUrl);
                        List<JsonObject> seriesStreamObjects = parseJsonList(seriesStreamsJson);
                        List<KeoDatabase.ChannelItem> seriesList = new ArrayList<>();

                        for (JsonObject obj : seriesStreamObjects) {
                            String name = getOptString(obj, "name", "").trim();
                            String seriesId = getOptString(obj, "series_id", "");
                            String catId = getOptString(obj, "category_id", "");
                            int num = getOptInt(obj, "num", seriesList.size() + 1);
                            String logo = getOptString(obj, "cover", "");

                            if (seriesId.isEmpty() || isSeparatorChannel(name)) continue;

                            KeoDatabase.ChannelItem ch = new KeoDatabase.ChannelItem();
                            ch.id = "xtream_series_" + seriesId;
                            ch.name = name;
                            ch.num = num;
                            ch.groupId = "grp_series_" + catId;
                            ch.groupName = "Série " + catId;
                            ch.streamUrl = ""; // series episode resolver
                            ch.streamType = "series";
                            ch.logo = logo;
                            ch.isFav = false;
                            ch.resolution = "HD";
                            ch.isSeparator = false;
                            ch.streamId = seriesId;

                            seriesList.add(ch);
                        }
                        db.bulkInsertChannels(seriesList, "series");
                        seriesCount = seriesList.size();
                    } catch (Throwable t) {
                        Log.e(TAG, "Erreur téléchargement Séries", t);
                    }

                    db.updateCategoryCounts();

                    final int finalLiveCount = liveChannels.size();
                    final int finalVodCount = vodCount;
                    final int finalSeriesCount = seriesCount;

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            callback.onSuccess(finalLiveCount, finalVodCount, finalSeriesCount);
                        }
                    });

                } catch (final Exception e) {
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            String err = e.getMessage() != null ? e.getMessage() : e.toString();
                            callback.onError(err);
                        }
                    });
                }
            }
        });
    }

    public void fetchSeriesInfo(final String serverUrl, final String username, final String password,
                                final String seriesId, final SeriesInfoCallback callback) {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    String server = serverUrl.trim().replaceAll("/+$", "");
                    if (!server.startsWith("http://") && !server.startsWith("https://")) {
                        server = "http://" + server;
                    }
                    String encUser = URLEncoder.encode(username.trim(), "UTF-8");
                    String encPass = URLEncoder.encode(password.trim(), "UTF-8");
                    String url = server + "/player_api.php?username=" + encUser + "&password=" + encPass
                            + "&action=get_series_info&series_id=" + seriesId;

                    String json = fetchUrl(url);
                    JsonElement el = JsonParser.parseString(json.trim());
                    if (!el.isJsonObject()) {
                        throw new Exception("Réponse serveur invalide");
                    }
                    final JsonObject root = el.getAsJsonObject();
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            callback.onSuccess(root);
                        }
                    });
                } catch (final Exception e) {
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            callback.onError(e.getMessage() != null ? e.getMessage() : e.toString());
                        }
                    });
                }
            }
        });
    }

    private void postProgress(final SyncCallback callback, final String message) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                callback.onProgress(message);
            }
        });
    }

    public static List<JsonObject> parseJsonList(String jsonStr) {
        List<JsonObject> list = new ArrayList<>();
        if (jsonStr == null || jsonStr.trim().isEmpty()) return list;

        try {
            JsonElement el = JsonParser.parseString(jsonStr.trim());
            if (el.isJsonArray()) {
                for (JsonElement item : el.getAsJsonArray()) {
                    if (item.isJsonObject()) list.add(item.getAsJsonObject());
                }
            } else if (el.isJsonObject()) {
                JsonObject obj = el.getAsJsonObject();
                for (Map.Entry<String, JsonElement> entry : obj.entrySet()) {
                    if (entry.getValue().isJsonObject()) {
                        list.add(entry.getValue().getAsJsonObject());
                    }
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "Erreur parsing JSON list", t);
        }

        return list;
    }

    private String fetchUrl(String urlStr) throws Exception {
        String currentUrl = urlStr;
        int redirects = 0;

        while (redirects < 6) {
            URL url = new URL(currentUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setRequestProperty("Accept-Encoding", "gzip");
            conn.setRequestProperty("Accept", "application/json, text/plain, */*");
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(60000);

            int code = conn.getResponseCode();

            if (code == HttpURLConnection.HTTP_MOVED_PERM || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc != null && !loc.isEmpty()) {
                    currentUrl = loc.startsWith("http") ? loc : new URL(url, loc).toString();
                    redirects++;
                    continue;
                }
            }

            if (code == 401 || code == 403) {
                conn.disconnect();
                throw new Exception("Accès refusé (HTTP " + code + ") : Identifiant ou mot de passe invalide");
            }

            if (code != 200) {
                conn.disconnect();
                throw new Exception("Erreur serveur HTTP " + code);
            }

            InputStream in = conn.getInputStream();
            if ("gzip".equalsIgnoreCase(conn.getContentEncoding())) {
                in = new GZIPInputStream(in);
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8), 16384);
            StringBuilder sb = new StringBuilder(65536);
            char[] buf = new char[8192];
            int read;
            while ((read = reader.read(buf, 0, buf.length)) != -1) {
                sb.append(buf, 0, read);
            }
            reader.close();
            conn.disconnect();
            return sb.toString();
        }

        throw new Exception("Trop de redirections réseau (" + redirects + ")");
    }

    public static String getOptString(JsonObject obj, String key, String defVal) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) return defVal;
        try {
            return obj.get(key).getAsString();
        } catch (Exception e) {
            return obj.get(key).toString().replace("\"", "");
        }
    }

    public static int getOptInt(JsonObject obj, String key, int defVal) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) return defVal;
        try {
            return obj.get(key).getAsInt();
        } catch (Exception e) {
            try {
                return Integer.parseInt(obj.get(key).getAsString());
            } catch (Exception ignored) {
                return defVal;
            }
        }
    }

    public static boolean isSeparatorChannel(String name) {
        if (name == null || name.trim().isEmpty()) return true;
        String trimmed = name.trim();
        if (trimmed.startsWith("---") || trimmed.startsWith("===") || trimmed.startsWith("***")) return true;
        if (trimmed.startsWith("▼") || trimmed.startsWith("▲") || trimmed.startsWith("▶") || trimmed.startsWith("◀")) return true;
        if (trimmed.endsWith("---") || trimmed.endsWith("===") || trimmed.endsWith("***")) return true;
        if (trimmed.endsWith("▼") || trimmed.endsWith("▲")) return true;
        return false;
    }

    public static boolean isAdultCategory(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.contains("xxx") || lower.contains("adult") || lower.contains("18+")
                || lower.contains("pour adulte") || lower.contains("charme") || lower.contains("for adult");
    }

    public static String detectResolution(String name) {
        if (name == null) return "HD";
        String upper = name.toUpperCase();
        if (upper.contains("4K") || upper.contains("UHD")) return "4K";
        if (upper.contains("FHD") || upper.contains("1080")) return "FHD";
        if (upper.contains("HD") || upper.contains("720")) return "HD";
        if (upper.contains("SD") || upper.contains("576")) return "SD";
        return "HD";
    }

    public static class EpgProgram {
        public String id;
        public String title;
        public String desc;
        public String start; // e.g. "2026-11-01 20:50:00"
        public String stop;  // e.g. "2026-11-01 22:45:00"
        public long startTimestamp;
        public long stopTimestamp;
        public int durationMinutes;

        public String getFormattedTime() {
            try {
                if (start != null && start.length() >= 16) {
                    String timeStart = start.substring(11, 16);
                    if (stop != null && stop.length() >= 16) {
                        return timeStart + " - " + stop.substring(11, 16);
                    }
                    return timeStart;
                }
            } catch (Exception ignored) {}
            return "";
        }
    }

    public interface EpgCallback {
        void onSuccess(List<EpgProgram> programs, EpgProgram current, EpgProgram next);
        void onError(String error);
    }

    public interface CatchupCallback {
        void onSuccess(List<EpgProgram> pastPrograms);
        void onError(String error);
    }

    public static String decodeBase64IfEncoded(String text) {
        if (text == null || text.trim().isEmpty()) return "";
        String trimmed = text.trim();
        try {
            if (!trimmed.contains(" ") && trimmed.length() % 4 == 0) {
                byte[] decoded = Base64.decode(trimmed, Base64.DEFAULT);
                String utf8 = new String(decoded, StandardCharsets.UTF_8);
                if (utf8.length() > 0 && !utf8.contains("\uFFFD")) {
                    return utf8;
                }
            }
        } catch (Exception ignored) {}
        return text;
    }

    public static void fetchShortEpg(final Context context, final String serverUrl, final String username, final String password, final String streamId, final EpgCallback callback) {
        if (streamId == null || streamId.isEmpty() || serverUrl == null) {
            if (callback != null) callback.onError("Paramètres EPG manquants");
            return;
        }

        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                String encUser = URLEncoder.encode(username != null ? username : "", "UTF-8");
                String encPass = URLEncoder.encode(password != null ? password : "", "UTF-8");
                String server = serverUrl.replaceAll("/+$", "");
                String epgUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_short_epg&stream_id=" + streamId + "&limit=10";

                String jsonStr = fetchUrl(epgUrl);
                JsonObject root = JsonParser.parseString(jsonStr).getAsJsonObject();
                List<EpgProgram> list = new ArrayList<>();
                EpgProgram current = null;
                EpgProgram next = null;
                long nowSec = System.currentTimeMillis() / 1000L;

                if (root.has("epg_listings") && root.get("epg_listings").isJsonArray()) {
                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
                    for (JsonElement el : root.getAsJsonArray("epg_listings")) {
                        if (!el.isJsonObject()) continue;
                        JsonObject obj = el.getAsJsonObject();
                        EpgProgram p = new EpgProgram();
                        p.id = getOptString(obj, "id", "");
                        p.title = decodeBase64IfEncoded(getOptString(obj, "title", "Programme TV"));
                        p.desc = decodeBase64IfEncoded(getOptString(obj, "description", ""));
                        p.start = getOptString(obj, "start", "");
                        p.stop = getOptString(obj, "end", "");

                        try {
                            if (obj.has("start_timestamp")) {
                                p.startTimestamp = obj.get("start_timestamp").getAsLong();
                            } else if (!p.start.isEmpty()) {
                                Date d = sdf.parse(p.start);
                                if (d != null) p.startTimestamp = d.getTime() / 1000L;
                            }
                            if (obj.has("stop_timestamp")) {
                                p.stopTimestamp = obj.get("stop_timestamp").getAsLong();
                            } else if (!p.stop.isEmpty()) {
                                Date d = sdf.parse(p.stop);
                                if (d != null) p.stopTimestamp = d.getTime() / 1000L;
                            }
                            if (p.stopTimestamp > p.startTimestamp) {
                                p.durationMinutes = (int) ((p.stopTimestamp - p.startTimestamp) / 60);
                            }
                        } catch (Exception ignored) {}

                        list.add(p);
                        if (nowSec >= p.startTimestamp && nowSec <= p.stopTimestamp) {
                            current = p;
                        } else if (nowSec < p.startTimestamp && next == null) {
                            next = p;
                        }
                    }
                }

                if (current == null && !list.isEmpty()) {
                    current = list.get(0);
                }
                if (next == null && list.size() > 1) {
                    next = list.get(1);
                }

                final List<EpgProgram> finalList = list;
                final EpgProgram finalCurrent = current;
                final EpgProgram finalNext = next;

                new Handler(Looper.getMainLooper()).post(() -> {
                    if (callback != null) callback.onSuccess(finalList, finalCurrent, finalNext);
                });
            } catch (Exception e) {
                new Handler(Looper.getMainLooper()).post(() -> {
                    if (callback != null) callback.onError(e.getMessage());
                });
            }
        });
    }

    public static void fetchCatchupPrograms(final Context context, final String serverUrl, final String username, final String password, final String streamId, final CatchupCallback callback) {
        if (streamId == null || streamId.isEmpty() || serverUrl == null) {
            if (callback != null) callback.onError("Paramètres Replay manquants");
            return;
        }

        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                String encUser = URLEncoder.encode(username != null ? username : "", "UTF-8");
                String encPass = URLEncoder.encode(password != null ? password : "", "UTF-8");
                String server = serverUrl.replaceAll("/+$", "");
                String catchupUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_simple_data_table&stream_id=" + streamId;

                String jsonStr = fetchUrl(catchupUrl);
                JsonObject root = JsonParser.parseString(jsonStr).getAsJsonObject();
                List<EpgProgram> list = new ArrayList<>();
                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);

                if (root.has("epg_listings") && root.get("epg_listings").isJsonArray()) {
                    for (JsonElement el : root.getAsJsonArray("epg_listings")) {
                        if (!el.isJsonObject()) continue;
                        JsonObject obj = el.getAsJsonObject();
                        int hasArchive = getOptInt(obj, "has_archive", 1);
                        if (hasArchive == 0) continue;

                        EpgProgram p = new EpgProgram();
                        p.id = getOptString(obj, "id", "");
                        p.title = decodeBase64IfEncoded(getOptString(obj, "title", "Programme TV"));
                        p.desc = decodeBase64IfEncoded(getOptString(obj, "description", ""));
                        p.start = getOptString(obj, "start", "");
                        p.stop = getOptString(obj, "end", "");

                        try {
                            if (obj.has("start_timestamp")) {
                                p.startTimestamp = obj.get("start_timestamp").getAsLong();
                            } else if (!p.start.isEmpty()) {
                                Date d = sdf.parse(p.start);
                                if (d != null) p.startTimestamp = d.getTime() / 1000L;
                            }
                            if (obj.has("stop_timestamp")) {
                                p.stopTimestamp = obj.get("stop_timestamp").getAsLong();
                            } else if (!p.stop.isEmpty()) {
                                Date d = sdf.parse(p.stop);
                                if (d != null) p.stopTimestamp = d.getTime() / 1000L;
                            }
                            if (p.stopTimestamp > p.startTimestamp) {
                                p.durationMinutes = (int) ((p.stopTimestamp - p.startTimestamp) / 60);
                            }
                        } catch (Exception ignored) {}

                        list.add(p);
                    }
                }

                // If get_simple_data_table returned no archives, try short EPG
                if (list.isEmpty()) {
                    String shortUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_short_epg&stream_id=" + streamId + "&limit=20";
                    String shortJson = fetchUrl(shortUrl);
                    JsonObject shortRoot = JsonParser.parseString(shortJson).getAsJsonObject();
                    if (shortRoot.has("epg_listings") && shortRoot.get("epg_listings").isJsonArray()) {
                        long nowSec = System.currentTimeMillis() / 1000L;
                        for (JsonElement el : shortRoot.getAsJsonArray("epg_listings")) {
                            if (!el.isJsonObject()) continue;
                            JsonObject obj = el.getAsJsonObject();
                            EpgProgram p = new EpgProgram();
                            p.id = getOptString(obj, "id", "");
                            p.title = decodeBase64IfEncoded(getOptString(obj, "title", "Programme TV"));
                            p.desc = decodeBase64IfEncoded(getOptString(obj, "description", ""));
                            p.start = getOptString(obj, "start", "");
                            p.stop = getOptString(obj, "end", "");
                            try {
                                if (obj.has("start_timestamp")) {
                                    p.startTimestamp = obj.get("start_timestamp").getAsLong();
                                }
                                if (obj.has("stop_timestamp")) {
                                    p.stopTimestamp = obj.get("stop_timestamp").getAsLong();
                                }
                                if (p.stopTimestamp > p.startTimestamp) {
                                    p.durationMinutes = (int) ((p.stopTimestamp - p.startTimestamp) / 60);
                                }
                            } catch (Exception ignored) {}

                            if (p.stopTimestamp > 0 && p.stopTimestamp <= nowSec) {
                                list.add(p);
                            }
                        }
                    }
                }

                final List<EpgProgram> finalList = list;
                new Handler(Looper.getMainLooper()).post(() -> {
                    if (callback != null) callback.onSuccess(finalList);
                });
            } catch (Exception e) {
                new Handler(Looper.getMainLooper()).post(() -> {
                    if (callback != null) callback.onError(e.getMessage());
                });
            }
        });
    }
}
