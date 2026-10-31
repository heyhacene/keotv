package fr.keo.tv;

import android.os.Handler;
import android.os.Looper;

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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

public class XtreamClient {

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
        void onSuccess(int bouquetCount, int channelCount);
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

                    // 2. Fetch Live Categories (Handles both JSON Array and PHP Associative Object)
                    postProgress(callback, "Téléchargement des bouquets TV...");
                    String catUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_live_categories";
                    String catJson = fetchUrl(catUrl);

                    List<JsonObject> catObjects = parseJsonList(catJson);
                    List<KeoDatabase.CategoryItem> categories = new ArrayList<>();
                    int order = 1;

                    for (JsonObject obj : catObjects) {
                        String catId = getOptString(obj, "category_id", null);
                        String catName = getOptString(obj, "category_name", "Bouquet");
                        if (catId == null || catId.isEmpty()) continue;

                        KeoDatabase.CategoryItem c = new KeoDatabase.CategoryItem(
                                "grp_live_" + catId,
                                catName,
                                "live",
                                0,
                                order++
                        );
                        categories.add(c);
                    }

                    // Insert Categories
                    db.bulkInsertCategories(categories, true);

                    // 3. Fetch Live Streams (Handles both JSON Array and PHP Associative Object)
                    postProgress(callback, "Téléchargement des chaînes TV en direct...");
                    String streamsUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_live_streams";
                    String streamsJson = fetchUrl(streamsUrl);

                    List<JsonObject> streamObjects = parseJsonList(streamsJson);
                    List<KeoDatabase.ChannelItem> channels = new ArrayList<>();

                    for (JsonObject obj : streamObjects) {
                        String name = getOptString(obj, "name", "").trim();
                        String streamId = getOptString(obj, "stream_id", "");
                        String catId = getOptString(obj, "category_id", "");
                        int num = getOptInt(obj, "num", channels.size() + 1);
                        String logo = getOptString(obj, "stream_icon", "");

                        if (streamId.isEmpty() || isSeparatorChannel(name)) {
                            continue; // Eradicate separator items immediately at ingestion
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

                        channels.add(ch);
                    }

                    // Save Channels in batch
                    db.bulkInsertChannels(channels, true);
                    db.updateCategoryCounts();

                    final int finalBouquets = categories.size();
                    final int finalChannels = channels.size();

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            callback.onSuccess(finalBouquets, finalChannels);
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

    private void postProgress(final SyncCallback callback, final String message) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                callback.onProgress(message);
            }
        });
    }

    /**
     * Safely parse JSON that could be either a standard JSON Array or a PHP associative object {"0": {...}, "1": {...}}
     */
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
        } catch (Exception ignored) {}

        return list;
    }

    /**
     * Robust HTTP fetcher that handles cross-protocol redirects, GZIP compression, and 60s timeout
     */
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
        // Common IPTV separator patterns
        if (trimmed.startsWith("---") || trimmed.startsWith("===") || trimmed.startsWith("***")) return true;
        if (trimmed.startsWith("▼") || trimmed.startsWith("▲") || trimmed.startsWith("▶") || trimmed.startsWith("◀")) return true;
        if (trimmed.endsWith("---") || trimmed.endsWith("===") || trimmed.endsWith("***")) return true;
        if (trimmed.endsWith("▼") || trimmed.endsWith("▲")) return true;
        return false;
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
}
