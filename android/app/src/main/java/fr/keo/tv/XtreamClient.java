package fr.keo.tv;

import android.os.Handler;
import android.os.Looper;

import com.google.gson.JsonArray;
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
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.GZIPInputStream;

public class XtreamClient {

    private static final String USER_AGENT = "IPTVSmartersPro/3.1.5 (Linux; Android 12)";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

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

                    String server = serverUrl.trim().replaceAll("/+$", "");
                    if (!server.startsWith("http://") && !server.startsWith("https://")) {
                        server = "http://" + server;
                    }

                    String encUser = URLEncoder.encode(username.trim(), "UTF-8");
                    String encPass = URLEncoder.encode(password.trim(), "UTF-8");

                    // 1. Authenticate & fetch user info
                    String authUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass;
                    String authJson = fetchUrl(authUrl);

                    JsonObject authObj = JsonParser.parseString(authJson).getAsJsonObject();
                    JsonObject userInfo = authObj.has("user_info") && authObj.get("user_info").isJsonObject()
                            ? authObj.getAsJsonObject("user_info") : null;

                    String expDate = "N/A";
                    if (userInfo != null && userInfo.has("exp_date")) {
                        String exp = userInfo.get("exp_date").getAsString();
                        if (!"null".equals(exp) && !"0".equals(exp)) {
                            try {
                                long sec = Long.parseLong(exp);
                                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.FRANCE);
                                expDate = sdf.format(new java.util.Date(sec * 1000));
                            } catch (Exception ignored) {}
                        }
                    }

                    // Save playlist
                    KeoDatabase.PlaylistItem pl = new KeoDatabase.PlaylistItem();
                    pl.id = "active_xtream";
                    pl.name = "Abonnement Xtream";
                    pl.type = "xtream";
                    pl.serverUrl = server;
                    pl.username = username.trim();
                    pl.password = password.trim();
                    pl.expDate = expDate;
                    pl.lastSyncAt = new java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.FRANCE).format(new java.util.Date());
                    db.savePlaylist(pl);

                    // 2. Fetch Live Categories
                    postProgress(callback, "Téléchargement des bouquets TV...");
                    String catUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_live_categories";
                    String catJson = fetchUrl(catUrl);

                    JsonArray catArray = JsonParser.parseString(catJson).getAsJsonArray();
                    List<KeoDatabase.CategoryItem> categories = new ArrayList<>();
                    int order = 1;

                    for (JsonElement el : catArray) {
                        if (!el.isJsonObject()) continue;
                        JsonObject obj = el.getAsJsonObject();
                        String catId = obj.has("category_id") ? obj.get("category_id").getAsString() : null;
                        String catName = obj.has("category_name") ? obj.get("category_name").getAsString() : "Bouquet";
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

                    // 3. Fetch Live Streams
                    postProgress(callback, "Téléchargement des chaînes TV en direct...");
                    String streamsUrl = server + "/player_api.php?username=" + encUser + "&password=" + encPass + "&action=get_live_streams";
                    String streamsJson = fetchUrl(streamsUrl);

                    JsonArray streamsArray = JsonParser.parseString(streamsJson).getAsJsonArray();
                    List<KeoDatabase.ChannelItem> channels = new ArrayList<>();

                    for (JsonElement el : streamsArray) {
                        if (!el.isJsonObject()) continue;
                        JsonObject obj = el.getAsJsonObject();

                        String name = obj.has("name") ? obj.get("name").getAsString().trim() : "";
                        String streamId = obj.has("stream_id") ? obj.get("stream_id").getAsString() : "";
                        String catId = obj.has("category_id") ? obj.get("category_id").getAsString() : "";
                        int num = obj.has("num") && !obj.get("num").isJsonNull() ? obj.get("num").getAsInt() : channels.size() + 1;
                        String logo = obj.has("stream_icon") && !obj.get("stream_icon").isJsonNull() ? obj.get("stream_icon").getAsString() : "";

                        if (streamId.isEmpty() || isSeparatorChannel(name)) {
                            continue; // Eradicate separator items immediately at ingestion
                        }

                        String streamUrl = server + "/live/" + encUser + "/" + encPass + "/" + streamId + ".m3u8";

                        KeoDatabase.ChannelItem ch = new KeoDatabase.ChannelItem();
                        ch.id = "xtream_live_" + streamId;
                        ch.name = name;
                        ch.num = num;
                        ch.groupId = "grp_live_" + catId;
                        ch.groupName = "Bouquet " + catId;
                        ch.streamUrl = streamUrl;
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

    private String fetchUrl(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", USER_AGENT);
        conn.setRequestProperty("Accept-Encoding", "gzip");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(25000);

        int code = conn.getResponseCode();
        if (code != 200) {
            throw new Exception("Erreur serveur HTTP " + code);
        }

        InputStream in = conn.getInputStream();
        if ("gzip".equalsIgnoreCase(conn.getContentEncoding())) {
            in = new GZIPInputStream(in);
        }

        BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line);
        }
        reader.close();
        conn.disconnect();
        return sb.toString();
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
