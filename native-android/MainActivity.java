package fr.keo.tv;

import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.Log;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileWriter;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "KeoTV";
    private KeoDatabase db;
    private final XtreamClient xtreamClient = new XtreamClient();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // UI elements
    private TextView tvStatusBadge;
    private TextView tvHeaderSyncInfo;
    private TextView tvBouquetsHeader;
    private TextView tvChannelsHeader;
    private EditText etSearch;

    private Button tabLive;
    private Button tabVod;
    private Button tabSeries;

    private RecyclerView recyclerCategories;
    private RecyclerView recyclerChannels;

    private TextView tvDetailName;
    private TextView tvDetailGroup;
    private TextView tvDetailResolution;
    private TextView tvDetailEpg;
    private Button btnWatchFullscreen;
    private Button btnToggleFav;

    private CategoriesAdapter categoriesAdapter;
    private ChannelsAdapter channelsAdapter;

    private String currentType = "live"; // "live", "vod", "series"
    private KeoDatabase.CategoryItem selectedCategory = null;
    private KeoDatabase.ChannelItem activeChannel = null;
    private boolean isSearching = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Global crash protector to avoid silent exits on Android TV & phone
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            Log.e(TAG, "FATAL CRASH on thread " + thread.getName(), throwable);
            try {
                File crashLog = new File(getFilesDir(), "crash.log");
                FileWriter fw = new FileWriter(crashLog, false);
                PrintWriter pw = new PrintWriter(fw);
                throwable.printStackTrace(pw);
                pw.flush();
                pw.close();
            } catch (Exception ignored) {}
        });

        try {
            setContentView(R.layout.activity_main);
            db = KeoDatabase.getInstance(this);

            initViews();
            setupAdapters();
            loadLocalData();

            // Post-launch: check playlist only after window is attached to avoid BadTokenException
            getWindow().getDecorView().post(() -> {
                if (isFinishing() || isDestroyed()) return;
                try {
                    KeoDatabase.PlaylistItem pl = (db != null) ? db.getActivePlaylist() : null;
                    if (pl != null && pl.serverUrl != null && !pl.serverUrl.isEmpty()) {
                        updateHeaderPlaylistInfo(pl);
                    } else {
                        showCloudSyncDialog();
                    }
                } catch (Throwable t) {
                    Log.e(TAG, "Error in post-launch playlist check", t);
                }
            });

            // Delayed silent OTA update check (after 3.5s)
            mainHandler.postDelayed(() -> {
                if (isFinishing() || isDestroyed()) return;
                try {
                    UpdateManager.checkForUpdates(MainActivity.this, false);
                } catch (Throwable t) {
                    Log.e(TAG, "Error in background update check", t);
                }
            }, 3500);

        } catch (Throwable t) {
            Log.e(TAG, "Fatal error during MainActivity onCreate", t);
            Toast.makeText(this, "Démarrage KeoTV : " + t.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void initViews() {
        tvStatusBadge = findViewById(R.id.tv_status_badge);
        tvHeaderSyncInfo = findViewById(R.id.tv_header_sync_info);
        tvBouquetsHeader = findViewById(R.id.tv_bouquets_header);
        tvChannelsHeader = findViewById(R.id.tv_channels_header);
        etSearch = findViewById(R.id.et_search);

        tabLive = findViewById(R.id.tab_live);
        tabVod = findViewById(R.id.tab_vod);
        tabSeries = findViewById(R.id.tab_series);

        recyclerCategories = findViewById(R.id.recycler_categories);
        recyclerChannels = findViewById(R.id.recycler_channels);

        tvDetailName = findViewById(R.id.tv_detail_name);
        tvDetailGroup = findViewById(R.id.tv_detail_group);
        tvDetailResolution = findViewById(R.id.tv_detail_resolution);
        tvDetailEpg = findViewById(R.id.tv_detail_epg);
        btnWatchFullscreen = findViewById(R.id.btn_watch_fullscreen);
        btnToggleFav = findViewById(R.id.btn_toggle_fav);

        // Top bar buttons click listeners
        View btnCloud = findViewById(R.id.btn_header_cloud);
        if (btnCloud != null) btnCloud.setOnClickListener(v -> showCloudSyncDialog());

        View btnUpdate = findViewById(R.id.btn_header_update);
        if (btnUpdate != null) btnUpdate.setOnClickListener(v -> UpdateManager.checkForUpdates(this, true));

        View btnSync = findViewById(R.id.btn_header_sync);
        if (btnSync != null) btnSync.setOnClickListener(v -> triggerSync());

        View btnDiagnostic = findViewById(R.id.btn_header_diagnostic);
        if (btnDiagnostic != null) btnDiagnostic.setOnClickListener(v -> showDiagnosticDialog());

        View btnLogin = findViewById(R.id.btn_header_login);
        if (btnLogin != null) btnLogin.setOnClickListener(v -> showLoginDialog());

        // Header DPAD-Down navigation override: forces focus out of the top bar down to tabs/categories
        View.OnKeyListener headerDownListener = (v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                int id = v.getId();
                if (id == R.id.btn_header_diagnostic && tabVod != null && tabVod.isShown()) {
                    tabVod.requestFocus();
                    return true;
                } else if (id == R.id.btn_header_update && tabSeries != null && tabSeries.isShown()) {
                    tabSeries.requestFocus();
                    return true;
                } else if (id == R.id.btn_header_login) {
                    if (recyclerChannels != null && channelsAdapter.getItemCount() > 0) {
                        focusRecyclerViewPosition(recyclerChannels, channelsAdapter.getSelectedPos());
                    } else if (tabSeries != null) {
                        tabSeries.requestFocus();
                    }
                    return true;
                } else {
                    if (tabLive != null && tabLive.isShown()) {
                        tabLive.requestFocus();
                        return true;
                    } else if (recyclerCategories != null) {
                        focusRecyclerViewFirstItem(recyclerCategories);
                        return true;
                    }
                }
            }
            return false;
        };

        if (btnCloud != null) btnCloud.setOnKeyListener(headerDownListener);
        if (btnSync != null) btnSync.setOnKeyListener(headerDownListener);
        if (btnDiagnostic != null) btnDiagnostic.setOnKeyListener(headerDownListener);
        if (btnUpdate != null) btnUpdate.setOnKeyListener(headerDownListener);
        if (btnLogin != null) btnLogin.setOnKeyListener(headerDownListener);

        // Mode tabs (TV / Films / Séries) click & DPAD navigation
        if (tabLive != null) tabLive.setOnClickListener(v -> switchContentType("live"));
        if (tabVod != null) tabVod.setOnClickListener(v -> switchContentType("vod"));
        if (tabSeries != null) tabSeries.setOnClickListener(v -> switchContentType("series"));

        View.OnKeyListener tabKeyListener = (v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    focusRecyclerViewFirstItem(recyclerCategories);
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    int id = v.getId();
                    if (id == R.id.tab_vod && btnSync != null) {
                        btnSync.requestFocus();
                    } else if (id == R.id.tab_series && btnDiagnostic != null) {
                        btnDiagnostic.requestFocus();
                    } else if (btnCloud != null) {
                        btnCloud.requestFocus();
                    }
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT && v.getId() == R.id.tab_series) {
                    if (recyclerChannels != null && channelsAdapter.getItemCount() > 0) {
                        focusRecyclerViewPosition(recyclerChannels, channelsAdapter.getSelectedPos());
                        return true;
                    }
                }
            }
            return false;
        };

        if (tabLive != null) tabLive.setOnKeyListener(tabKeyListener);
        if (tabVod != null) tabVod.setOnKeyListener(tabKeyListener);
        if (tabSeries != null) tabSeries.setOnKeyListener(tabKeyListener);

        btnWatchFullscreen.setOnClickListener(v -> launchPlayerFullscreen());
        btnToggleFav.setOnClickListener(v -> {
            if (activeChannel != null) {
                db.toggleFavorite(activeChannel.id);
                activeChannel.isFav = !activeChannel.isFav;
                updateFavButtonLabel(activeChannel.isFav);
                channelsAdapter.notifyDataSetChanged();

                // Refresh categories to update the ⭐ Favoris count
                List<KeoDatabase.CategoryItem> cats = db.getCategories(currentType);
                categoriesAdapter.setItems(cats);

                if (selectedCategory != null && "grp_favs".equals(selectedCategory.id)) {
                    List<KeoDatabase.ChannelItem> favChannels = db.getFavoriteChannels();
                    channelsAdapter.setItems(favChannels);
                }
            }
        });

        View.OnKeyListener detailKeyListener = (v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                    if (recyclerChannels != null && channelsAdapter.getItemCount() > 0) {
                        focusRecyclerViewPosition(recyclerChannels, channelsAdapter.getSelectedPos());
                        return true;
                    }
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP && v.getId() == R.id.btn_watch_fullscreen) {
                    if (btnLogin != null) {
                        btnLogin.requestFocus();
                        return true;
                    }
                }
            }
            return false;
        };
        btnWatchFullscreen.setOnKeyListener(detailKeyListener);
        btnToggleFav.setOnKeyListener(detailKeyListener);

        // Instant search / filtering with DPAD key listener to prevent trapping focus
        if (etSearch != null) {
            etSearch.addTextChangedListener(new TextWatcher() {
                @Override
                public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

                @Override
                public void onTextChanged(CharSequence s, int start, int before, int count) {
                    performSearch(s != null ? s.toString() : "");
                }

                @Override
                public void afterTextChanged(Editable s) {}
            });

            etSearch.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                        if (recyclerChannels != null && channelsAdapter.getItemCount() > 0) {
                            recyclerChannels.requestFocus();
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        if (recyclerCategories != null) {
                            recyclerCategories.requestFocus();
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                        if (tabSeries != null) {
                            tabSeries.requestFocus();
                            return true;
                        }
                    }
                }
                return false;
            });
        }
    }

    private void switchContentType(String type) {
        currentType = type;
        updateTabStyles();

        if (etSearch != null) {
            etSearch.setText("");
        }
        isSearching = false;

        if (tvBouquetsHeader != null) {
            if ("vod".equals(type)) {
                tvBouquetsHeader.setText("CATÉGORIES FILMS (VOD)");
            } else if ("series".equals(type)) {
                tvBouquetsHeader.setText("CATÉGORIES SÉRIES");
            } else {
                tvBouquetsHeader.setText("BOUQUETS TV EN DIRECT");
            }
        }

        loadLocalData();
    }

    private void updateTabStyles() {
        if (tabLive != null) {
            tabLive.setSelected("live".equals(currentType));
        }
        if (tabVod != null) {
            tabVod.setSelected("vod".equals(currentType));
        }
        if (tabSeries != null) {
            tabSeries.setSelected("series".equals(currentType));
        }
    }

    private void updateFavButtonLabel(boolean isFav) {
        if (btnToggleFav == null) return;
        boolean isLandscape = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        if (isLandscape) {
            btnToggleFav.setText(isFav ? "★ Retirer des favoris" : "⭐ Ajouter aux favoris");
        } else {
            btnToggleFav.setText(isFav ? "★" : "⭐");
        }
    }

    private void performSearch(String query) {
        String q = query.trim();
        if (q.isEmpty()) {
            isSearching = false;
            if (tvChannelsHeader != null) {
                tvChannelsHeader.setText(selectedCategory != null ? selectedCategory.name.toUpperCase() : "CHAÎNES DU BOUQUET");
            }
            if (selectedCategory != null) {
                selectCategory(selectedCategory);
            }
        } else {
            isSearching = true;
            List<KeoDatabase.ChannelItem> results = db.searchChannels(q, currentType);
            if (tvChannelsHeader != null) {
                tvChannelsHeader.setText("RÉSULTATS (" + results.size() + ")");
            }
            channelsAdapter.setItems(results);
            if (!results.isEmpty()) {
                selectChannel(results.get(0));
            }
        }
    }

    private void setupAdapters() {
        int orientation = getResources().getConfiguration().orientation;
        if (orientation == Configuration.ORIENTATION_PORTRAIT) {
            // Horizontal bouquet chips on mobile phones
            recyclerCategories.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        } else {
            // Vertical bouquet list on Android TV and landscape
            recyclerCategories.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.VERTICAL, false));
        }

        categoriesAdapter = new CategoriesAdapter();
        recyclerCategories.setAdapter(categoriesAdapter);

        recyclerChannels.setLayoutManager(new LinearLayoutManager(this));
        channelsAdapter = new ChannelsAdapter();
        recyclerChannels.setAdapter(channelsAdapter);
    }

    private void focusRecyclerViewFirstItem(RecyclerView rv) {
        if (rv == null) return;
        rv.post(() -> {
            RecyclerView.ViewHolder vh = rv.findViewHolderForAdapterPosition(0);
            if (vh != null && vh.itemView != null) {
                vh.itemView.requestFocus();
            } else {
                View child = rv.getChildAt(0);
                if (child != null) {
                    child.requestFocus();
                } else {
                    rv.requestFocus();
                }
            }
        });
    }

    private void focusRecyclerViewPosition(RecyclerView rv, int position) {
        if (rv == null) return;
        rv.post(() -> {
            int targetPos = Math.max(0, position);
            RecyclerView.ViewHolder vh = rv.findViewHolderForAdapterPosition(targetPos);
            if (vh != null && vh.itemView != null) {
                vh.itemView.requestFocus();
            } else {
                View child = rv.getChildAt(targetPos);
                if (child != null) {
                    child.requestFocus();
                } else {
                    rv.requestFocus();
                }
            }
        });
    }

    private void loadLocalData() {
        try {
            updateTabStyles();
            List<KeoDatabase.CategoryItem> cats = db.getCategories(currentType);
            categoriesAdapter.setItems(cats);

            if (!cats.isEmpty()) {
                selectCategory(cats.get(0));
                // Set default focus on categories list, never on top bar!
                recyclerCategories.postDelayed(() -> {
                    focusRecyclerViewFirstItem(recyclerCategories);
                }, 200);
            } else {
                tvDetailName.setText("Aucun contenu dans cette section. Lancez une synchronisation.");
                if (tvDetailGroup != null) tvDetailGroup.setText("-");
                if (tvDetailResolution != null) tvDetailResolution.setText("-");
                if (tvDetailEpg != null) tvDetailEpg.setText("-");
                if (tabLive != null) tabLive.requestFocus();
            }
        } catch (Throwable t) {
            Log.e(TAG, "Error loading local data", t);
        }
    }

    private void selectCategory(KeoDatabase.CategoryItem cat) {
        if (cat == null) return;
        selectedCategory = cat;
        if (tvChannelsHeader != null && !isSearching) {
            tvChannelsHeader.setText(cat.name.toUpperCase());
        }

        List<KeoDatabase.ChannelItem> channels = db.getChannelsByGroup(cat.id);
        channelsAdapter.setItems(channels);

        if (!channels.isEmpty()) {
            selectChannel(channels.get(0));
        } else {
            activeChannel = null;
            tvDetailName.setText("Aucun élément dans cette catégorie");
            if (tvDetailGroup != null) tvDetailGroup.setText(cat.name);
            if (tvDetailResolution != null) tvDetailResolution.setText("-");
            if (tvDetailEpg != null) tvDetailEpg.setText("-");
        }
    }

    private void selectChannel(KeoDatabase.ChannelItem ch) {
        if (ch == null) return;
        activeChannel = ch;
        tvDetailName.setText(ch.name);
        if (tvDetailGroup != null) {
            tvDetailGroup.setText(selectedCategory != null ? selectedCategory.name : "Direct TV");
        }
        if (tvDetailResolution != null) {
            tvDetailResolution.setText(ch.resolution != null ? ch.resolution : "HD");
        }
        if (tvDetailEpg != null) {
            if ("vod".equals(ch.streamType)) {
                tvDetailEpg.setText("Film VOD - Lecture à la demande");
            } else if ("series".equals(ch.streamType)) {
                tvDetailEpg.setText("Série TV - Appuyez sur OK pour voir les épisodes");
            } else {
                tvDetailEpg.setText("Direct TV (" + ch.resolution + ")");
            }
        }
        updateFavButtonLabel(ch.isFav);
    }

    private void launchPlayerFullscreen() {
        if (activeChannel == null) {
            Toast.makeText(this, "Sélectionnez d'abord un programme", Toast.LENGTH_SHORT).show();
            return;
        }

        if ("series".equals(activeChannel.streamType)) {
            openSeriesEpisodes(activeChannel);
            return;
        }

        if (activeChannel.streamUrl == null || activeChannel.streamUrl.isEmpty()) {
            Toast.makeText(this, "Flux vidéo non disponible pour ce programme", Toast.LENGTH_SHORT).show();
            return;
        }

        List<KeoDatabase.ChannelItem> currentList = channelsAdapter.getItems();
        List<String> urls = new ArrayList<>();
        List<String> titles = new ArrayList<>();
        int startIndex = 0;

        for (int i = 0; i < currentList.size(); i++) {
            KeoDatabase.ChannelItem c = currentList.get(i);
            urls.add(c.streamUrl);
            titles.add(c.name);
            if (c.id.equals(activeChannel.id)) {
                startIndex = i;
            }
        }

        PlayerActivity.pendingUrls = urls;
        PlayerActivity.pendingTitles = titles;
        PlayerActivity.pendingIndex = startIndex;
        PlayerActivity.pendingIsLive = !"vod".equals(activeChannel.streamType);
        PlayerActivity.pendingSeriesId = null;

        Intent intent = new Intent(this, PlayerActivity.class);
        startActivity(intent);
    }

    private void openSeriesEpisodes(final KeoDatabase.ChannelItem seriesItem) {
        if (seriesItem == null) return;
        final KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl == null || pl.serverUrl == null || pl.serverUrl.isEmpty()) {
            Toast.makeText(this, "Veuillez d'abord configurer votre compte IPTV", Toast.LENGTH_LONG).show();
            return;
        }

        final String rawId = seriesItem.id.replace("xtream_series_", "");
        Toast.makeText(this, "Chargement des épisodes de " + seriesItem.name + "...", Toast.LENGTH_SHORT).show();

        xtreamClient.fetchSeriesInfo(pl.serverUrl, pl.username, pl.password, rawId, new XtreamClient.SeriesInfoCallback() {
            @Override
            public void onSuccess(JsonObject seriesDetails) {
                if (isFinishing() || isDestroyed()) return;

                if (!seriesDetails.has("episodes") || !seriesDetails.get("episodes").isJsonObject()) {
                    Toast.makeText(MainActivity.this, "Aucun épisode trouvé pour cette série.", Toast.LENGTH_LONG).show();
                    return;
                }

                JsonObject epObj = seriesDetails.getAsJsonObject("episodes");
                final List<String> displayTitles = new ArrayList<>();
                final List<String> streamUrls = new ArrayList<>();

                String server = pl.serverUrl.trim().replaceAll("/+$", "");
                if (!server.startsWith("http://") && !server.startsWith("https://")) server = "http://" + server;
                String user = pl.username.trim();
                String pass = pl.password.trim();

                for (java.util.Map.Entry<String, JsonElement> seasonEntry : epObj.entrySet()) {
                    String seasonKey = seasonEntry.getKey();
                    if (!seasonEntry.getValue().isJsonArray()) continue;

                    JsonArray eps = seasonEntry.getValue().getAsJsonArray();
                    for (int i = 0; i < eps.size(); i++) {
                        if (!eps.get(i).isJsonObject()) continue;
                        JsonObject ep = eps.get(i).getAsJsonObject();
                        String epId = XtreamClient.getOptString(ep, "id", "");
                        int epNum = XtreamClient.getOptInt(ep, "episode_num", i + 1);
                        String epTitle = XtreamClient.getOptString(ep, "title", "Épisode " + epNum);
                        String ext = XtreamClient.getOptString(ep, "container_extension", "mkv");
                        if (ext.isEmpty()) ext = "mkv";

                        String url = server + "/series/" + user + "/" + pass + "/" + epId + "." + ext;
                        String label = "S" + seasonKey + " E" + epNum + " - " + epTitle;

                        displayTitles.add(label);
                        streamUrls.add(url);
                    }
                }

                if (displayTitles.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Aucun épisode disponible pour cette série.", Toast.LENGTH_LONG).show();
                    return;
                }

                CharSequence[] items = displayTitles.toArray(new CharSequence[0]);
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("🍿 " + seriesItem.name + " (" + displayTitles.size() + " épisodes)")
                        .setItems(items, (dialog, which) -> {
                            PlayerActivity.pendingUrls = streamUrls;
                            PlayerActivity.pendingTitles = displayTitles;
                            PlayerActivity.pendingIndex = which;
                            PlayerActivity.pendingIsLive = false;
                            PlayerActivity.pendingSeriesId = rawId;

                            Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                            startActivity(intent);
                        })
                        .setNegativeButton("Fermer", null)
                        .show();
            }

            @Override
            public void onError(String error) {
                if (isFinishing() || isDestroyed()) return;
                Toast.makeText(MainActivity.this, "Erreur chargement série : " + error, Toast.LENGTH_LONG).show();
            }
        });
    }

    private void triggerSync() {
        KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl == null || pl.serverUrl == null || pl.serverUrl.isEmpty()) {
            showLoginDialog();
            return;
        }

        tvStatusBadge.setText("⏳ Synchro...");
        tvStatusBadge.setBackgroundColor(0xFF854D0E); // amber

        xtreamClient.syncPlaylist(pl.serverUrl, pl.username, pl.password, db, new XtreamClient.SyncCallback() {
            @Override
            public void onProgress(String message) {
                tvStatusBadge.setText("⏳ " + message);
            }

            @Override
            public void onSuccess(int liveCount, int vodCount, int seriesCount) {
                tvStatusBadge.setText("✅ Prêt");
                tvStatusBadge.setBackgroundColor(0xFF132E27); // green
                String msg = "Synchronisation réussie !\n"
                        + "• Direct TV : " + liveCount + " chaînes\n"
                        + "• Films (VOD) : " + vodCount + " films\n"
                        + "• Séries : " + seriesCount + " séries";
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
                updateHeaderPlaylistInfo(db.getActivePlaylist());
                loadLocalData();
            }

            @Override
            public void onError(String error) {
                tvStatusBadge.setText("⚠️ Erreur");
                tvStatusBadge.setBackgroundColor(0xFF7F1D1D); // red
                if (isFinishing() || isDestroyed()) return;

                try {
                    AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this)
                            .setTitle("⚠️ Erreur de synchronisation IPTV")
                            .setMessage("Impossible de synchroniser avec le serveur IPTV :\n\n" + error + "\n\n💡 Vérifiez l'adresse de votre serveur (ex: http://domaine:port), votre identifiant et mot de passe.")
                            .setPositiveButton("Vérifier le compte", (dialog, which) -> showLoginDialog())
                            .setNegativeButton("Fermer", null);

                    if (error.contains("no column") || error.contains("SQLITE_ERROR")) {
                        builder.setNeutralButton("Réparer la Base", (dialog, which) -> {
                            db.purgeCache(true);
                            triggerSync();
                        });
                    }

                    builder.show();
                } catch (Throwable t) {
                    Log.e(TAG, "Failed to show sync error dialog", t);
                }
            }
        });
    }

    private void updateHeaderPlaylistInfo(KeoDatabase.PlaylistItem pl) {
        if (pl == null) return;
        tvHeaderSyncInfo.setText(pl.name + " (" + pl.serverUrl + ") | Exp: " + pl.expDate + " | Synchro: " + pl.lastSyncAt);
    }

    private void showDiagnosticDialog() {
        if (isFinishing() || isDestroyed()) return;

        try {
            int liveCount = db.getChannelCount("live");
            int vodCount = db.getChannelCount("vod");
            int seriesCount = db.getChannelCount("series");
            int favCount = db.getFavoriteCount();
            KeoDatabase.PlaylistItem pl = db.getActivePlaylist();

            Runtime rt = Runtime.getRuntime();
            long usedMb = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
            long maxMb = rt.maxMemory() / (1024 * 1024);

            StringBuilder msg = new StringBuilder();
            msg.append("📊 DIAGNOSTIC & SANTÉ DU SYSTÈME KEOTV\n\n");
            msg.append("• Version : Build ").append(UpdateManager.getAppVersionCode(this)).append(" (100% Natif Android)\n");
            msg.append("• Chaînes TV en direct : ").append(liveCount).append("\n");
            msg.append("• Films (VOD) : ").append(vodCount).append("\n");
            msg.append("• Séries : ").append(seriesCount).append("\n");
            msg.append("• Favoris enregistrés : ").append(favCount).append("\n");
            msg.append("• Playlist active : ").append(pl != null ? pl.name : "Aucune").append("\n");
            msg.append("• Serveur : ").append(pl != null ? pl.serverUrl : "Non configuré").append("\n");
            msg.append("• Fin d'abonnement : ").append(pl != null ? pl.expDate : "N/A").append("\n");
            msg.append("• Dernière synchronisation : ").append(pl != null ? pl.lastSyncAt : "Jamais").append("\n");
            msg.append("• Mémoire RAM : ").append(usedMb).append(" Mo / ").append(maxMb).append(" Mo\n");

            File crashLog = new File(getFilesDir(), "crash.log");
            if (crashLog.exists() && crashLog.length() > 0) {
                msg.append("\n⚠️ Rapport d'anomalie détecté dans crash.log");
            }

            new AlertDialog.Builder(this)
                    .setTitle("Diagnostic KeoTV")
                    .setMessage(msg.toString())
                    .setPositiveButton("Fermer", null)
                    .setNeutralButton("Purger Cache TV", (dialog, which) -> {
                        db.purgeCache(true);
                        loadLocalData();
                        triggerSync();
                    })
                    .setNegativeButton("Réinitialisation Usine", (dialog, which) -> performFactoryReset())
                    .show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to show diagnostic dialog", t);
        }
    }

    private void performFactoryReset() {
        if (isFinishing() || isDestroyed()) return;

        try {
            new AlertDialog.Builder(this)
                    .setTitle("⚠️ Nettoyage et Réinitialisation Complète")
                    .setMessage("Voulez-vous réinitialiser complètement KeoTV à zéro ?\n\nToutes les chaînes, films, séries, comptes et paramètres en mémoire seront entièrement effacés.")
                    .setPositiveButton("Oui, tout effacer", (dialog, which) -> {
                        try {
                            db.purgeCache(false);
                            getSharedPreferences("keotv_prefs", MODE_PRIVATE).edit().clear().apply();
                            activeChannel = null;
                            selectedCategory = null;
                            loadLocalData();
                            tvHeaderSyncInfo.setText("Aucun compte configuré");
                            tvStatusBadge.setText("⚪ Réinitialisé");
                            tvStatusBadge.setBackgroundColor(0xFF1E293B);
                            Toast.makeText(MainActivity.this, "KeoTV a été remis à zéro avec succès.", Toast.LENGTH_LONG).show();
                            mainHandler.postDelayed(this::showCloudSyncDialog, 400);
                        } catch (Exception e) {
                            Toast.makeText(MainActivity.this, "Erreur réinitialisation : " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    })
                    .setNegativeButton("Annuler", null)
                    .show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to show reset dialog", t);
        }
    }

    private void showCloudSyncDialog() {
        if (isFinishing() || isDestroyed()) return;

        try {
            final SharedPreferences prefs = getSharedPreferences("keotv_prefs", MODE_PRIVATE);
            String lastUser = prefs.getString("cloud_username", "hacene");

            android.widget.LinearLayout layout = new android.widget.LinearLayout(this);
            layout.setOrientation(android.widget.LinearLayout.VERTICAL);
            layout.setPadding(32, 24, 32, 24);

            TextView tvInfo = new TextView(this);
            tvInfo.setText("Récupérez instantanément vos abonnements IPTV enregistrés sur le portail Web (https://keotv.vercel.app/sync).\n\nSaisissez votre identifiant ou adresse email :");
            tvInfo.setTextColor(0xFFCBD5E1);
            tvInfo.setTextSize(12);
            tvInfo.setPadding(0, 0, 0, 16);
            layout.addView(tvInfo);

            final EditText etUser = new EditText(this);
            etUser.setHint("Identifiant ou email (ex: hacene)");
            etUser.setText(lastUser);
            layout.addView(etUser);

            new AlertDialog.Builder(this)
                    .setTitle("☁️ Rapatriement depuis le portail Web")
                    .setView(layout)
                    .setPositiveButton("Rapatrier", (dialog, which) -> {
                        String ident = etUser.getText().toString().trim();
                        if (ident.isEmpty()) {
                            Toast.makeText(MainActivity.this, "Veuillez entrer votre identifiant", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        prefs.edit().putString("cloud_username", ident).apply();
                        pullAccountsFromCloud(ident);
                    })
                    .setNeutralButton("Saisie Manuelle", (dialog, which) -> showLoginDialog())
                    .setNegativeButton("Annuler", null)
                    .show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to show cloud sync dialog", t);
        }
    }

    private void pullAccountsFromCloud(final String ident) {
        tvStatusBadge.setText("⏳ Rapatriement...");
        Toast.makeText(this, "Connexion au portail Web pour '" + ident + "'...", Toast.LENGTH_SHORT).show();

        new Thread(() -> {
            try {
                String cleanIdent = ident.trim().toLowerCase();
                String enc = URLEncoder.encode(cleanIdent, "UTF-8");
                String urlStr = "https://qvfmfstwrkcerzlbemzb.supabase.co/rest/v1/keotv_users?or=(username.eq."
                        + enc + ",id.eq.usr_" + enc + ",id.eq." + enc + ")&select=*";

                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(15000);
                conn.setRequestProperty("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2Zm1mc3R3cmtjZXJ6bGJlbXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjE1NDksImV4cCI6MjEwNzYzNzU0OX0.-VCES2YX_FDjWct12sTgTaDtfqnqUfXfPcMS39UmRBs");
                conn.setRequestProperty("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2Zm1mc3R3cmtjZXJ6bGJlbXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjE1NDksImV4cCI6MjEwNzYzNzU0OX0.-VCES2YX_FDjWct12sTgTaDtfqnqUfXfPcMS39UmRBs");
                conn.setRequestProperty("Accept", "application/json");

                int code = conn.getResponseCode();
                if (code != 200) {
                    runOnUiThread(() -> {
                        tvStatusBadge.setText("❌ Erreur");
                        Toast.makeText(MainActivity.this, "Erreur serveur HTTP " + code, Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();

                JsonArray arr = JsonParser.parseString(sb.toString()).getAsJsonArray();
                if (arr.size() == 0) {
                    runOnUiThread(() -> {
                        tvStatusBadge.setText("❌ Non trouvé");
                        Toast.makeText(MainActivity.this, "Aucun compte trouvé pour '" + ident + "'. Vérifiez sur https://keotv.vercel.app/sync", Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                JsonObject userObj = arr.get(0).getAsJsonObject();
                JsonArray playlists = userObj.has("playlists") && userObj.get("playlists").isJsonArray()
                        ? userObj.getAsJsonArray("playlists") : null;

                if (playlists == null || playlists.size() == 0) {
                    runOnUiThread(() -> {
                        tvStatusBadge.setText("⚠️ Vide");
                        Toast.makeText(MainActivity.this, "Ce compte ne contient aucune playlist enregistrée sur le site.", Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                JsonObject targetPl = null;
                for (int i = 0; i < playlists.size(); i++) {
                    JsonObject p = playlists.get(i).getAsJsonObject();
                    if (p.has("server_url") && !p.get("server_url").getAsString().isEmpty()) {
                        targetPl = p;
                        break;
                    }
                }

                if (targetPl == null) targetPl = playlists.get(0).getAsJsonObject();

                final KeoDatabase.PlaylistItem pl = new KeoDatabase.PlaylistItem();
                pl.id = targetPl.has("id") ? targetPl.get("id").getAsString() : "active_xtream";
                pl.name = targetPl.has("name") ? targetPl.get("name").getAsString() : "Abonnement Xtream";
                pl.type = targetPl.has("type") ? targetPl.get("type").getAsString() : "xtream";
                pl.serverUrl = targetPl.has("server_url") ? targetPl.get("server_url").getAsString() : "";
                pl.username = targetPl.has("username") ? targetPl.get("username").getAsString() : "";
                pl.password = targetPl.has("password") ? targetPl.get("password").getAsString() : "";

                db.savePlaylist(pl);

                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "Compte '" + pl.name + "' rapatrié avec succès ! Synchronisation en cours...", Toast.LENGTH_LONG).show();
                    triggerSync();
                });

            } catch (Exception e) {
                final String err = e.getMessage();
                runOnUiThread(() -> {
                    tvStatusBadge.setText("❌ Erreur");
                    Toast.makeText(MainActivity.this, "Erreur de rapatriement : " + err, Toast.LENGTH_LONG).show();
                });
            }
        }).start();
    }

    private void showLoginDialog() {
        if (isFinishing() || isDestroyed()) return;

        try {
            KeoDatabase.PlaylistItem existing = db.getActivePlaylist();

            android.widget.LinearLayout layout = new android.widget.LinearLayout(this);
            layout.setOrientation(android.widget.LinearLayout.VERTICAL);
            layout.setPadding(32, 24, 32, 24);

            final EditText etServer = new EditText(this);
            etServer.setHint("Serveur (ex: http://mon-serveur.com:8080)");
            if (existing != null && existing.serverUrl != null) etServer.setText(existing.serverUrl);
            layout.addView(etServer);

            final EditText etUser = new EditText(this);
            etUser.setHint("Nom d'utilisateur");
            if (existing != null && existing.username != null) etUser.setText(existing.username);
            layout.addView(etUser);

            final EditText etPass = new EditText(this);
            etPass.setHint("Mot de passe");
            if (existing != null && existing.password != null) etPass.setText(existing.password);
            layout.addView(etPass);

            new AlertDialog.Builder(this)
                    .setTitle("Configuration Manuelle du Compte Xtream")
                    .setView(layout)
                    .setPositiveButton("Enregistrer & Synchroniser", (dialog, which) -> {
                        String server = etServer.getText().toString().trim();
                        String user = etUser.getText().toString().trim();
                        String pass = etPass.getText().toString().trim();

                        if (server.isEmpty() || user.isEmpty() || pass.isEmpty()) {
                            Toast.makeText(MainActivity.this, "Tous les champs sont requis", Toast.LENGTH_SHORT).show();
                            return;
                        }

                        KeoDatabase.PlaylistItem pl = new KeoDatabase.PlaylistItem();
                        pl.id = "active_xtream";
                        pl.name = "Abonnement Xtream";
                        pl.type = "xtream";
                        pl.serverUrl = server;
                        pl.username = user;
                        pl.password = pass;
                        db.savePlaylist(pl);

                        triggerSync();
                    })
                    .setNeutralButton("☁️ Rapatrier du site", (dialog, which) -> showCloudSyncDialog())
                    .setNegativeButton("Annuler", null)
                    .show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to show login dialog", t);
        }
    }

    // --- RECYCLER VIEW ADAPTERS WITH CLEAN TOUCH & D-PAD FOCUS ---

    private class CategoriesAdapter extends RecyclerView.Adapter<CategoriesAdapter.ViewHolder> {
        private final List<KeoDatabase.CategoryItem> items = new ArrayList<>();
        private int selectedPos = 0;

        public void setItems(List<KeoDatabase.CategoryItem> newItems) {
            items.clear();
            items.addAll(newItems);
            selectedPos = 0;
            notifyDataSetChanged();
        }

        public int getSelectedPos() {
            return selectedPos;
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_category, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            KeoDatabase.CategoryItem item = items.get(position);
            holder.tvName.setText(item.name);
            holder.tvCount.setText(String.valueOf(item.count));
            holder.itemView.setSelected(selectedPos == position);

            holder.itemView.setOnClickListener(v -> {
                selectedPos = holder.getBindingAdapterPosition();
                notifyDataSetChanged();
                selectCategory(item);
            });

            holder.itemView.setOnFocusChangeListener((v, hasFocus) -> {
                if (hasFocus) {
                    selectedPos = holder.getBindingAdapterPosition();
                    notifyDataSetChanged();
                    selectCategory(item);
                }
            });

            holder.itemView.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_UP && holder.getBindingAdapterPosition() == 0) {
                        if ("vod".equals(currentType) && tabVod != null) {
                            tabVod.requestFocus();
                            return true;
                        } else if ("series".equals(currentType) && tabSeries != null) {
                            tabSeries.requestFocus();
                            return true;
                        } else if (tabLive != null) {
                            tabLive.requestFocus();
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        if (recyclerChannels != null && channelsAdapter.getItemCount() > 0) {
                            focusRecyclerViewPosition(recyclerChannels, channelsAdapter.getSelectedPos());
                            return true;
                        }
                    }
                }
                return false;
            });
        }

        @Override
        public int getItemCount() {
            return items.size();
        }

        class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvName, tvCount;
            ViewHolder(View v) {
                super(v);
                tvName = v.findViewById(R.id.tv_category_name);
                tvCount = v.findViewById(R.id.tv_category_count);
            }
        }
    }

    private class ChannelsAdapter extends RecyclerView.Adapter<ChannelsAdapter.ViewHolder> {
        private final List<KeoDatabase.ChannelItem> items = new ArrayList<>();
        private int selectedPos = 0;

        public void setItems(List<KeoDatabase.ChannelItem> newItems) {
            items.clear();
            items.addAll(newItems);
            selectedPos = 0;
            notifyDataSetChanged();
        }

        public int getSelectedPos() {
            return selectedPos;
        }

        public List<KeoDatabase.ChannelItem> getItems() {
            return items;
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_channel, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            KeoDatabase.ChannelItem item = items.get(position);
            holder.tvNum.setText(String.valueOf(position + 1));
            holder.tvName.setText(item.name);
            holder.tvRes.setText(item.resolution != null ? item.resolution : "HD");

            // Favorite star badge
            if (holder.tvFavStar != null) {
                holder.tvFavStar.setVisibility(item.isFav ? View.VISIBLE : View.GONE);
            }

            // Resolution color styling
            if ("4K".equalsIgnoreCase(item.resolution) || "UHD".equalsIgnoreCase(item.resolution)) {
                holder.tvRes.setTextColor(0xFFF59E0B); // Amber / Gold
            } else if ("FHD".equalsIgnoreCase(item.resolution)) {
                holder.tvRes.setTextColor(0xFF38BDF8); // Cyan
            } else {
                holder.tvRes.setTextColor(0xFF94A3B8); // Slate
            }

            holder.itemView.setSelected(selectedPos == position);

            holder.itemView.setOnClickListener(v -> {
                selectedPos = holder.getBindingAdapterPosition();
                notifyDataSetChanged();
                selectChannel(item);

                // Clicking directly launches playback or opens series episodes
                if ("series".equals(item.streamType)) {
                    openSeriesEpisodes(item);
                } else {
                    launchPlayerFullscreen();
                }
            });

            holder.itemView.setOnFocusChangeListener((v, hasFocus) -> {
                if (hasFocus) {
                    selectedPos = holder.getBindingAdapterPosition();
                    notifyDataSetChanged();
                    selectChannel(item);
                }
            });

            holder.itemView.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        if (recyclerCategories != null && categoriesAdapter.getItemCount() > 0) {
                            focusRecyclerViewPosition(recyclerCategories, categoriesAdapter.getSelectedPos());
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        if (btnWatchFullscreen != null) {
                            btnWatchFullscreen.requestFocus();
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP && holder.getBindingAdapterPosition() == 0) {
                        if (etSearch != null && etSearch.isShown()) {
                            etSearch.requestFocus();
                            return true;
                        } else if (tabSeries != null) {
                            tabSeries.requestFocus();
                            return true;
                        }
                    }
                }
                return false;
            });
        }

        @Override
        public int getItemCount() {
            return items.size();
        }

        class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvNum, tvName, tvEpg, tvRes, tvFavStar;
            ViewHolder(View v) {
                super(v);
                tvNum = v.findViewById(R.id.tv_channel_num);
                tvName = v.findViewById(R.id.tv_channel_name);
                tvEpg = v.findViewById(R.id.tv_channel_epg);
                tvRes = v.findViewById(R.id.tv_channel_res);
                tvFavStar = v.findViewById(R.id.tv_channel_fav_star);
            }
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (etSearch != null && etSearch.hasFocus()) {
                etSearch.setText("");
                etSearch.clearFocus();
                if (recyclerChannels != null) recyclerChannels.requestFocus();
                return true;
            }
            if (btnWatchFullscreen != null && (btnWatchFullscreen.hasFocus() || btnToggleFav.hasFocus())) {
                if (recyclerChannels != null) {
                    focusRecyclerViewPosition(recyclerChannels, channelsAdapter.getSelectedPos());
                    return true;
                }
            }
            if (recyclerChannels != null && recyclerChannels.hasFocus()) {
                if (recyclerCategories != null) {
                    focusRecyclerViewPosition(recyclerCategories, categoriesAdapter.getSelectedPos());
                    return true;
                }
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
