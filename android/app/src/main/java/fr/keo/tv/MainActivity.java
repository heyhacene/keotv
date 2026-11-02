package fr.keo.tv;

import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
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
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;

public class MainActivity extends AppCompatActivity {

    private static final String TAG = "KeoTV";
    private KeoDatabase db;
    private final XtreamClient xtreamClient = new XtreamClient();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // UI elements - Header & Sidebar
    private TextView tvSectionTitle;
    private TextView tvStatusBadge;
    private TextView tvHeaderSyncInfo;
    private TextView tvBouquetsHeader;
    private TextView tvChannelsHeader;
    private EditText etSearch;

    // Sidebar navigation buttons (v1.3 Layout)
    private Button btnNavLive;
    private Button btnNavReplay;
    private Button btnNavVod;
    private Button btnNavSeries;
    private Button btnNavFavs;
    private Button btnNavSearch;
    private Button btnNavSettings;
    private Button btnNavSync;

    // Mobile Portrait tabs compatibility
    private Button tabLive;
    private Button tabReplay;
    private Button tabVod;
    private Button tabSeries;
    private Button tabFavs;

    // Content containers
    private View layoutContentSplit;
    private View panelSearch;

    // Global Search UI
    private EditText etGlobalSearch;
    private Button btnSearchClear;
    private Button btnSearchFilterAll;
    private Button btnSearchFilterLive;
    private Button btnSearchFilterVod;
    private Button btnSearchFilterSeries;
    private TextView tvSearchResultsCount;
    private RecyclerView recyclerSearchResults;
    private ChannelsAdapter searchResultsAdapter;
    private String globalSearchFilter = "all";

    // Recyclers
    private RecyclerView recyclerCategories;
    private RecyclerView recyclerChannels;

    // Detail Panel compatibility (if present)
    private TextView tvDetailName;
    private TextView tvDetailGroup;
    private TextView tvDetailResolution;
    private TextView tvDetailEpg;
    private Button btnWatchFullscreen;
    private Button btnToggleFav;
    private Button btnReplay;

    private final Map<String, String> epgCurrentTitleCache = new ConcurrentHashMap<>();
    private final Map<String, String> epgNextTitleCache = new ConcurrentHashMap<>();
    private final Map<String, String> epgPastTitleCache = new ConcurrentHashMap<>();
    private Runnable epgDebounceRunnable;

    private CategoriesAdapter categoriesAdapter;
    private ChannelsAdapter channelsAdapter;

    private String currentType = "live"; // "live", "replay", "vod", "series", "favs", "search"
    private KeoDatabase.CategoryItem selectedCategory = null;
    private KeoDatabase.ChannelItem activeChannel = null;
    private boolean isSearching = false;
    private String restoredCategoryId = null;
    private String restoredChannelId = null;
    private String restoredSearchQuery = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (savedInstanceState != null) {
            String savedType = savedInstanceState.getString("saved_current_type");
            if (savedType != null && !savedType.isEmpty()) {
                currentType = savedType;
            }
            restoredCategoryId = savedInstanceState.getString("saved_category_id");
            restoredChannelId = savedInstanceState.getString("saved_channel_id");
            restoredSearchQuery = savedInstanceState.getString("saved_search_query");
        }

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
            if (restoredSearchQuery != null && !restoredSearchQuery.isEmpty()) {
                if (etSearch != null) etSearch.setText(restoredSearchQuery);
                if (etGlobalSearch != null) etGlobalSearch.setText(restoredSearchQuery);
            }
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
        tvSectionTitle = findViewById(R.id.tv_section_title);
        tvStatusBadge = findViewById(R.id.tv_status_badge);
        tvHeaderSyncInfo = findViewById(R.id.tv_header_sync_info);
        tvBouquetsHeader = findViewById(R.id.tv_bouquets_header);
        tvChannelsHeader = findViewById(R.id.tv_channels_header);
        etSearch = findViewById(R.id.et_search);

        layoutContentSplit = findViewById(R.id.layout_content_split);
        panelSearch = findViewById(R.id.panel_search);

        // Sidebar buttons
        btnNavLive = findViewById(R.id.btn_nav_live);
        btnNavReplay = findViewById(R.id.btn_nav_replay);
        btnNavVod = findViewById(R.id.btn_nav_vod);
        btnNavSeries = findViewById(R.id.btn_nav_series);
        btnNavFavs = findViewById(R.id.btn_nav_favs);
        btnNavSearch = findViewById(R.id.btn_nav_search);
        btnNavSettings = findViewById(R.id.btn_nav_settings);
        btnNavSync = findViewById(R.id.btn_nav_sync);

        // Mobile portrait tabs
        tabLive = findViewById(R.id.tab_live);
        tabReplay = findViewById(R.id.tab_replay);
        tabVod = findViewById(R.id.tab_vod);
        tabSeries = findViewById(R.id.tab_series);
        tabFavs = findViewById(R.id.tab_favs);

        // Recyclers
        recyclerCategories = findViewById(R.id.recycler_categories);
        recyclerChannels = findViewById(R.id.recycler_channels);

        // Detail panel (if present in layout)
        tvDetailName = findViewById(R.id.tv_detail_name);
        tvDetailGroup = findViewById(R.id.tv_detail_group);
        tvDetailResolution = findViewById(R.id.tv_detail_resolution);
        tvDetailEpg = findViewById(R.id.tv_detail_epg);
        btnWatchFullscreen = findViewById(R.id.btn_watch_fullscreen);
        btnToggleFav = findViewById(R.id.btn_toggle_fav);
        btnReplay = findViewById(R.id.btn_replay);
        if (btnReplay != null) {
            btnReplay.setOnClickListener(v -> showCatchupDialog(activeChannel));
        }

        // Global search panel views
        etGlobalSearch = findViewById(R.id.et_global_search);
        btnSearchClear = findViewById(R.id.btn_search_clear);
        btnSearchFilterAll = findViewById(R.id.btn_search_filter_all);
        btnSearchFilterLive = findViewById(R.id.btn_search_filter_live);
        btnSearchFilterVod = findViewById(R.id.btn_search_filter_vod);
        btnSearchFilterSeries = findViewById(R.id.btn_search_filter_series);
        tvSearchResultsCount = findViewById(R.id.tv_search_results_count);
        recyclerSearchResults = findViewById(R.id.recycler_search_results);

        // Top bar buttons click listeners
        View btnCloud = findViewById(R.id.btn_header_cloud);
        if (btnCloud != null) btnCloud.setOnClickListener(v -> showCloudSyncDialog());

        View btnUpdate = findViewById(R.id.btn_header_update);
        if (btnUpdate != null) btnUpdate.setOnClickListener(v -> UpdateManager.checkForUpdates(this, true));

        View btnSync = findViewById(R.id.btn_header_sync);
        if (btnSync != null) btnSync.setOnClickListener(v -> triggerSync());

        View btnDiagnostic = findViewById(R.id.btn_header_diagnostic);
        if (btnDiagnostic != null) btnDiagnostic.setOnClickListener(v -> showSettingsDialog());

        View btnLogin = findViewById(R.id.btn_header_login);
        if (btnLogin != null) btnLogin.setOnClickListener(v -> showLoginDialog());

        // Sidebar Navigation click listeners
        if (btnNavLive != null) btnNavLive.setOnClickListener(v -> switchSection("live"));
        if (btnNavReplay != null) btnNavReplay.setOnClickListener(v -> switchSection("replay"));
        if (btnNavVod != null) btnNavVod.setOnClickListener(v -> switchSection("vod"));
        if (btnNavSeries != null) btnNavSeries.setOnClickListener(v -> switchSection("series"));
        if (btnNavFavs != null) btnNavFavs.setOnClickListener(v -> switchSection("favs"));
        if (btnNavSearch != null) btnNavSearch.setOnClickListener(v -> switchSection("search"));
        if (btnNavSettings != null) btnNavSettings.setOnClickListener(v -> showSettingsDialog());
        if (btnNavSync != null) btnNavSync.setOnClickListener(v -> showCloudSyncDialog());

        // Sidebar D-Pad right handler: navigates from sidebar into categories or search
        View.OnKeyListener navRightListener = (v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                if ("search".equals(currentType) && etGlobalSearch != null) {
                    etGlobalSearch.requestFocus();
                } else {
                    focusCategoriesList();
                }
                return true;
            }
            return false;
        };

        if (btnNavLive != null) btnNavLive.setOnKeyListener(navRightListener);
        if (btnNavReplay != null) btnNavReplay.setOnKeyListener(navRightListener);
        if (btnNavVod != null) btnNavVod.setOnKeyListener(navRightListener);
        if (btnNavSeries != null) btnNavSeries.setOnKeyListener(navRightListener);
        if (btnNavFavs != null) btnNavFavs.setOnKeyListener(navRightListener);
        if (btnNavSearch != null) btnNavSearch.setOnKeyListener(navRightListener);
        if (btnNavSettings != null) btnNavSettings.setOnKeyListener(navRightListener);
        if (btnNavSync != null) btnNavSync.setOnKeyListener(navRightListener);

        // Mobile portrait tabs click listeners
        if (tabLive != null) tabLive.setOnClickListener(v -> switchSection("live"));
        if (tabReplay != null) tabReplay.setOnClickListener(v -> switchSection("replay"));
        if (tabVod != null) tabVod.setOnClickListener(v -> switchSection("vod"));
        if (tabSeries != null) tabSeries.setOnClickListener(v -> switchSection("series"));
        if (tabFavs != null) tabFavs.setOnClickListener(v -> switchSection("favs"));

        // Global Search setup
        if (etGlobalSearch != null) {
            etGlobalSearch.addTextChangedListener(new TextWatcher() {
                @Override
                public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

                @Override
                public void onTextChanged(CharSequence s, int start, int before, int count) {
                    performGlobalSearch(s != null ? s.toString() : "", globalSearchFilter);
                }

                @Override
                public void afterTextChanged(Editable s) {}
            });
        }

        if (btnSearchClear != null) {
            btnSearchClear.setOnClickListener(v -> {
                if (etGlobalSearch != null) etGlobalSearch.setText("");
                performGlobalSearch("", globalSearchFilter);
            });
        }

        View.OnClickListener filterListener = v -> {
            int id = v.getId();
            if (id == R.id.btn_search_filter_all) globalSearchFilter = "all";
            else if (id == R.id.btn_search_filter_live) globalSearchFilter = "live";
            else if (id == R.id.btn_search_filter_vod) globalSearchFilter = "vod";
            else if (id == R.id.btn_search_filter_series) globalSearchFilter = "series";

            updateSearchFilterTabs();
            String q = (etGlobalSearch != null) ? etGlobalSearch.getText().toString() : "";
            performGlobalSearch(q, globalSearchFilter);
        };

        if (btnSearchFilterAll != null) btnSearchFilterAll.setOnClickListener(filterListener);
        if (btnSearchFilterLive != null) btnSearchFilterLive.setOnClickListener(filterListener);
        if (btnSearchFilterVod != null) btnSearchFilterVod.setOnClickListener(filterListener);
        if (btnSearchFilterSeries != null) btnSearchFilterSeries.setOnClickListener(filterListener);

        // Quick in-bouquet search
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
                        focusChannelsList();
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        focusCategoriesList();
                        return true;
                    }
                }
                return false;
            });
        }

        // Compatibility buttons
        if (btnWatchFullscreen != null) {
            btnWatchFullscreen.setOnClickListener(v -> launchPlayerFullscreen());
        }
        if (btnToggleFav != null) {
            btnToggleFav.setOnClickListener(v -> {
                if (activeChannel != null) {
                    db.toggleFavorite(activeChannel.id);
                    activeChannel.isFav = !activeChannel.isFav;
                    updateFavButtonLabel(activeChannel.isFav);
                    channelsAdapter.notifyDataSetChanged();
                }
            });
        }

        updateSidebarHighlights();
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density + 0.5f);
    }

    public void switchSection(String section) {
        currentType = section;
        updateSidebarHighlights();

        if ("search".equals(section)) {
            if (panelSearch != null) panelSearch.setVisibility(View.VISIBLE);
            if (layoutContentSplit != null) layoutContentSplit.setVisibility(View.GONE);
            if (tvSectionTitle != null) tvSectionTitle.setText("🔍 RECHERCHE GLOBALE");
            if (etGlobalSearch != null) {
                etGlobalSearch.requestFocus();
            }
            return;
        }

        if (panelSearch != null) panelSearch.setVisibility(View.GONE);
        if (layoutContentSplit != null) layoutContentSplit.setVisibility(View.VISIBLE);

        if ("replay".equals(section)) {
            if (tvSectionTitle != null) tvSectionTitle.setText("🔄 REPLAY / RATTRAPAGE");
            if (tvBouquetsHeader != null) tvBouquetsHeader.setText("BOUQUETS REPLAY");
            if (tvChannelsHeader != null) tvChannelsHeader.setText("CHAÎNES AVEC REPLAY");
        } else if ("vod".equals(section)) {
            if (tvSectionTitle != null) tvSectionTitle.setText("🎬 FILMS VOD");
            if (tvBouquetsHeader != null) tvBouquetsHeader.setText("CATÉGORIES FILMS");
            if (tvChannelsHeader != null) tvChannelsHeader.setText("CATALOGUE FILMS");
        } else if ("series".equals(section)) {
            if (tvSectionTitle != null) tvSectionTitle.setText("🍿 SÉRIES TV");
            if (tvBouquetsHeader != null) tvBouquetsHeader.setText("CATÉGORIES SÉRIES");
            if (tvChannelsHeader != null) tvChannelsHeader.setText("CATALOGUE SÉRIES");
        } else if ("favs".equals(section)) {
            if (tvSectionTitle != null) tvSectionTitle.setText("⭐ FAVORIS");
            if (tvBouquetsHeader != null) tvBouquetsHeader.setText("SECTIONS FAVORIS");
            if (tvChannelsHeader != null) tvChannelsHeader.setText("VOS FAVORIS");
        } else {
            if (tvSectionTitle != null) tvSectionTitle.setText("📺 DIRECT TV");
            if (tvBouquetsHeader != null) tvBouquetsHeader.setText("BOUQUETS TV");
            if (tvChannelsHeader != null) tvChannelsHeader.setText("CHAÎNES & PROGRAMMES");
        }

        loadLocalData();
    }

    private void switchToSearch(String query) {
        switchSection("search");
        globalSearchFilter = "all";
        updateSearchFilterTabs();
        if (etGlobalSearch != null) {
            etGlobalSearch.setText(query != null ? query : "");
            if (query != null && !query.isEmpty()) {
                etGlobalSearch.setSelection(query.length());
            }
        }
        performGlobalSearch(query != null ? query : "", "all");
    }

    private void updateSidebarHighlights() {
        if (btnNavLive != null) btnNavLive.setSelected("live".equals(currentType));
        if (btnNavReplay != null) btnNavReplay.setSelected("replay".equals(currentType));
        if (btnNavVod != null) btnNavVod.setSelected("vod".equals(currentType));
        if (btnNavSeries != null) btnNavSeries.setSelected("series".equals(currentType));
        if (btnNavFavs != null) btnNavFavs.setSelected("favs".equals(currentType));
        if (btnNavSearch != null) btnNavSearch.setSelected("search".equals(currentType));

        // Mobile tabs highlight
        if (tabLive != null) tabLive.setSelected("live".equals(currentType));
        if (tabReplay != null) tabReplay.setSelected("replay".equals(currentType));
        if (tabVod != null) tabVod.setSelected("vod".equals(currentType));
        if (tabSeries != null) tabSeries.setSelected("series".equals(currentType));
        if (tabFavs != null) tabFavs.setSelected("favs".equals(currentType));
    }

    private void updateSearchFilterTabs() {
        if (btnSearchFilterAll != null) btnSearchFilterAll.setSelected("all".equals(globalSearchFilter));
        if (btnSearchFilterLive != null) btnSearchFilterLive.setSelected("live".equals(globalSearchFilter));
        if (btnSearchFilterVod != null) btnSearchFilterVod.setSelected("vod".equals(globalSearchFilter));
        if (btnSearchFilterSeries != null) btnSearchFilterSeries.setSelected("series".equals(globalSearchFilter));
    }

    private void performGlobalSearch(String query, String filter) {
        String q = query.trim();
        if (q.isEmpty()) {
            if (tvSearchResultsCount != null) {
                tvSearchResultsCount.setText("Saisissez un texte pour rechercher dans tous les catalogues.");
            }
            if (searchResultsAdapter != null) {
                searchResultsAdapter.setItems(new ArrayList<>());
            }
            return;
        }

        new Thread(() -> {
            String streamTypeFilter = "all".equals(filter) ? null : filter;
            final List<KeoDatabase.ChannelItem> results = db.searchChannels(q, streamTypeFilter);
            runOnUiThread(() -> {
                if (tvSearchResultsCount != null) {
                    tvSearchResultsCount.setText(results.size() + " résultat(s) trouvé(s) pour '" + q + "'");
                }
                if (searchResultsAdapter != null) {
                    searchResultsAdapter.setItems(results);
                }
            });
        }).start();
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
            new Thread(() -> {
                final List<KeoDatabase.ChannelItem> results = db.searchChannels(q, "replay".equals(currentType) ? "live" : currentType);
                runOnUiThread(() -> {
                    if (tvChannelsHeader != null) {
                        tvChannelsHeader.setText("RÉSULTATS (" + results.size() + ")");
                    }
                    channelsAdapter.setItems(results);
                    if (!results.isEmpty()) {
                        activeChannel = results.get(0);
                    }
                });
            }).start();
        }
    }

    private void setupAdapters() {
        boolean isLandscapeSplit = findViewById(R.id.sidebar) != null;
        if (isLandscapeSplit) {
            // Vertical bouquet list on Android TV and mobile landscape split view
            recyclerCategories.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.VERTICAL, false));
        } else {
            // Horizontal bouquet chips on mobile phones in portrait
            recyclerCategories.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        }
        recyclerCategories.setNestedScrollingEnabled(true);
        recyclerCategories.setOverScrollMode(View.OVER_SCROLL_ALWAYS);

        categoriesAdapter = new CategoriesAdapter();
        recyclerCategories.setAdapter(categoriesAdapter);

        recyclerChannels.setLayoutManager(new LinearLayoutManager(this));
        recyclerChannels.setNestedScrollingEnabled(true);
        recyclerChannels.setOverScrollMode(View.OVER_SCROLL_ALWAYS);
        channelsAdapter = new ChannelsAdapter();
        recyclerChannels.setAdapter(channelsAdapter);

        if (recyclerSearchResults != null) {
            recyclerSearchResults.setLayoutManager(new LinearLayoutManager(this));
            recyclerSearchResults.setNestedScrollingEnabled(true);
            recyclerSearchResults.setOverScrollMode(View.OVER_SCROLL_ALWAYS);
            searchResultsAdapter = new ChannelsAdapter();
            recyclerSearchResults.setAdapter(searchResultsAdapter);
        }
    }

    private void focusRecyclerViewItem(RecyclerView rv, int position) {
        if (rv == null) return;
        RecyclerView.LayoutManager lm = rv.getLayoutManager();
        if (lm == null) return;
        int count = (rv.getAdapter() != null) ? rv.getAdapter().getItemCount() : 0;
        if (count == 0) return;

        final int targetPos = Math.max(0, Math.min(position, count - 1));
        rv.scrollToPosition(targetPos);

        rv.post(() -> {
            RecyclerView.ViewHolder vh = rv.findViewHolderForAdapterPosition(targetPos);
            if (vh != null && vh.itemView != null) {
                vh.itemView.requestFocus();
            } else {
                View view = lm.findViewByPosition(targetPos);
                if (view != null) {
                    view.requestFocus();
                } else if (rv.getChildCount() > 0) {
                    View child = rv.getChildAt(0);
                    if (child != null) child.requestFocus();
                }
            }
        });
    }

    private void focusActiveSidebarButton() {
        if ("replay".equals(currentType) && btnNavReplay != null) btnNavReplay.requestFocus();
        else if ("vod".equals(currentType) && btnNavVod != null) btnNavVod.requestFocus();
        else if ("series".equals(currentType) && btnNavSeries != null) btnNavSeries.requestFocus();
        else if ("favs".equals(currentType) && btnNavFavs != null) btnNavFavs.requestFocus();
        else if ("search".equals(currentType) && btnNavSearch != null) btnNavSearch.requestFocus();
        else if (btnNavLive != null) btnNavLive.requestFocus();
    }

    private void focusCategoriesList() {
        if (recyclerCategories == null || categoriesAdapter == null || categoriesAdapter.getItemCount() == 0) return;
        int target = Math.max(0, Math.min(categoriesAdapter.getSelectedPos(), categoriesAdapter.getItemCount() - 1));
        focusRecyclerViewItem(recyclerCategories, target);
    }

    private void focusChannelsList() {
        if (recyclerChannels == null || channelsAdapter == null || channelsAdapter.getItemCount() == 0) return;
        int target = Math.max(0, Math.min(channelsAdapter.getSelectedPos(), channelsAdapter.getItemCount() - 1));
        focusRecyclerViewItem(recyclerChannels, target);
    }

    private KeoDatabase.CategoryItem pendingCategoryToLoad = null;
    private final Runnable categoryDebounceRunnable = new Runnable() {
        @Override
        public void run() {
            if (pendingCategoryToLoad != null) {
                selectCategory(pendingCategoryToLoad);
            }
        }
    };

    private void selectCategoryDebounced(KeoDatabase.CategoryItem cat) {
        pendingCategoryToLoad = cat;
        mainHandler.removeCallbacks(categoryDebounceRunnable);
        mainHandler.postDelayed(categoryDebounceRunnable, 140);
    }

    private void loadLocalData() {
        new Thread(() -> {
            final List<KeoDatabase.CategoryItem> cats;
            if ("replay".equals(currentType)) {
                cats = db.getReplayCategories();
            } else if ("favs".equals(currentType)) {
                cats = new ArrayList<>();
                int favAll = db.getFavoriteCount();
                cats.add(new KeoDatabase.CategoryItem("grp_favs", "⭐ Tous les favoris", "favs", favAll, 0));
                int favLive = db.getFavoriteCount("live");
                if (favLive > 0) cats.add(new KeoDatabase.CategoryItem("grp_favs_live", "📺 Chaînes TV", "favs", favLive, 1));
                int favVod = db.getFavoriteCount("vod");
                if (favVod > 0) cats.add(new KeoDatabase.CategoryItem("grp_favs_vod", "🎬 Films", "favs", favVod, 2));
                int favSeries = db.getFavoriteCount("series");
                if (favSeries > 0) cats.add(new KeoDatabase.CategoryItem("grp_favs_series", "🍿 Séries", "favs", favSeries, 3));
            } else {
                cats = db.getCategories(currentType);
            }

            runOnUiThread(() -> {
                categoriesAdapter.setItems(cats);
                if (!cats.isEmpty()) {
                    KeoDatabase.CategoryItem targetCat = cats.get(0);
                    if (restoredCategoryId != null) {
                        for (int i = 0; i < cats.size(); i++) {
                            KeoDatabase.CategoryItem c = cats.get(i);
                            if (c.id != null && c.id.equals(restoredCategoryId)) {
                                targetCat = c;
                                categoriesAdapter.setSelectedPos(i);
                                break;
                            }
                        }
                        restoredCategoryId = null;
                    }
                    selectCategory(targetCat);
                } else {
                    channelsAdapter.setItems(new ArrayList<>());
                    if (tvChannelsHeader != null) {
                        tvChannelsHeader.setText("Aucun élément disponible dans cette section.");
                    }
                }
            });
        }).start();
    }

    private void selectCategory(KeoDatabase.CategoryItem cat) {
        if (cat == null) return;
        selectedCategory = cat;
        new Thread(() -> {
            List<KeoDatabase.ChannelItem> channelsList = new ArrayList<>();
            try {
                if ("replay".equals(currentType)) {
                    channelsList = db.getReplayChannelsByGroup(cat.id);
                } else if ("grp_favs".equals(cat.id)) {
                    channelsList = db.getFavoriteChannels();
                } else if ("grp_favs_live".equals(cat.id)) {
                    channelsList = db.getFavoriteChannels("live");
                } else if ("grp_favs_vod".equals(cat.id)) {
                    channelsList = db.getFavoriteChannels("vod");
                } else if ("grp_favs_series".equals(cat.id)) {
                    channelsList = db.getFavoriteChannels("series");
                } else {
                    channelsList = db.getChannelsByGroup(cat.id);
                }
            } catch (Throwable t) {
                Log.e(TAG, "Error querying channels for category: " + cat.id, t);
            }

            final List<KeoDatabase.ChannelItem> channels = (channelsList != null) ? channelsList : new ArrayList<>();
            runOnUiThread(() -> {
                channelsAdapter.setItems(channels);
                if (tvChannelsHeader != null) {
                    tvChannelsHeader.setText(cat.name.toUpperCase() + " (" + channels.size() + ")");
                }
                if (!channels.isEmpty()) {
                    KeoDatabase.ChannelItem targetCh = channels.get(0);
                    if (restoredChannelId != null) {
                        for (int i = 0; i < channels.size(); i++) {
                            KeoDatabase.ChannelItem ch = channels.get(i);
                            if (ch != null && ch.id != null && ch.id.equals(restoredChannelId)) {
                                targetCh = ch;
                                channelsAdapter.setSelectedPos(i);
                                break;
                            }
                        }
                        restoredChannelId = null;
                    }
                    selectChannel(targetCh);
                } else {
                    activeChannel = null;
                }
            });
        }).start();
    }

    private void selectChannel(KeoDatabase.ChannelItem ch) {
        activeChannel = ch;
        if (ch == null) return;

        if (tvDetailName != null) tvDetailName.setText(ch.name);
        if (tvDetailGroup != null) {
            tvDetailGroup.setText(selectedCategory != null ? selectedCategory.name : "Direct TV");
        }
        if (tvDetailResolution != null) {
            tvDetailResolution.setText(ch.resolution != null ? ch.resolution : "HD");
        }
        updateFavButtonLabel(ch.isFav);

        if (btnReplay != null) {
            btnReplay.setVisibility(ch.tvArchive == 1 ? View.VISIBLE : View.GONE);
        }

        // Asynchronously fetch short EPG for live channel with 300ms debounce
        if ("live".equals(ch.streamType) || "replay".equals(ch.streamType)) {
            if (epgDebounceRunnable != null) {
                mainHandler.removeCallbacks(epgDebounceRunnable);
            }
            epgDebounceRunnable = () -> fetchEpgForChannel(ch);
            mainHandler.postDelayed(epgDebounceRunnable, 300);
        }
    }

    private void fetchEpgForChannel(final KeoDatabase.ChannelItem ch) {
        if (ch == null || ch.streamId == null || ch.streamId.isEmpty()) return;
        KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl == null || pl.serverUrl == null || pl.serverUrl.isEmpty()) return;

        xtreamClient.fetchShortEpg(pl.serverUrl, pl.username, pl.password, ch.streamId, 3, new XtreamClient.EpgCallback() {
            @Override
            public void onSuccess(List<XtreamClient.EpgProgram> programs, XtreamClient.EpgProgram current, XtreamClient.EpgProgram next) {
                if (isFinishing() || isDestroyed()) return;
                if (current != null && current.title != null && !current.title.isEmpty()) {
                    epgCurrentTitleCache.put(ch.id, current.title);
                }
                if (next != null && next.title != null && !next.title.isEmpty()) {
                    epgNextTitleCache.put(ch.id, next.title);
                }
                if (programs != null && !programs.isEmpty()) {
                    long now = System.currentTimeMillis();
                    for (XtreamClient.EpgProgram p : programs) {
                        if (p.stopMs <= now && p.title != null && !p.title.isEmpty()) {
                            epgPastTitleCache.put(ch.id, p.title);
                        }
                    }
                }

                // Update UI directly without re-binding or resetting focus (eliminates flickering)
                if (activeChannel != null && ch.id.equals(activeChannel.id)) {
                    if (tvDetailEpg != null && current != null) {
                        tvDetailEpg.setText("🔴 " + current.title + (next != null ? "  |  ⏭️ " + next.title : ""));
                    }
                    if (recyclerChannels != null && channelsAdapter != null) {
                        int pos = channelsAdapter.getPositionForId(ch.id);
                        if (pos != -1) {
                            RecyclerView.ViewHolder vh = recyclerChannels.findViewHolderForAdapterPosition(pos);
                            if (vh instanceof ChannelsAdapter.ViewHolder) {
                                ChannelsAdapter.ViewHolder cvh = (ChannelsAdapter.ViewHolder) vh;
                                if (cvh.tvEpgNow != null && current != null) {
                                    cvh.tvEpgNow.setText("🔴 " + current.title);
                                }
                                if (cvh.tvEpgNext != null && next != null) {
                                    cvh.tvEpgNext.setText("⏭️ " + next.title);
                                }
                                String past = epgPastTitleCache.get(ch.id);
                                if (cvh.tvEpgPast != null && past != null) {
                                    cvh.tvEpgPast.setText("◄ " + past);
                                }
                            }
                        }
                    }
                }
            }

            @Override
            public void onError(String error) {
                // Silently ignore background EPG failures
            }
        });
    }

    private void launchPlayerFullscreen() {
        if (activeChannel == null) {
            Toast.makeText(this, "Sélectionnez d'abord un programme", Toast.LENGTH_SHORT).show();
            return;
        }

        if ("vod".equals(activeChannel.streamType)) {
            showMovieDetailDialog(activeChannel);
            return;
        }

        if ("series".equals(activeChannel.streamType)) {
            showSeriesDetailDialog(activeChannel);
            return;
        }

        if (activeChannel.streamUrl == null || activeChannel.streamUrl.isEmpty()) {
            Toast.makeText(this, "Flux vidéo non disponible pour cette chaîne", Toast.LENGTH_SHORT).show();
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

    private long getSavedPositionForUrl(String url) {
        if (url == null || url.isEmpty()) return 0L;
        try {
            SharedPreferences prefs = getSharedPreferences(PlayerActivity.PREFS_POSITIONS, Context.MODE_PRIVATE);
            String jsonStr = prefs.getString(PlayerActivity.KEY_POSITIONS_JSON, "{}");
            org.json.JSONObject root = new org.json.JSONObject(jsonStr);
            org.json.JSONObject item = root.optJSONObject(url);
            if (item != null) {
                return item.optLong("positionMs", 0L);
            }
        } catch (Exception ignored) {}
        return 0L;
    }

    private org.json.JSONObject getSavedSeriesProgress(String seriesId) {
        if (seriesId == null || seriesId.isEmpty()) return null;
        try {
            SharedPreferences prefs = getSharedPreferences(PlayerActivity.PREFS_POSITIONS, Context.MODE_PRIVATE);
            String jsonStr = prefs.getString(PlayerActivity.KEY_POSITIONS_JSON, "{}");
            org.json.JSONObject root = new org.json.JSONObject(jsonStr);
            return root.optJSONObject("series_" + seriesId);
        } catch (Exception ignored) {}
        return null;
    }

    private String formatPlaybackTime(long ms) {
        long totalSec = ms / 1000;
        long h = totalSec / 3600;
        long m = (totalSec % 3600) / 60;
        long s = totalSec % 60;
        if (h > 0) {
            return String.format(Locale.getDefault(), "%d:%02d:%02d", h, m, s);
        } else {
            return String.format(Locale.getDefault(), "%02d:%02d", m, s);
        }
    }

    private void launchMoviePlayer(String url, String title, boolean forceRestart) {
        List<String> urls = new ArrayList<>();
        List<String> titles = new ArrayList<>();
        urls.add(url);
        titles.add(title);
        PlayerActivity.pendingUrls = urls;
        PlayerActivity.pendingTitles = titles;
        PlayerActivity.pendingIndex = 0;
        PlayerActivity.pendingIsLive = false;
        PlayerActivity.pendingSeriesId = null;
        PlayerActivity.pendingForceRestart = forceRestart;
        if (forceRestart) {
            PlayerActivity.pendingStartPositionMs = 0L;
        }
        startActivity(new Intent(this, PlayerActivity.class));
    }

    // --- FICHE FILM (VOD MOVIE DETAIL DIALOG) ---
    private void populateActorChips(LinearLayout layoutActorsContainer, String castStr, AlertDialog dialog, KeoDatabase.ChannelItem movieItem, String[] firstActor) {
        if (layoutActorsContainer == null || castStr == null || castStr.trim().isEmpty()) return;
        layoutActorsContainer.removeAllViews();
        String[] actorList = castStr.split("[,;/]");
        int addedCount = 0;
        for (String rawActor : actorList) {
            final String actorName = rawActor.trim();
            if (actorName.isEmpty()) continue;
            if (addedCount == 0 && firstActor != null && firstActor.length > 0) {
                firstActor[0] = actorName;
            }
            addedCount++;

            Button actorChip = new Button(MainActivity.this);
            actorChip.setText("👤 " + actorName);
            actorChip.setTextColor(0xFFE2E8F0);
            actorChip.setTextSize(11.5f);
            actorChip.setTypeface(Typeface.DEFAULT_BOLD);
            actorChip.setAllCaps(false);
            actorChip.setFocusable(true);
            actorChip.setFocusableInTouchMode(true);
            actorChip.setPadding(dpToPx(12), dpToPx(5), dpToPx(12), dpToPx(5));

            GradientDrawable chipBg = new GradientDrawable();
            chipBg.setColor(0x2B334155);
            chipBg.setCornerRadius(dpToPx(14));
            chipBg.setStroke(dpToPx(1), 0xFF475569);
            actorChip.setBackground(chipBg);

            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, dpToPx(34));
            lp.setMarginEnd(dpToPx(8));
            actorChip.setLayoutParams(lp);

            actorChip.setOnFocusChangeListener((v, hasFocus) -> {
                GradientDrawable bg = (GradientDrawable) actorChip.getBackground();
                if (hasFocus) {
                    bg.setColor(0xFF0284C7);
                    bg.setStroke(dpToPx(2), Color.WHITE);
                    actorChip.setScaleX(1.05f);
                    actorChip.setScaleY(1.05f);
                } else {
                    bg.setColor(0x2B334155);
                    bg.setStroke(dpToPx(1), 0xFF475569);
                    actorChip.setScaleX(1.0f);
                    actorChip.setScaleY(1.0f);
                }
            });

            actorChip.setOnClickListener(v -> {
                dialog.dismiss();
                if (movieItem != null && movieItem.cast != null && !movieItem.cast.isEmpty()) {
                    db.updateChannelMetadata(movieItem.id, movieItem.cast, movieItem.director, movieItem.plot, movieItem.genre, movieItem.releaseDate, movieItem.rating);
                }
                switchToSearch(actorName);
            });

            layoutActorsContainer.addView(actorChip);
            if (addedCount >= 16) break;
        }
    }

    private void showMovieDetailDialog(final KeoDatabase.ChannelItem movieItem) {
        if (isFinishing() || isDestroyed() || movieItem == null) return;

        try {
            final KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
            View view = LayoutInflater.from(this).inflate(R.layout.dialog_movie_detail, null);

            TextView tvTitle = view.findViewById(R.id.tv_movie_title);
            TextView tvRating = view.findViewById(R.id.tv_movie_rating);
            TextView tvYear = view.findViewById(R.id.tv_movie_year);
            TextView tvDuration = view.findViewById(R.id.tv_movie_duration);
            TextView tvGenre = view.findViewById(R.id.tv_movie_genre);
            ImageView ivPoster = view.findViewById(R.id.iv_movie_poster);
            TextView tvPlot = view.findViewById(R.id.tv_movie_plot);
            TextView tvDirector = view.findViewById(R.id.tv_movie_director);
            TextView tvCast = view.findViewById(R.id.tv_movie_cast);
            LinearLayout layoutActorsContainer = view.findViewById(R.id.layout_actors_container);
            Button btnSearchActor = view.findViewById(R.id.btn_search_actor);
            Button btnRestart = view.findViewById(R.id.btn_restart_movie);
            Button btnPlay = view.findViewById(R.id.btn_play_movie);
            Button btnFav = view.findViewById(R.id.btn_fav_movie);
            Button btnClose = view.findViewById(R.id.btn_close_movie);

            tvTitle.setText(movieItem.name);
            if (movieItem.logo != null && !movieItem.logo.isEmpty()) {
                ImageLoader.load(this, movieItem.logo, ivPoster);
            }

            final AlertDialog dialog = new AlertDialog.Builder(this)
                    .setView(view)
                    .create();

            if (dialog.getWindow() != null) {
                dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
            }

            final String[] firstActor = new String[]{""};
            final String[] streamUrlHolder = new String[]{movieItem.streamUrl};
            final long[] savedPosHolder = new long[]{getSavedPositionForUrl(movieItem.streamUrl)};

            // Immediate pre-population from cached database metadata
            if (movieItem.rating != null && !movieItem.rating.isEmpty()) {
                tvRating.setText("⭐ " + movieItem.rating);
            }
            if (movieItem.releaseDate != null && !movieItem.releaseDate.isEmpty()) {
                tvYear.setText(movieItem.releaseDate);
            }
            if (movieItem.genre != null && !movieItem.genre.isEmpty()) {
                tvGenre.setText(" • " + movieItem.genre);
            }
            if (movieItem.plot != null && !movieItem.plot.isEmpty()) {
                tvPlot.setText(movieItem.plot);
            }
            if (movieItem.director != null && !movieItem.director.isEmpty()) {
                tvDirector.setText("Réalisateur : " + movieItem.director);
            }
            if (movieItem.cast != null && !movieItem.cast.isEmpty()) {
                populateActorChips(layoutActorsContainer, movieItem.cast, dialog, movieItem, firstActor);
            }

            Runnable updatePlayButtons = () -> {
                long pos = savedPosHolder[0];
                if (pos > 15000L) {
                    btnPlay.setText("▶ Reprendre (" + formatPlaybackTime(pos) + ")");
                    if (btnRestart != null) {
                        btnRestart.setVisibility(View.VISIBLE);
                        btnRestart.setText("↺ Recommencer du début");
                    }
                } else {
                    btnPlay.setText("▶ Regarder le Film");
                    if (btnRestart != null) {
                        btnRestart.setVisibility(View.GONE);
                    }
                }
            };
            updatePlayButtons.run();

            if (pl != null && pl.serverUrl != null && !pl.serverUrl.isEmpty()) {
                xtreamClient.fetchVodInfo(pl.serverUrl, pl.username, pl.password, movieItem.id, new XtreamClient.VodInfoCallback() {
                    @Override
                    public void onSuccess(JsonObject info, JsonObject movieData) {
                        if (isFinishing() || isDestroyed()) return;

                        if (info.has("name") && !info.get("name").isJsonNull()) {
                            tvTitle.setText(info.get("name").getAsString());
                        }
                        if (info.has("rating") && !info.get("rating").isJsonNull()) {
                            tvRating.setText("⭐ " + info.get("rating").getAsString());
                        }
                        if (info.has("releasedate") && !info.get("releasedate").isJsonNull()) {
                            tvYear.setText(info.get("releasedate").getAsString());
                        } else if (info.has("year") && !info.get("year").isJsonNull()) {
                            tvYear.setText(info.get("year").getAsString());
                        }
                        if (info.has("duration_secs") && !info.get("duration_secs").isJsonNull()) {
                            try {
                                int secs = Integer.parseInt(info.get("duration_secs").getAsString());
                                int hours = secs / 3600;
                                int mins = (secs % 3600) / 60;
                                tvDuration.setText(" • " + (hours > 0 ? hours + "h " : "") + mins + "m");
                            } catch (Exception ignored) {}
                        }
                        if (info.has("genre") && !info.get("genre").isJsonNull()) {
                            tvGenre.setText(" • " + info.get("genre").getAsString());
                        }
                        if (info.has("plot") && !info.get("plot").isJsonNull()) {
                            tvPlot.setText(info.get("plot").getAsString());
                        }
                        if (info.has("director") && !info.get("director").isJsonNull()) {
                            tvDirector.setText("Réalisateur : " + info.get("director").getAsString());
                        }

                        // Extract full metadata
                        String cast = "";
                        if (info.has("cast") && !info.get("cast").isJsonNull()) {
                            cast = info.get("cast").getAsString().trim();
                        } else if (info.has("actors") && !info.get("actors").isJsonNull()) {
                            cast = info.get("actors").getAsString().trim();
                        }
                        String director = info.has("director") && !info.get("director").isJsonNull() ? info.get("director").getAsString().trim() : (movieItem.director != null ? movieItem.director : "");
                        String genre = info.has("genre") && !info.get("genre").isJsonNull() ? info.get("genre").getAsString().trim() : (movieItem.genre != null ? movieItem.genre : "");
                        String plot = info.has("plot") && !info.get("plot").isJsonNull() ? info.get("plot").getAsString().trim() : (movieItem.plot != null ? movieItem.plot : "");
                        String releaseDate = "";
                        if (info.has("releasedate") && !info.get("releasedate").isJsonNull()) {
                            releaseDate = info.get("releasedate").getAsString().trim();
                        } else if (info.has("year") && !info.get("year").isJsonNull()) {
                            releaseDate = info.get("year").getAsString().trim();
                        } else if (movieItem.releaseDate != null) {
                            releaseDate = movieItem.releaseDate;
                        }
                        String rating = info.has("rating") && !info.get("rating").isJsonNull() ? info.get("rating").getAsString().trim() : (movieItem.rating != null ? movieItem.rating : "");

                        if (!cast.isEmpty()) {
                            movieItem.cast = cast;
                            populateActorChips(layoutActorsContainer, cast, dialog, movieItem, firstActor);
                        }
                        movieItem.director = director;
                        movieItem.genre = genre;
                        movieItem.plot = plot;
                        movieItem.releaseDate = releaseDate;
                        movieItem.rating = rating;

                        // Persist metadata asynchronously in database
                        final String fCast = movieItem.cast;
                        final String fDirector = director;
                        final String fGenre = genre;
                        final String fPlot = plot;
                        final String fReleaseDate = releaseDate;
                        final String fRating = rating;
                        new Thread(() -> db.updateChannelMetadata(movieItem.id, fCast, fDirector, fPlot, fGenre, fReleaseDate, fRating)).start();

                        if (info.has("movie_image") && !info.get("movie_image").isJsonNull()) {
                            ImageLoader.load(MainActivity.this, info.get("movie_image").getAsString(), ivPoster);
                        }
                        if (movieData.has("container_extension") && !movieData.get("container_extension").isJsonNull()) {
                            String ext = movieData.get("container_extension").getAsString();
                            String rawId = movieItem.id.replace("xtream_vod_", "");
                            streamUrlHolder[0] = pl.serverUrl.replaceAll("/+$", "") + "/movie/" + pl.username + "/" + pl.password + "/" + rawId + "." + ext;

                            long constructedPos = getSavedPositionForUrl(streamUrlHolder[0]);
                            if (constructedPos > 15000L) {
                                savedPosHolder[0] = constructedPos;
                            }
                            runOnUiThread(updatePlayButtons);
                        }
                    }

                    @Override
                    public void onError(String error) {
                        Log.e(TAG, "Vod info error: " + error);
                    }
                });
            }

            btnPlay.setOnClickListener(v -> {
                dialog.dismiss();
                launchMoviePlayer(streamUrlHolder[0], tvTitle.getText().toString(), false);
            });

            btnPlay.setOnLongClickListener(v -> {
                if (savedPosHolder[0] > 15000L) {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle(tvTitle.getText().toString())
                            .setMessage("Options de lecture du film :")
                            .setPositiveButton("↺ Recommencer du début", (d, which) -> {
                                dialog.dismiss();
                                launchMoviePlayer(streamUrlHolder[0], tvTitle.getText().toString(), true);
                            })
                            .setNegativeButton("▶ Reprendre (" + formatPlaybackTime(savedPosHolder[0]) + ")", (d, which) -> {
                                dialog.dismiss();
                                launchMoviePlayer(streamUrlHolder[0], tvTitle.getText().toString(), false);
                            })
                            .setNeutralButton("Annuler", null)
                            .show();
                    return true;
                }
                return false;
            });

            if (btnRestart != null) {
                btnRestart.setOnClickListener(v -> {
                    dialog.dismiss();
                    launchMoviePlayer(streamUrlHolder[0], tvTitle.getText().toString(), true);
                });
            }

            btnFav.setText(movieItem.isFav ? "★ Retirer favori" : "⭐ Favori");
            btnFav.setOnClickListener(v -> {
                db.toggleFavorite(movieItem.id);
                movieItem.isFav = !movieItem.isFav;
                btnFav.setText(movieItem.isFav ? "★ Retirer favori" : "⭐ Favori");
                Toast.makeText(MainActivity.this, movieItem.isFav ? "Ajouté aux favoris" : "Retiré des favoris", Toast.LENGTH_SHORT).show();
            });

            if (btnSearchActor != null) {
                btnSearchActor.setOnClickListener(v -> {
                    dialog.dismiss();
                    if (movieItem != null && movieItem.cast != null && !movieItem.cast.isEmpty()) {
                        db.updateChannelMetadata(movieItem.id, movieItem.cast, movieItem.director, movieItem.plot, movieItem.genre, movieItem.releaseDate, movieItem.rating);
                    }
                    if (!firstActor[0].isEmpty()) {
                        switchToSearch(firstActor[0]);
                    } else {
                        switchToSearch(tvTitle.getText().toString());
                    }
                });
            }

            btnClose.setOnClickListener(v -> dialog.dismiss());
            dialog.show();

            if (dialog.getWindow() != null) {
                DisplayMetrics dm = getResources().getDisplayMetrics();
                int w = (int) (dm.widthPixels * 0.94f);
                int h = (int) (dm.heightPixels * 0.92f);
                dialog.getWindow().setLayout(w, h);
                dialog.getWindow().setGravity(Gravity.CENTER);
            }

            btnPlay.requestFocus();

        } catch (Throwable t) {
            Log.e(TAG, "Failed to show movie detail dialog", t);
        }
    }

    // --- FICHE SÉRIE (SERIES DETAIL DIALOG WITH SEASONS & EPISODES) ---
    private void showSeriesDetailDialog(final KeoDatabase.ChannelItem seriesItem) {
        if (isFinishing() || isDestroyed() || seriesItem == null) return;

        try {
            final KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
            View view = LayoutInflater.from(this).inflate(R.layout.dialog_series_detail, null);

            TextView tvTitle = view.findViewById(R.id.tv_series_title);
            TextView tvRating = view.findViewById(R.id.tv_series_rating);
            TextView tvMeta = view.findViewById(R.id.tv_series_meta);
            TextView tvDirector = view.findViewById(R.id.tv_series_director);
            ImageView ivCover = view.findViewById(R.id.iv_series_cover);
            TextView tvPlot = view.findViewById(R.id.tv_series_plot);
            TextView tvCast = view.findViewById(R.id.tv_series_cast);
            LinearLayout layoutActorsContainer = view.findViewById(R.id.layout_series_actors_container);
            Button btnResume = view.findViewById(R.id.btn_resume_series);
            LinearLayout layoutSeasons = view.findViewById(R.id.layout_seasons);
            RecyclerView recyclerEpisodes = view.findViewById(R.id.recycler_episodes);
            Button btnSearchActor = view.findViewById(R.id.btn_search_series_actor);
            Button btnFav = view.findViewById(R.id.btn_fav_series);
            Button btnClose = view.findViewById(R.id.btn_close_series);

            recyclerEpisodes.setLayoutManager(new LinearLayoutManager(this));

            tvTitle.setText(seriesItem.name);
            if (seriesItem.logo != null && !seriesItem.logo.isEmpty()) {
                ImageLoader.load(this, seriesItem.logo, ivCover);
            }

            final AlertDialog dialog = new AlertDialog.Builder(this)
                    .setView(view)
                    .create();

            if (dialog.getWindow() != null) {
                dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
            }

            final String[] firstActor = new String[]{""};
            final String rawId = seriesItem.id.replace("xtream_series_", "");

            // Pre-populate cached metadata
            if (seriesItem.rating != null && !seriesItem.rating.isEmpty()) {
                tvRating.setText("⭐ " + seriesItem.rating);
            }
            if (seriesItem.plot != null && !seriesItem.plot.isEmpty()) {
                tvPlot.setText(seriesItem.plot);
            }
            if (seriesItem.director != null && !seriesItem.director.isEmpty() && tvDirector != null) {
                tvDirector.setText("Réalisateur : " + seriesItem.director);
            }
            if (seriesItem.genre != null && !seriesItem.genre.isEmpty() && tvMeta != null) {
                String meta = (seriesItem.releaseDate != null ? seriesItem.releaseDate + " • " : "") + seriesItem.genre;
                tvMeta.setText(meta);
            }
            if (seriesItem.cast != null && !seriesItem.cast.isEmpty()) {
                populateActorChips(layoutActorsContainer, seriesItem.cast, dialog, seriesItem, firstActor);
            }

            // Check saved series resume progress
            org.json.JSONObject savedProg = getSavedSeriesProgress(rawId);
            if (savedProg != null && btnResume != null) {
                final String savedUrl = savedProg.optString("url", "");
                final String savedTitle = savedProg.optString("title", "");
                final long savedPos = savedProg.optLong("positionMs", 0L);
                if (savedPos > 15000L && !savedUrl.isEmpty()) {
                    btnResume.setVisibility(View.VISIBLE);
                    String shortTitle = savedTitle.replace(seriesItem.name, "").replaceAll("^\\s*-\\s*", "").trim();
                    if (shortTitle.isEmpty()) shortTitle = savedTitle;
                    btnResume.setText("▶ Reprendre : " + shortTitle + " (" + formatPlaybackTime(savedPos) + ")");
                    btnResume.setOnClickListener(v -> {
                        dialog.dismiss();
                        List<String> urls = new ArrayList<>();
                        urls.add(savedUrl);
                        List<String> titles = new ArrayList<>();
                        titles.add(savedTitle.isEmpty() ? seriesItem.name : savedTitle);
                        PlayerActivity.pendingUrls = urls;
                        PlayerActivity.pendingTitles = titles;
                        PlayerActivity.pendingIndex = 0;
                        PlayerActivity.pendingIsLive = false;
                        PlayerActivity.pendingSeriesId = rawId;
                        Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                        startActivity(intent);
                    });
                    btnResume.setOnLongClickListener(v -> {
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle(seriesItem.name)
                                .setMessage("Options de reprise de la série :")
                                .setPositiveButton("↺ Recommencer cet épisode", (d, which) -> {
                                    dialog.dismiss();
                                    List<String> urls = new ArrayList<>();
                                    urls.add(savedUrl);
                                    List<String> titles = new ArrayList<>();
                                    titles.add(savedTitle.isEmpty() ? seriesItem.name : savedTitle);
                                    PlayerActivity.pendingUrls = urls;
                                    PlayerActivity.pendingTitles = titles;
                                    PlayerActivity.pendingIndex = 0;
                                    PlayerActivity.pendingIsLive = false;
                                    PlayerActivity.pendingSeriesId = rawId;
                                    PlayerActivity.pendingForceRestart = true;
                                    Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                                    startActivity(intent);
                                })
                                .setNegativeButton("▶ Reprendre (" + formatPlaybackTime(savedPos) + ")", (d, which) -> {
                                    btnResume.performClick();
                                })
                                .setNeutralButton("Annuler", null)
                                .show();
                        return true;
                    });
                } else {
                    btnResume.setVisibility(View.GONE);
                }
            } else if (btnResume != null) {
                btnResume.setVisibility(View.GONE);
            }

            // Favorites button
            if (btnFav != null) {
                btnFav.setText(seriesItem.isFav ? "★ Retirer favori" : "⭐ Favori");
                btnFav.setOnClickListener(v -> {
                    db.toggleFavorite(seriesItem.id);
                    seriesItem.isFav = !seriesItem.isFav;
                    btnFav.setText(seriesItem.isFav ? "★ Retirer favori" : "⭐ Favori");
                    Toast.makeText(MainActivity.this, seriesItem.isFav ? "Ajouté aux favoris" : "Retiré des favoris", Toast.LENGTH_SHORT).show();
                });
            }

            // Search actor / series button
            if (btnSearchActor != null) {
                btnSearchActor.setOnClickListener(v -> {
                    dialog.dismiss();
                    if (seriesItem.cast != null && !seriesItem.cast.isEmpty()) {
                        db.updateChannelMetadata(seriesItem.id, seriesItem.cast, seriesItem.director, seriesItem.plot, seriesItem.genre, seriesItem.releaseDate, seriesItem.rating);
                    }
                    if (firstActor[0] != null && !firstActor[0].isEmpty()) {
                        switchToSearch(firstActor[0]);
                    } else {
                        switchToSearch(seriesItem.name);
                    }
                });
            }

            if (pl != null && pl.serverUrl != null && !pl.serverUrl.isEmpty()) {
                xtreamClient.fetchSeriesInfo(pl.serverUrl, pl.username, pl.password, rawId, new XtreamClient.SeriesInfoCallback() {
                    @Override
                    public void onSuccess(JsonObject seriesDetails) {
                        if (isFinishing() || isDestroyed()) return;

                        JsonObject info = seriesDetails.has("info") && seriesDetails.get("info").isJsonObject()
                                 ? seriesDetails.getAsJsonObject("info") : new JsonObject();

                        if (info.has("name") && !info.get("name").isJsonNull()) {
                            tvTitle.setText(info.get("name").getAsString());
                        }
                        if (info.has("rating") && !info.get("rating").isJsonNull()) {
                            tvRating.setText("⭐ " + info.get("rating").getAsString());
                        }
                        if (info.has("plot") && !info.get("plot").isJsonNull()) {
                            tvPlot.setText(info.get("plot").getAsString());
                        }
                        if (info.has("cover") && !info.get("cover").isJsonNull()) {
                            ImageLoader.load(MainActivity.this, info.get("cover").getAsString(), ivCover);
                        }

                        // Extract and cache metadata
                        String cast = info.has("cast") && !info.get("cast").isJsonNull() ? info.get("cast").getAsString().trim() : (seriesItem.cast != null ? seriesItem.cast : "");
                        if (cast.isEmpty() && info.has("actors") && !info.get("actors").isJsonNull()) {
                            cast = info.get("actors").getAsString().trim();
                        }
                        String director = info.has("director") && !info.get("director").isJsonNull() ? info.get("director").getAsString().trim() : (seriesItem.director != null ? seriesItem.director : "");
                        String genre = info.has("genre") && !info.get("genre").isJsonNull() ? info.get("genre").getAsString().trim() : (seriesItem.genre != null ? seriesItem.genre : "");
                        String plot = info.has("plot") && !info.get("plot").isJsonNull() ? info.get("plot").getAsString().trim() : (seriesItem.plot != null ? seriesItem.plot : "");
                        String releaseDate = info.has("releaseDate") && !info.get("releaseDate").isJsonNull() ? info.get("releaseDate").getAsString().trim() : (seriesItem.releaseDate != null ? seriesItem.releaseDate : "");
                        String rating = info.has("rating") && !info.get("rating").isJsonNull() ? info.get("rating").getAsString().trim() : (seriesItem.rating != null ? seriesItem.rating : "");

                        seriesItem.cast = cast;
                        seriesItem.director = director;
                        seriesItem.genre = genre;
                        seriesItem.plot = plot;
                        seriesItem.releaseDate = releaseDate;
                        seriesItem.rating = rating;

                        if (tvDirector != null && !director.isEmpty()) {
                            tvDirector.setText("Réalisateur : " + director);
                        }
                        if (tvMeta != null && (!genre.isEmpty() || !releaseDate.isEmpty())) {
                            tvMeta.setText((!releaseDate.isEmpty() ? releaseDate + " • " : "") + genre);
                        }
                        if (!cast.isEmpty()) {
                            populateActorChips(layoutActorsContainer, cast, dialog, seriesItem, firstActor);
                        }

                        final String fCast = cast;
                        final String fDirector = director;
                        final String fGenre = genre;
                        final String fPlot = plot;
                        final String fReleaseDate = releaseDate;
                        final String fRating = rating;
                        new Thread(() -> db.updateChannelMetadata(seriesItem.id, fCast, fDirector, fPlot, fGenre, fReleaseDate, fRating)).start();

                        JsonObject episodesObj = seriesDetails.has("episodes") && seriesDetails.get("episodes").isJsonObject()
                                ? seriesDetails.getAsJsonObject("episodes") : new JsonObject();

                        layoutSeasons.removeAllViews();
                        List<String> seasonKeys = new ArrayList<>(episodesObj.keySet());

                        if (seasonKeys.isEmpty()) {
                            tvPlot.setText("Aucun épisode disponible pour cette série.");
                            return;
                        }

                        final Button[] seasonButtons = new Button[seasonKeys.size()];
                        for (int s = 0; s < seasonKeys.size(); s++) {
                            final int sIdx = s;
                            final String seasonKey = seasonKeys.get(s);
                            Button btnSeason = new Button(MainActivity.this);
                            btnSeason.setText("Saison " + seasonKey);
                            btnSeason.setTextSize(11);
                            btnSeason.setTextColor(0xFFFFFFFF);
                            btnSeason.setBackgroundResource(R.drawable.bg_tab_selector);
                            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                                    ViewGroup.LayoutParams.WRAP_CONTENT, dpToPx(34));
                            lp.setMarginEnd(dpToPx(8));
                            btnSeason.setLayoutParams(lp);
                            btnSeason.setFocusable(true);
                            seasonButtons[s] = btnSeason;

                            btnSeason.setOnClickListener(v -> {
                                for (Button b : seasonButtons) if (b != null) b.setSelected(false);
                                btnSeason.setSelected(true);
                                loadEpisodesForSeason(episodesObj.getAsJsonArray(seasonKey), recyclerEpisodes, dialog, seriesItem.name, pl, rawId);
                            });

                            layoutSeasons.addView(btnSeason);
                        }

                        // Select first season by default
                        if (seasonButtons[0] != null) {
                            seasonButtons[0].setSelected(true);
                            loadEpisodesForSeason(episodesObj.getAsJsonArray(seasonKeys.get(0)), recyclerEpisodes, dialog, seriesItem.name, pl, rawId);
                        }
                    }

                    @Override
                    public void onError(String error) {
                        Toast.makeText(MainActivity.this, "Erreur épisodes : " + error, Toast.LENGTH_SHORT).show();
                    }
                });
            }

            btnClose.setOnClickListener(v -> dialog.dismiss());
            dialog.show();

            if (dialog.getWindow() != null) {
                DisplayMetrics dm = getResources().getDisplayMetrics();
                int w = (int) (dm.widthPixels * 0.94f);
                int h = (int) (dm.heightPixels * 0.92f);
                dialog.getWindow().setLayout(w, h);
                dialog.getWindow().setGravity(Gravity.CENTER);
            }

        } catch (Throwable t) {
            Log.e(TAG, "Failed to show series detail dialog", t);
        }
    }

    private void loadEpisodesForSeason(JsonArray episodes, RecyclerView recycler, AlertDialog dialog, String seriesName, KeoDatabase.PlaylistItem pl, String seriesId) {
        if (episodes == null || episodes.size() == 0) return;

        final List<EpisodeItem> list = new ArrayList<>();
        final List<String> streamUrls = new ArrayList<>();
        final List<String> displayTitles = new ArrayList<>();

        String server = pl.serverUrl.trim().replaceAll("/+$", "");
        if (!server.startsWith("http://") && !server.startsWith("https://")) server = "http://" + server;
        String user = pl.username.trim();
        String pass = pl.password.trim();

        for (int i = 0; i < episodes.size(); i++) {
            if (!episodes.get(i).isJsonObject()) continue;
            JsonObject ep = episodes.get(i).getAsJsonObject();
            String epId = XtreamClient.getOptString(ep, "id", "");
            int epNum = XtreamClient.getOptInt(ep, "episode_num", i + 1);
            String epTitle = XtreamClient.getOptString(ep, "title", "Épisode " + epNum);
            String ext = XtreamClient.getOptString(ep, "container_extension", "mkv");
            if (ext.isEmpty()) ext = "mkv";

            JsonObject info = ep.has("info") && ep.get("info").isJsonObject() ? ep.getAsJsonObject("info") : new JsonObject();
            String plot = XtreamClient.getOptString(info, "plot", "");
            String duration = XtreamClient.getOptString(info, "duration", "");

            String streamUrl = server + "/series/" + user + "/" + pass + "/" + epId + "." + ext;
            streamUrls.add(streamUrl);
            displayTitles.add(seriesName + " - E" + epNum + " - " + epTitle);

            EpisodeItem item = new EpisodeItem();
            item.num = epNum;
            item.title = epTitle;
            item.plot = plot;
            item.duration = duration;
            item.url = streamUrl;
            list.add(item);
        }

        recycler.setAdapter(new EpisodesAdapter(list, streamUrls, displayTitles, seriesId, dialog, (clickedItem, index) -> {
            dialog.dismiss();
            PlayerActivity.pendingUrls = streamUrls;
            PlayerActivity.pendingTitles = displayTitles;
            PlayerActivity.pendingIndex = index;
            PlayerActivity.pendingIsLive = false;
            PlayerActivity.pendingSeriesId = seriesId;

            Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
            startActivity(intent);
        }));
    }

    private static class EpisodeItem {
        int num;
        String title;
        String plot;
        String duration;
        String url;
    }

    private interface OnEpisodeClickListener {
        void onEpisodeClick(EpisodeItem item, int index);
    }

    private class EpisodesAdapter extends RecyclerView.Adapter<EpisodesAdapter.ViewHolder> {
        private final List<EpisodeItem> episodes;
        private final List<String> streamUrls;
        private final List<String> displayTitles;
        private final String seriesId;
        private final AlertDialog parentDialog;
        private final OnEpisodeClickListener listener;

        EpisodesAdapter(List<EpisodeItem> episodes, List<String> streamUrls, List<String> displayTitles, String seriesId, AlertDialog parentDialog, OnEpisodeClickListener listener) {
            this.episodes = episodes;
            this.streamUrls = streamUrls;
            this.displayTitles = displayTitles;
            this.seriesId = seriesId;
            this.parentDialog = parentDialog;
            this.listener = listener;
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_series_episode, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            EpisodeItem item = episodes.get(position);
            holder.tvNum.setText("E" + item.num);
            holder.tvTitle.setText(item.title);
            holder.tvPlot.setText(item.plot != null && !item.plot.isEmpty() ? item.plot : "Épisode de la série.");

            long epSavedPos = getSavedPositionForUrl(item.url);
            if (epSavedPos > 15000L) {
                holder.tvDuration.setText((item.duration != null && !item.duration.isEmpty() ? item.duration + " • " : "") + "⏱ " + formatPlaybackTime(epSavedPos));
                holder.tvDuration.setTextColor(0xFF38BDF8);
            } else {
                holder.tvDuration.setText(item.duration != null && !item.duration.isEmpty() ? item.duration : "");
                holder.tvDuration.setTextColor(0xFF64748B);
            }

            holder.itemView.setOnClickListener(v -> {
                int pos = holder.getBindingAdapterPosition();
                if (pos != RecyclerView.NO_POSITION && listener != null) {
                    listener.onEpisodeClick(item, pos);
                }
            });

            holder.itemView.setOnLongClickListener(v -> {
                int pos = holder.getBindingAdapterPosition();
                if (pos != RecyclerView.NO_POSITION) {
                    long posMs = getSavedPositionForUrl(item.url);
                    if (posMs > 15000L) {
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle(item.title)
                                .setMessage("Options de lecture de l'épisode :")
                                .setPositiveButton("↺ Recommencer du début", (d, which) -> {
                                    if (parentDialog != null) parentDialog.dismiss();
                                    PlayerActivity.pendingUrls = streamUrls;
                                    PlayerActivity.pendingTitles = displayTitles;
                                    PlayerActivity.pendingIndex = pos;
                                    PlayerActivity.pendingIsLive = false;
                                    PlayerActivity.pendingSeriesId = seriesId;
                                    PlayerActivity.pendingForceRestart = true;
                                    Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                                    startActivity(intent);
                                })
                                .setNegativeButton("▶ Reprendre (" + formatPlaybackTime(posMs) + ")", (d, which) -> {
                                    if (parentDialog != null) parentDialog.dismiss();
                                    PlayerActivity.pendingUrls = streamUrls;
                                    PlayerActivity.pendingTitles = displayTitles;
                                    PlayerActivity.pendingIndex = pos;
                                    PlayerActivity.pendingIsLive = false;
                                    PlayerActivity.pendingSeriesId = seriesId;
                                    Intent intent = new Intent(MainActivity.this, PlayerActivity.class);
                                    startActivity(intent);
                                })
                                .setNeutralButton("Annuler", null)
                                .show();
                        return true;
                    }
                }
                return false;
            });
        }

        @Override
        public int getItemCount() {
            return episodes.size();
        }

        class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvNum, tvTitle, tvPlot, tvDuration;
            ViewHolder(View v) {
                super(v);
                tvNum = v.findViewById(R.id.tv_episode_num);
                tvTitle = v.findViewById(R.id.tv_episode_title);
                tvPlot = v.findViewById(R.id.tv_episode_plot);
                tvDuration = v.findViewById(R.id.tv_episode_duration);
            }
        }
    }

    // --- REPLAY & CATCHUP DIALOG ---
    private void showCatchupDialog(final KeoDatabase.ChannelItem ch) {
        if (ch == null || isFinishing() || isDestroyed()) return;
        final KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl == null || pl.serverUrl == null || pl.serverUrl.isEmpty()) {
            Toast.makeText(this, "Compte non configuré", Toast.LENGTH_SHORT).show();
            return;
        }

        final String streamId = (ch.streamId != null && !ch.streamId.isEmpty())
                ? ch.streamId
                : ch.id.replace("xtream_live_", "").replace("xtream_replay_", "");

        Toast.makeText(this, "Chargement des programmes en Replay...", Toast.LENGTH_SHORT).show();
        xtreamClient.fetchCatchupPrograms(pl.serverUrl, pl.username, pl.password, streamId, 3, new XtreamClient.CatchupCallback() {
            @Override
            public void onSuccess(List<XtreamClient.EpgProgram> pastPrograms) {
                if (isFinishing() || isDestroyed()) return;
                if (pastPrograms.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Aucun programme en Replay disponible pour cette chaîne.", Toast.LENGTH_LONG).show();
                    return;
                }

                String[] items = new String[pastPrograms.size()];
                for (int i = 0; i < pastPrograms.size(); i++) {
                    XtreamClient.EpgProgram p = pastPrograms.get(i);
                    items[i] = p.getFormattedTime() + " - " + p.title;
                }

                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("🔄 Replay : " + ch.name)
                        .setItems(items, (dialog, which) -> {
                            playCatchupStream(ch, pastPrograms.get(which), pl);
                        })
                        .setNegativeButton("Fermer", null)
                        .show();
            }

            @Override
            public void onError(String error) {
                if (isFinishing() || isDestroyed()) return;
                Toast.makeText(MainActivity.this, "Erreur Replay : " + error, Toast.LENGTH_LONG).show();
            }
        });
    }

    private void playCatchupStream(KeoDatabase.ChannelItem ch, XtreamClient.EpgProgram prog, KeoDatabase.PlaylistItem pl) {
        try {
            String server = pl.serverUrl.trim().replaceAll("/+$", "");
            if (!server.startsWith("http://") && !server.startsWith("https://")) server = "http://" + server;
            String user = pl.username.trim();
            String pass = pl.password.trim();
            String cleanId = ch.streamId != null && !ch.streamId.isEmpty() ? ch.streamId : ch.id.replace("xtream_live_", "").replace("xtream_replay_", "");

            SimpleDateFormat sdfLocal = new SimpleDateFormat("yyyy-MM-dd:HH-mm", Locale.US);
            String startFormattedLocal = sdfLocal.format(new Date(prog.startMs));

            SimpleDateFormat sdfUtc = new SimpleDateFormat("yyyy-MM-dd:HH-mm", Locale.US);
            sdfUtc.setTimeZone(TimeZone.getTimeZone("UTC"));
            String startFormattedUtc = sdfUtc.format(new Date(prog.startMs));

            long durationMins = (prog.stopMs - prog.startMs) / (60 * 1000);
            if (durationMins <= 0) durationMins = 60;
            long startSec = prog.startMs / 1000L;

            String encUser = URLEncoder.encode(user, "UTF-8");
            String encPass = URLEncoder.encode(pass, "UTF-8");

            List<String> urls = new ArrayList<>();
            List<String> titles = new ArrayList<>();

            // 1. Standard Xtream Codes Catchup: /streaming/timeshift.php (local time)
            urls.add(server + "/streaming/timeshift.php?username=" + encUser + "&password=" + encPass + "&stream=" + cleanId + "&start=" + startFormattedLocal + "&duration=" + durationMins);
            // 2. Direct Xtream MPEG-TS format: /timeshift/{user}/{pass}/{dur}/{local}/{stream}.ts
            urls.add(server + "/timeshift/" + encUser + "/" + encPass + "/" + durationMins + "/" + startFormattedLocal + "/" + cleanId + ".ts");
            // 3. Direct Xtream HLS format: /timeshift/{user}/{pass}/{dur}/{local}/{stream}.m3u8
            urls.add(server + "/timeshift/" + encUser + "/" + encPass + "/" + durationMins + "/" + startFormattedLocal + "/" + cleanId + ".m3u8");
            // 4. Timeshift with UTC time (if server clock is UTC)
            if (!startFormattedUtc.equals(startFormattedLocal)) {
                urls.add(server + "/streaming/timeshift.php?username=" + encUser + "&password=" + encPass + "&stream=" + cleanId + "&start=" + startFormattedUtc + "&duration=" + durationMins);
                urls.add(server + "/timeshift/" + encUser + "/" + encPass + "/" + durationMins + "/" + startFormattedUtc + "/" + cleanId + ".ts");
            }
            // 5. Unix timestamp format (XUI.one and newer Xtream panels)
            urls.add(server + "/timeshift/" + encUser + "/" + encPass + "/" + durationMins + "/" + startSec + "/" + cleanId + ".ts");

            for (int u = 0; u < urls.size(); u++) {
                titles.add("[Replay] " + ch.name + " - " + prog.title);
            }

            PlayerActivity.pendingUrls = urls;
            PlayerActivity.pendingTitles = titles;
            PlayerActivity.pendingIndex = 0;
            PlayerActivity.pendingIsLive = false;
            PlayerActivity.pendingSingleStreamMode = true;
            PlayerActivity.pendingCurrentProgramTitle = prog.title;
            PlayerActivity.pendingCurrentProgramDesc = prog.desc;
            PlayerActivity.pendingCurrentProgramTime = prog.getFormattedTime();

            Intent intent = new Intent(this, PlayerActivity.class);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Erreur lecture Replay : " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void triggerSync() {
        KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl == null || pl.serverUrl == null || pl.serverUrl.isEmpty()) {
            Toast.makeText(this, "Veuillez d'abord configurer votre compte IPTV", Toast.LENGTH_LONG).show();
            showCloudSyncDialog();
            return;
        }

        tvStatusBadge.setText("🔄 Synchronisation...");
        tvStatusBadge.setBackgroundColor(0xFF0284C7);

        xtreamClient.syncPlaylist(pl.serverUrl, pl.username, pl.password, db, new XtreamClient.SyncCallback() {
            @Override
            public void onProgress(String message) {
                runOnUiThread(() -> tvStatusBadge.setText("🔄 " + message));
            }

            @Override
            public void onSuccess(int liveCount, int vodCount, int seriesCount) {
                runOnUiThread(() -> {
                    tvStatusBadge.setText("✅ Prêt (" + liveCount + " chaînes, " + vodCount + " films, " + seriesCount + " séries)");
                    tvStatusBadge.setBackgroundColor(0xFF132E27);
                    loadLocalData();
                    Toast.makeText(MainActivity.this, "Synchronisation terminée avec succès !", Toast.LENGTH_LONG).show();
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    tvStatusBadge.setText("❌ Erreur");
                    tvStatusBadge.setBackgroundColor(0xFF4C0519);

                    if (isFinishing() || isDestroyed()) return;
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("⚠️ Erreur de synchronisation IPTV")
                            .setMessage("Impossible de synchroniser avec le serveur IPTV :\n\n" + error + "\n\n💡 Vérifiez votre connexion internet ou vos identifiants.")
                            .setPositiveButton("Fermer", null)
                            .setNeutralButton("Vérifier le compte", (dialog, which) -> showLoginDialog())
                            .show();
                });
            }
        });
    }

    private void updateHeaderPlaylistInfo(KeoDatabase.PlaylistItem pl) {
        if (tvHeaderSyncInfo != null && pl != null) {
            String exp = (pl.expDate != null && !pl.expDate.isEmpty()) ? " • Exp: " + pl.expDate : "";
            tvHeaderSyncInfo.setText(pl.name + " (" + pl.username + ")" + exp);
        }
    }

    // --- SECURE CLOUD SYNC DIALOG (PASSWORD MANDATORY) ---
    private void showCloudSyncDialog() {
        if (isFinishing() || isDestroyed()) return;

        try {
            final SharedPreferences prefs = getSharedPreferences("keotv_prefs", MODE_PRIVATE);
            String lastUser = prefs.getString("cloud_username", "heyhacene@gmail.com");

            LinearLayout layout = new LinearLayout(this);
            layout.setOrientation(LinearLayout.VERTICAL);
            layout.setPadding(36, 24, 36, 24);

            TextView tvInfo = new TextView(this);
            tvInfo.setText("Récupérez instantanément vos abonnements IPTV enregistrés sur le portail Web (https://keotv.vercel.app/sync).\n\nSaisissez votre email et mot de passe de compte :");
            tvInfo.setTextColor(0xFFCBD5E1);
            tvInfo.setTextSize(12);
            tvInfo.setPadding(0, 0, 0, 16);
            layout.addView(tvInfo);

            final EditText etUser = new EditText(this);
            etUser.setHint("Adresse email (ex: heyhacene@gmail.com)");
            etUser.setText(lastUser);
            etUser.setTextColor(0xFFFFFFFF);
            etUser.setTextSize(13);
            layout.addView(etUser);

            final EditText etPass = new EditText(this);
            etPass.setHint("Mot de passe du compte");
            etPass.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
            etPass.setTextColor(0xFFFFFFFF);
            etPass.setTextSize(13);
            layout.addView(etPass);

            new AlertDialog.Builder(this)
                    .setTitle("☁️ Rapatriement Sécurisé depuis le Cloud")
                    .setView(layout)
                    .setPositiveButton("Rapatrier", (dialog, which) -> {
                        String ident = etUser.getText().toString().trim();
                        String pass = etPass.getText().toString().trim();

                        if (ident.isEmpty()) {
                            Toast.makeText(MainActivity.this, "Veuillez entrer votre adresse email", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        if (pass.isEmpty()) {
                            Toast.makeText(MainActivity.this, "Mot de passe obligatoire pour sécuriser vos playlists", Toast.LENGTH_SHORT).show();
                            return;
                        }

                        prefs.edit().putString("cloud_username", ident).apply();
                        pullAccountsFromCloud(ident, pass);
                    })
                    .setNeutralButton("Saisie Manuelle", (dialog, which) -> showLoginDialog())
                    .setNegativeButton("Annuler", null)
                    .show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to show cloud sync dialog", t);
        }
    }

    private void pullAccountsFromCloud(final String ident, final String password) {
        tvStatusBadge.setText("⏳ Vérification...");
        Toast.makeText(this, "Connexion sécurisée pour '" + ident + "'...", Toast.LENGTH_SHORT).show();

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
                        Toast.makeText(MainActivity.this, "Aucun compte trouvé pour '" + ident + "'.", Toast.LENGTH_LONG).show();
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

                // PASSWORD AUTHENTICATION VERIFICATION
                String storedHash = userObj.has("password_hash") && !userObj.get("password_hash").isJsonNull()
                        ? userObj.get("password_hash").getAsString() : "";
                String enteredHash = XtreamClient.hashPassword(password);
                boolean isAuthorized = false;

                if (!storedHash.isEmpty() && enteredHash.equalsIgnoreCase(storedHash)) {
                    isAuthorized = true;
                } else if (targetPl.has("password") && password.equals(targetPl.get("password").getAsString())) {
                    isAuthorized = true;
                } else if (targetPl.has("username") && password.equals(targetPl.get("username").getAsString())) {
                    isAuthorized = true;
                }

                if (!isAuthorized) {
                    runOnUiThread(() -> {
                        tvStatusBadge.setText("❌ Refusé");
                        Toast.makeText(MainActivity.this, "Mot de passe cloud incorrect ! Accès refusé.", Toast.LENGTH_LONG).show();
                    });
                    return;
                }

                final KeoDatabase.PlaylistItem pl = new KeoDatabase.PlaylistItem();
                pl.id = targetPl.has("id") ? targetPl.get("id").getAsString() : "active_xtream";
                pl.name = targetPl.has("name") ? targetPl.get("name").getAsString() : "Abonnement Xtream";
                pl.type = targetPl.has("type") ? targetPl.get("type").getAsString() : "xtream";
                pl.serverUrl = targetPl.has("server_url") ? targetPl.get("server_url").getAsString() : "";
                pl.username = targetPl.has("username") ? targetPl.get("username").getAsString() : "";
                pl.password = targetPl.has("password") ? targetPl.get("password").getAsString() : "";

                db.savePlaylist(pl);

                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "Authentification réussie ! Lancement de la synchronisation...", Toast.LENGTH_LONG).show();
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

    private void showSettingsDialog() {
        if (isFinishing() || isDestroyed()) return;

        try {
            final String[] items = {
                    "🛡️ Contrôle Parental & Code PIN Adulte",
                    "☁️ Compte & Synchronisation Cloud",
                    "📺 Lecteur Vidéo & Performances (Media3)",
                    "🧹 Vider le Cache & Resynchroniser",
                    "🔄 Rechercher des Mises à Jour (OTA)",
                    "📊 Diagnostic & État du Système",
                    "⚠️ Réinitialisation Usine Complète"
            };

            new AlertDialog.Builder(this)
                    .setTitle("⚙️ PARAMÈTRES KEOTV")
                    .setItems(items, (dialog, which) -> {
                        switch (which) {
                            case 0:
                                showParentalControlDialog();
                                break;
                            case 1:
                                showCloudSyncDialog();
                                break;
                            case 2:
                                showPlayerSettingsDialog();
                                break;
                            case 3:
                                Toast.makeText(this, "Purge du cache...", Toast.LENGTH_SHORT).show();
                                db.purgeCache(true);
                                loadLocalData();
                                triggerSync();
                                break;
                            case 4:
                                UpdateManager.checkForUpdates(this, true);
                                break;
                            case 5:
                                showDiagnosticDialog();
                                break;
                            case 6:
                                performFactoryReset();
                                break;
                        }
                    })
                    .setNegativeButton("Fermer", null)
                    .show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to show settings dialog", t);
        }
    }

    private void showParentalControlDialog() {
        if (isFinishing() || isDestroyed()) return;
        final String savedPin = db.getSetting("parental_pin", "0000");
        final boolean isLocked = "true".equals(db.getSetting("parental_locked", "false"));

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32, 24, 32, 24);

        TextView tvInfo = new TextView(this);
        tvInfo.setText("Statut actuel : " + (isLocked ? "🔒 BOUQUETS ADULTES VERROUILLÉS" : "🔓 DÉVERROUILLÉ") + "\n\nEntrez le code PIN parental à 4 chiffres (défaut: 0000) :");
        tvInfo.setTextColor(0xFFCBD5E1);
        tvInfo.setTextSize(12);
        tvInfo.setPadding(0, 0, 0, 16);
        layout.addView(tvInfo);

        final EditText etPin = new EditText(this);
        etPin.setHint("Code PIN (4 chiffres)");
        etPin.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        layout.addView(etPin);

        new AlertDialog.Builder(this)
                .setTitle("🛡️ Contrôle Parental")
                .setView(layout)
                .setPositiveButton(isLocked ? "Déverrouiller" : "Verrouiller", (d, w) -> {
                    String entered = etPin.getText().toString().trim();
                    if (entered.equals(savedPin)) {
                        boolean newLocked = !isLocked;
                        db.setSetting("parental_locked", String.valueOf(newLocked));
                        Toast.makeText(this, newLocked ? "Bouquets adultes verrouillés" : "Bouquets adultes déverrouillés", Toast.LENGTH_SHORT).show();
                        loadLocalData();
                    } else {
                        Toast.makeText(this, "Code PIN incorrect !", Toast.LENGTH_LONG).show();
                    }
                })
                .setNeutralButton("Changer le PIN", (d, w) -> showChangePinDialog())
                .setNegativeButton("Annuler", null)
                .show();
    }

    private void showChangePinDialog() {
        if (isFinishing() || isDestroyed()) return;
        final String savedPin = db.getSetting("parental_pin", "0000");

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(32, 24, 32, 24);

        final EditText etOld = new EditText(this);
        etOld.setHint("Ancien code PIN");
        etOld.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        layout.addView(etOld);

        final EditText etNew = new EditText(this);
        etNew.setHint("Nouveau code PIN (4 chiffres)");
        etNew.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        layout.addView(etNew);

        new AlertDialog.Builder(this)
                .setTitle("Modifier le Code PIN Parental")
                .setView(layout)
                .setPositiveButton("Enregistrer", (d, w) -> {
                    String oldP = etOld.getText().toString().trim();
                    String newP = etNew.getText().toString().trim();
                    if (!oldP.equals(savedPin)) {
                        Toast.makeText(this, "Ancien PIN incorrect", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    if (newP.length() < 4) {
                        Toast.makeText(this, "Le PIN doit contenir 4 chiffres", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    db.setSetting("parental_pin", newP);
                    Toast.makeText(this, "Code PIN mis à jour avec succès !", Toast.LENGTH_LONG).show();
                })
                .setNegativeButton("Annuler", null)
                .show();
    }

    private void showPlayerSettingsDialog() {
        if (isFinishing() || isDestroyed()) return;
        final SharedPreferences prefs = getSharedPreferences("keotv_player_prefs", MODE_PRIVATE);
        boolean hwAccel = prefs.getBoolean("hw_accel", true);
        String bufferSize = prefs.getString("buffer_sec", "15");

        String[] options = {
                "Accélération Matérielle : " + (hwAccel ? "✅ Activée" : "❌ Désactivée"),
                "Tampon de diffusion : " + bufferSize + " secondes (Recommandé: 15s)"
        };

        new AlertDialog.Builder(this)
                .setTitle("📺 Préférences Lecteur Vidéo (Media3 ExoPlayer)")
                .setItems(options, (d, which) -> {
                    if (which == 0) {
                        prefs.edit().putBoolean("hw_accel", !hwAccel).apply();
                        Toast.makeText(this, "Accélération matérielle : " + (!hwAccel ? "Activée" : "Désactivée"), Toast.LENGTH_SHORT).show();
                    } else if (which == 1) {
                        String[] buffers = {"5 secondes (Faible latence)", "15 secondes (Standard)", "30 secondes (Connexion lente)"};
                        new AlertDialog.Builder(this)
                                .setTitle("Taille du Tampon Vidéo")
                                .setItems(buffers, (bd, bw) -> {
                                    String val = bw == 0 ? "5" : (bw == 1 ? "15" : "30");
                                    prefs.edit().putString("buffer_sec", val).apply();
                                    Toast.makeText(this, "Tampon défini à " + val + " secondes", Toast.LENGTH_SHORT).show();
                                }).show();
                    }
                })
                .setNegativeButton("Fermer", null)
                .show();
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
                            if (tvHeaderSyncInfo != null) tvHeaderSyncInfo.setText("Aucun compte configuré");
                            if (tvStatusBadge != null) {
                                tvStatusBadge.setText("⚪ Réinitialisé");
                                tvStatusBadge.setBackgroundColor(0xFF1E293B);
                            }
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

    private void showLoginDialog() {
        if (isFinishing() || isDestroyed()) return;

        try {
            KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
            LinearLayout layout = new LinearLayout(this);
            layout.setOrientation(LinearLayout.VERTICAL);
            layout.setPadding(32, 24, 32, 24);

            final EditText etUrl = new EditText(this);
            etUrl.setHint("URL du serveur (ex: http://domaine.xyz:8080)");
            etUrl.setText(pl != null ? pl.serverUrl : "");
            layout.addView(etUrl);

            final EditText etUser = new EditText(this);
            etUser.setHint("Identifiant Xtream");
            etUser.setText(pl != null ? pl.username : "");
            layout.addView(etUser);

            final EditText etPass = new EditText(this);
            etPass.setHint("Mot de passe Xtream");
            etPass.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
            etPass.setText(pl != null ? pl.password : "");
            layout.addView(etPass);

            new AlertDialog.Builder(this)
                    .setTitle("Configuration du Compte IPTV")
                    .setView(layout)
                    .setPositiveButton("Enregistrer & Synchro", (dialog, which) -> {
                        String url = etUrl.getText().toString().trim();
                        String user = etUser.getText().toString().trim();
                        String pass = etPass.getText().toString().trim();

                        if (url.isEmpty() || user.isEmpty() || pass.isEmpty()) {
                            Toast.makeText(MainActivity.this, "Tous les champs sont requis", Toast.LENGTH_SHORT).show();
                            return;
                        }

                        KeoDatabase.PlaylistItem item = new KeoDatabase.PlaylistItem();
                        item.id = "active_xtream";
                        item.name = "Abonnement Xtream";
                        item.type = "xtream";
                        item.serverUrl = url;
                        item.username = user;
                        item.password = pass;

                        db.savePlaylist(item);
                        updateHeaderPlaylistInfo(item);
                        triggerSync();
                    })
                    .setNeutralButton("☁️ Portail Cloud", (dialog, which) -> showCloudSyncDialog())
                    .setNegativeButton("Annuler", null)
                    .show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to show login dialog", t);
        }
    }

    // --- RECYCLER VIEW ADAPTERS ---

    private String formatCategoryNameWithIcon(String name, String type) {
        if (name == null) return "";
        if (name.startsWith("⭐") || name.startsWith("📺") || name.startsWith("🎬") ||
            name.startsWith("🍿") || name.startsWith("⚽") || name.startsWith("🔄") || name.startsWith("🇫🇷")) {
            return name;
        }

        String upper = name.toUpperCase(Locale.ROOT);
        String icon;

        if (upper.contains("FAVORI")) {
            icon = "⭐ ";
        } else if (upper.contains("SPORT") || upper.contains("FOOT") || upper.contains("BEIN") ||
                   upper.contains("CANAL+ SPORT") || upper.contains("RMC") || upper.contains("LIGUE") ||
                   upper.contains("EUROSPORT") || upper.contains("DAZN") || upper.contains("FORMULA") ||
                   upper.contains("F1") || upper.contains("MOTO") || upper.contains("NBA")) {
            icon = "⚽ ";
        } else if (upper.contains("CINEMA") || upper.contains("FILM") || upper.contains("ACTION") ||
                   upper.contains("COMEDIE") || upper.contains("THRILLER") || upper.contains("HORREUR") ||
                   upper.contains("BOX OFFICE") || upper.contains("MARVEL") || upper.contains("DISNEY+ FILM")) {
            icon = "🎬 ";
        } else if (upper.contains("SERIE") || upper.contains("NETFLIX") || upper.contains("AMAZON") ||
                   upper.contains("DISNEY") || upper.contains("HBO") || upper.contains("APPLE") ||
                   upper.contains("PARAMOUNT") || upper.contains("CANAL+ SERIES")) {
            icon = "🍿 ";
        } else if (upper.contains("ENFANT") || upper.contains("JEUNESSE") || upper.contains("KIDS") ||
                   upper.contains("CARTOON") || upper.contains("ANIMATION") || upper.contains("GULLI") ||
                   upper.contains("DISNEY JR") || upper.contains("NICKELODEON")) {
            icon = "🧒 ";
        } else if (upper.contains("DOC") || upper.contains("DISCOVERY") || upper.contains("PLANETE") ||
                   upper.contains("NATIONAL GEO") || upper.contains("HISTOIRE") || upper.contains("SCIENCE")) {
            icon = "🌍 ";
        } else if (upper.contains("NEWS") || upper.contains("INFO") || upper.contains("BFM") ||
                   upper.contains("LCI") || upper.contains("CNEWS") || upper.contains("FRANCE 24")) {
            icon = "📰 ";
        } else if (upper.contains("MUSIC") || upper.contains("MTV") || upper.contains("TRACE") ||
                   upper.contains("MEZZO") || upper.contains("CONCERT") || upper.contains("RADIO")) {
            icon = "🎵 ";
        } else if (upper.contains("FRANCE") || upper.contains("FR |") || upper.contains("TNT") ||
                   upper.contains("GENERALISTE")) {
            icon = "🇫🇷 ";
        } else if (upper.contains("BELGIQUE") || upper.contains("BE |")) {
            icon = "🇧🇪 ";
        } else if (upper.contains("SUISSE") || upper.contains("CH |")) {
            icon = "🇨🇭 ";
        } else if (upper.contains("ESPAGNE") || upper.contains("ES |")) {
            icon = "🇪🇸 ";
        } else if (upper.contains("ITALIE") || upper.contains("IT |")) {
            icon = "🇮🇹 ";
        } else if (upper.contains("PORTUGAL") || upper.contains("PT |")) {
            icon = "🇵🇹 ";
        } else if (upper.contains("ARAB") || upper.contains("AR |")) {
            icon = "🇸🇦 ";
        } else if (upper.contains("4K") || upper.contains("UHD")) {
            icon = "💎 ";
        } else if ("vod".equals(type)) {
            icon = "🎬 ";
        } else if ("series".equals(type)) {
            icon = "🍿 ";
        } else if ("replay".equals(type)) {
            icon = "🔄 ";
        } else {
            icon = "📺 ";
        }

        return icon + name;
    }

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

        public void setSelectedPos(int pos) {
            this.selectedPos = pos;
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_category, parent, false);
            if (parent instanceof RecyclerView) {
                RecyclerView.LayoutManager lm = ((RecyclerView) parent).getLayoutManager();
                if (lm != null && lm.canScrollHorizontally()) {
                    ViewGroup.LayoutParams lp = v.getLayoutParams();
                    if (lp != null) {
                        lp.width = ViewGroup.LayoutParams.WRAP_CONTENT;
                        lp.height = dpToPx(40);
                        v.setLayoutParams(lp);
                    }
                }
            }
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            KeoDatabase.CategoryItem item = items.get(position);
            holder.tvName.setText(formatCategoryNameWithIcon(item.name, item.type));
            holder.tvCount.setText(String.valueOf(item.count));
            holder.itemView.setSelected(selectedPos == position);

            holder.itemView.setOnClickListener(v -> {
                int pos = holder.getBindingAdapterPosition();
                if (pos != RecyclerView.NO_POSITION) {
                    selectedPos = pos;
                    mainHandler.removeCallbacks(categoryDebounceRunnable);
                    selectCategory(item);
                }
            });

            holder.itemView.setOnFocusChangeListener((v, hasFocus) -> {
                if (hasFocus) {
                    int pos = holder.getBindingAdapterPosition();
                    if (pos != RecyclerView.NO_POSITION) {
                        selectedPos = pos;
                        selectCategoryDebounced(item);
                    }
                }
            });

            holder.itemView.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        focusActiveSidebarButton();
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        focusChannelsList();
                        return true;
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

        public void notifyItemChangedById(String channelId) {
            for (int i = 0; i < items.size(); i++) {
                if (items.get(i).id.equals(channelId)) {
                    notifyItemChanged(i);
                    break;
                }
            }
        }

        public int getPositionForId(String channelId) {
            for (int i = 0; i < items.size(); i++) {
                if (items.get(i).id.equals(channelId)) {
                    return i;
                }
            }
            return -1;
        }

        public int getSelectedPos() {
            return selectedPos;
        }

        public void setSelectedPos(int pos) {
            this.selectedPos = pos;
            notifyDataSetChanged();
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

            // Logo
            if (holder.ivLogo != null) {
                if (item.logo != null && !item.logo.trim().isEmpty()) {
                    holder.ivLogo.setVisibility(View.VISIBLE);
                    ImageLoader.load(holder.itemView.getContext(), item.logo, holder.ivLogo);
                } else {
                    holder.ivLogo.setVisibility(View.GONE);
                }
            }

            // Favorite star badge
            if (holder.tvFavStar != null) {
                holder.tvFavStar.setVisibility(item.isFav ? View.VISIBLE : View.GONE);
            }

            // Replay badge
            if (holder.tvReplayBadge != null) {
                holder.tvReplayBadge.setVisibility(item.tvArchive == 1 ? View.VISIBLE : View.GONE);
            }

            // Layout based on content type: TiviMate horizontal timeline for TV / Replay, or description for VOD / Series
            boolean isLiveOrReplay = "live".equals(item.streamType) || "replay".equals(currentType);

            if (isLiveOrReplay && holder.layoutEpgTimeline != null) {
                holder.layoutEpgTimeline.setVisibility(View.VISIBLE);
                if (holder.tvEpg != null) holder.tvEpg.setVisibility(View.GONE);

                // NOW Slot
                String cached = epgCurrentTitleCache.get(item.id);
                if (cached != null && !cached.isEmpty()) {
                    holder.tvEpgNow.setText("🔴 " + cached);
                } else {
                    holder.tvEpgNow.setText("🔴 En direct : " + item.name);
                }

                // PAST Slot (Replay)
                String pastCached = epgPastTitleCache.get(item.id);
                if (pastCached != null && !pastCached.isEmpty()) {
                    holder.tvEpgPast.setText("◄ " + pastCached);
                    holder.tvEpgPast.setTextColor(0xFF38BDF8);
                } else if (item.tvArchive == 1 || "replay".equals(currentType)) {
                    holder.tvEpgPast.setText("◄ Replay disponible");
                    holder.tvEpgPast.setTextColor(0xFF38BDF8);
                } else {
                    holder.tvEpgPast.setText("◄ Replay");
                    holder.tvEpgPast.setTextColor(0xFF64748B);
                }

                // NEXT Slot
                String nextCached = epgNextTitleCache.get(item.id);
                if (nextCached != null && !nextCached.isEmpty()) {
                    holder.tvEpgNext.setText("⏭️ " + nextCached);
                } else {
                    holder.tvEpgNext.setText("⏭️ À suivre");
                }

                // EPG Timeline navigation & clicks
                holder.tvEpgPast.setOnClickListener(v -> showCatchupDialog(item));
                holder.tvEpgPast.setOnKeyListener((v, keyCode, event) -> {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) {
                        if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                            holder.itemView.requestFocus();
                            return true;
                        } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                            if (holder.tvEpgNow != null) {
                                holder.tvEpgNow.requestFocus();
                                return true;
                            }
                        }
                    }
                    return false;
                });

                holder.tvEpgNow.setOnClickListener(v -> launchPlayerFullscreen());
                holder.tvEpgNow.setOnKeyListener((v, keyCode, event) -> {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) {
                        if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                            if (holder.tvEpgPast != null) {
                                holder.tvEpgPast.requestFocus();
                                return true;
                            }
                        } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                            if (holder.tvEpgNext != null) {
                                holder.tvEpgNext.requestFocus();
                                return true;
                            }
                        }
                    }
                    return false;
                });

                holder.tvEpgNext.setOnClickListener(v -> {
                    String next = epgNextTitleCache.get(item.id);
                    if (next != null && !next.isEmpty()) {
                        Toast.makeText(MainActivity.this, "À suivre sur " + item.name + " : " + next, Toast.LENGTH_LONG).show();
                    } else {
                        Toast.makeText(MainActivity.this, "Prochain programme : " + item.name, Toast.LENGTH_SHORT).show();
                    }
                });
                holder.tvEpgNext.setOnKeyListener((v, keyCode, event) -> {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) {
                        if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                            if (holder.tvEpgNow != null) {
                                holder.tvEpgNow.requestFocus();
                                return true;
                            }
                        }
                    }
                    return false;
                });

            } else {
                if (holder.layoutEpgTimeline != null) holder.layoutEpgTimeline.setVisibility(View.GONE);
                if (holder.tvEpg != null) {
                    holder.tvEpg.setVisibility(View.VISIBLE);
                    if ("vod".equals(item.streamType)) {
                        StringBuilder sb = new StringBuilder("🎬 Film VOD");
                        if (item.releaseDate != null && !item.releaseDate.isEmpty()) sb.append(" • ").append(item.releaseDate);
                        if (item.rating != null && !item.rating.isEmpty()) sb.append(" • ⭐ ").append(item.rating);
                        if (item.director != null && !item.director.isEmpty()) sb.append(" • ").append(item.director);
                        holder.tvEpg.setText(sb.toString());
                    } else if ("series".equals(item.streamType)) {
                        StringBuilder sb = new StringBuilder("🍿 Série TV");
                        if (item.releaseDate != null && !item.releaseDate.isEmpty()) sb.append(" • ").append(item.releaseDate);
                        if (item.rating != null && !item.rating.isEmpty()) sb.append(" • ⭐ ").append(item.rating);
                        sb.append(" • Cliquez pour saisons & épisodes");
                        holder.tvEpg.setText(sb.toString());
                    } else {
                        holder.tvEpg.setText(item.groupName != null ? item.groupName : "Direct");
                    }
                }
            }

            // Resolution styling
            if ("4K".equalsIgnoreCase(item.resolution) || "UHD".equalsIgnoreCase(item.resolution)) {
                holder.tvRes.setTextColor(0xFFF59E0B);
                holder.tvRes.setBackgroundColor(0xFF332005);
            } else if ("FHD".equalsIgnoreCase(item.resolution)) {
                holder.tvRes.setTextColor(0xFF38BDF8);
                holder.tvRes.setBackgroundColor(0xFF0F243A);
            } else {
                holder.tvRes.setTextColor(0xFF94A3B8);
                holder.tvRes.setBackgroundColor(0xFF1E293B);
            }

            holder.itemView.setSelected(selectedPos == position);

            // Channel row click
            holder.itemView.setOnClickListener(v -> {
                int pos = holder.getBindingAdapterPosition();
                if (pos != RecyclerView.NO_POSITION) {
                    selectedPos = pos;
                    selectChannel(item);

                    if ("replay".equals(currentType)) {
                        showCatchupDialog(item);
                    } else if ("vod".equals(item.streamType)) {
                        showMovieDetailDialog(item);
                    } else if ("series".equals(item.streamType)) {
                        showSeriesDetailDialog(item);
                    } else {
                        launchPlayerFullscreen();
                    }
                }
            });

            // Long click on channel row directly opens Catchup / Replay
            holder.itemView.setOnLongClickListener(v -> {
                int pos = holder.getBindingAdapterPosition();
                if (pos != RecyclerView.NO_POSITION) {
                    selectedPos = pos;
                    selectChannel(item);
                    showCatchupDialog(item);
                    return true;
                }
                return false;
            });

            holder.itemView.setOnFocusChangeListener((v, hasFocus) -> {
                if (hasFocus) {
                    int pos = holder.getBindingAdapterPosition();
                    if (pos != RecyclerView.NO_POSITION) {
                        selectedPos = pos;
                        selectChannel(item);
                    }
                }
            });

            holder.itemView.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        focusCategoriesList();
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP && holder.getBindingAdapterPosition() == 0) {
                        if (etSearch != null && etSearch.isShown()) {
                            etSearch.requestFocus();
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        if (holder.layoutEpgTimeline != null && holder.layoutEpgTimeline.getVisibility() == View.VISIBLE) {
                            if (holder.tvEpgNow != null && holder.tvEpgNow.isShown()) {
                                holder.tvEpgNow.requestFocus();
                                return true;
                            }
                        }
                    }
                } else if (event.getAction() == KeyEvent.ACTION_UP) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
                        holder.itemView.performClick();
                        return true;
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
            TextView tvNum, tvName, tvRes, tvFavStar, tvReplayBadge, tvEpg;
            ImageView ivLogo;
            View layoutEpgTimeline;
            TextView tvEpgPast, tvEpgNow, tvEpgNext;

            ViewHolder(View v) {
                super(v);
                tvNum = v.findViewById(R.id.tv_channel_num);
                ivLogo = v.findViewById(R.id.iv_channel_logo);
                tvName = v.findViewById(R.id.tv_channel_name);
                tvRes = v.findViewById(R.id.tv_channel_res);
                tvFavStar = v.findViewById(R.id.tv_channel_fav_star);
                tvReplayBadge = v.findViewById(R.id.tv_channel_replay_badge);
                tvEpg = v.findViewById(R.id.tv_channel_epg);
                layoutEpgTimeline = v.findViewById(R.id.layout_epg_timeline);
                tvEpgPast = v.findViewById(R.id.tv_epg_past);
                tvEpgNow = v.findViewById(R.id.tv_epg_now);
                tvEpgNext = v.findViewById(R.id.tv_epg_next);
            }
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if ("search".equals(currentType)) {
                switchSection("live");
                focusActiveSidebarButton();
                return true;
            }
            if (etSearch != null && etSearch.hasFocus()) {
                etSearch.setText("");
                etSearch.clearFocus();
                focusChannelsList();
                return true;
            }
            if (recyclerChannels != null && recyclerChannels.hasFocus()) {
                focusCategoriesList();
                return true;
            }
            if (recyclerCategories != null && recyclerCategories.hasFocus()) {
                focusActiveSidebarButton();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putString("saved_current_type", currentType);
        if (selectedCategory != null) {
            outState.putString("saved_category_id", selectedCategory.id);
        }
        if (activeChannel != null) {
            outState.putString("saved_channel_id", activeChannel.id);
        }
        if (etSearch != null && etSearch.getText() != null) {
            outState.putString("saved_search_query", etSearch.getText().toString());
        } else if (etGlobalSearch != null && etGlobalSearch.getText() != null) {
            outState.putString("saved_search_query", etGlobalSearch.getText().toString());
        }
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        recreate();
    }
}
