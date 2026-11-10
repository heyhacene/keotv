package fr.keo.tv;

import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.GridLayoutManager;
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
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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
    private Button tabSearch;

    // Content containers
    private View layoutContentSplit;
    private View panelSearch;

    // Global Search UI
    private EditText etGlobalSearch;
    private Button btnSearchBackspace;
    private Button btnSearchClear;
    private Button btnSearchFilterAll;
    private Button btnSearchFilterLive;
    private Button btnSearchFilterVod;
    private Button btnSearchFilterSeries;
    private TextView tvSearchResultsCount;
    private RecyclerView recyclerSearchResults;
    private ChannelsAdapter searchResultsAdapter;
    private String globalSearchFilter = "all";
    private boolean isProgrammaticSearch = false;
    private Runnable pendingInputSearchRunnable = null;
    private Runnable pendingTmdbSearchRunnable = null;
    private Runnable backspaceRepeatRunnable = null;
    private EditText activeBackspaceTarget = null;
    private final java.util.concurrent.atomic.AtomicInteger globalSearchGeneration = new java.util.concurrent.atomic.AtomicInteger(0);
    private final Handler searchHandler = new Handler(Looper.getMainLooper());

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
    private final Map<String, List<XtreamClient.EpgProgram>> epgProgramsCache = new ConcurrentHashMap<>();
    private final Map<String, XtreamClient.EpgProgram> epgCurrentProgramCache = new ConcurrentHashMap<>();
    private final Set<String> pendingEpgRequests = Collections.synchronizedSet(new HashSet<>());
    private Runnable epgDebounceRunnable;

    private CategoriesAdapter categoriesAdapter;
    private ChannelsAdapter channelsAdapter;

    // TiviMate Live EPG Hero views
    private ImageView ivLiveHeroLogo;
    private TextView tvLiveHeroRes;
    private TextView tvLiveHeroBadge;
    private TextView tvLiveHeroTitle;
    private TextView tvLiveHeroTime;
    private ProgressBar pbLiveHeroProgress;
    private TextView tvLiveHeroDesc;

    // TiviMate VOD Hero & Grid views
    private View layoutVodHero;
    private View layoutLiveHeader;
    private View panelBouquets;
    private View sidebar;
    private View headerBar;
    private ImageView ivVodHeroBackdrop;
    private TextView tvVodHeroTitle;
    private TextView tvVodHeroQuality;
    private TextView tvVodHeroYear;
    private TextView tvVodHeroDuration;
    private TextView tvVodHeroGenre;
    private TextView tvVodHeroRating;
    private TextView tvVodHeroCast;
    private TextView tvVodHeroDirector;
    private TextView tvVodHeroPlot;
    private TextView tvVodCategoryTitle;
    private TextView tvVodCounter;
    private Button btnVodSearch;
    private Button btnVodBack;

    private boolean isVodGridMode = false;
    private long lastBottomReachedTime = 0;
    private long lastTopReachedTime = 0;
    private long lastCategoryBottomTime = 0;
    private long lastCategoryTopTime = 0;
    private static final long CAROUSEL_PAUSE_MS = 500;
    private final Handler vodHeroHandler = new Handler(Looper.getMainLooper());
    private Runnable pendingVodHeroRunnable = null;
    private final Map<String, JsonObject> vodDetailsCache = new ConcurrentHashMap<>();

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
            if (db != null) {
                db.warmUpSearchIndexAsync();
            }

            // Post-launch: check playlist only after window is attached to avoid BadTokenException
            getWindow().getDecorView().post(() -> {
                if (isFinishing() || isDestroyed()) return;
                try {
                    KeoDatabase.PlaylistItem pl = (db != null) ? db.getActivePlaylist() : null;
                    if (pl != null && pl.serverUrl != null && !pl.serverUrl.isEmpty()) {
                        updateHeaderPlaylistInfo(pl);
                        syncCloudSilently();
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
        tabSearch = findViewById(R.id.tab_search);

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
        btnSearchBackspace = findViewById(R.id.btn_search_backspace);
        btnSearchClear = findViewById(R.id.btn_search_clear);
        btnSearchFilterAll = findViewById(R.id.btn_search_filter_all);
        btnSearchFilterLive = findViewById(R.id.btn_search_filter_live);
        btnSearchFilterVod = findViewById(R.id.btn_search_filter_vod);
        btnSearchFilterSeries = findViewById(R.id.btn_search_filter_series);
        tvSearchResultsCount = findViewById(R.id.tv_search_results_count);
        recyclerSearchResults = findViewById(R.id.recycler_search_results);

        // TiviMate VOD Hero & Bouquet views
        layoutVodHero = findViewById(R.id.layout_vod_hero);
        layoutLiveHeader = findViewById(R.id.layout_live_header);
        panelBouquets = findViewById(R.id.panel_bouquets);
        sidebar = findViewById(R.id.sidebar);
        headerBar = findViewById(R.id.header_bar);

        // TiviMate Live EPG Hero Header views
        ivLiveHeroLogo = findViewById(R.id.iv_live_hero_logo);
        tvLiveHeroRes = findViewById(R.id.tv_live_hero_res);
        tvLiveHeroBadge = findViewById(R.id.tv_live_hero_badge);
        tvLiveHeroTitle = findViewById(R.id.tv_live_hero_title);
        tvLiveHeroTime = findViewById(R.id.tv_live_hero_time);
        pbLiveHeroProgress = findViewById(R.id.pb_live_hero_progress);
        tvLiveHeroDesc = findViewById(R.id.tv_live_hero_desc);

        ivVodHeroBackdrop = findViewById(R.id.iv_vod_hero_backdrop);
        tvVodHeroTitle = findViewById(R.id.tv_vod_hero_title);
        tvVodHeroQuality = findViewById(R.id.tv_vod_hero_quality);
        tvVodHeroYear = findViewById(R.id.tv_vod_hero_year);
        tvVodHeroDuration = findViewById(R.id.tv_vod_hero_duration);
        tvVodHeroGenre = findViewById(R.id.tv_vod_hero_genre);
        tvVodHeroRating = findViewById(R.id.tv_vod_hero_rating);
        tvVodHeroCast = findViewById(R.id.tv_vod_hero_cast);
        tvVodHeroDirector = findViewById(R.id.tv_vod_hero_director);
        tvVodHeroPlot = findViewById(R.id.tv_vod_hero_plot);
        tvVodCategoryTitle = findViewById(R.id.tv_vod_category_title);
        tvVodCounter = findViewById(R.id.tv_vod_counter);
        btnVodSearch = findViewById(R.id.btn_vod_search);
        btnVodBack = findViewById(R.id.btn_vod_back);

        if (btnVodSearch != null) {
            btnVodSearch.setOnClickListener(v -> switchToSearch(""));
        }
        if (btnVodBack != null) {
            btnVodBack.setOnClickListener(v -> exitVodBouquetGrid());
        }

        View.OnKeyListener heroActionKeyListener = (v, keyCode, ev) -> {
            if (ev.getAction() == KeyEvent.ACTION_DOWN) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    focusChannelsList();
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT && v == btnVodSearch) {
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT && v == btnVodBack) {
                    return true;
                }
            }
            return false;
        };
        if (btnVodSearch != null) btnVodSearch.setOnKeyListener(heroActionKeyListener);
        if (btnVodBack != null) btnVodBack.setOnKeyListener(heroActionKeyListener);

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

        View.OnKeyListener headerBtnKeyListener = (v, keyCode, ev) -> {
            if (ev.getAction() == KeyEvent.ACTION_DOWN) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    if ("search".equals(currentType) && etGlobalSearch != null && etGlobalSearch.getVisibility() == View.VISIBLE) {
                        etGlobalSearch.requestFocus();
                    } else if (layoutLiveHeader != null && layoutLiveHeader.getVisibility() == View.VISIBLE && etSearch != null && etSearch.getVisibility() == View.VISIBLE) {
                        etSearch.requestFocus();
                    } else if (channelsAdapter != null && channelsAdapter.getItemCount() > 0 && recyclerChannels != null && recyclerChannels.getVisibility() == View.VISIBLE) {
                        focusChannelsList();
                    } else {
                        focusCategoriesList();
                    }
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT && v == btnSync) {
                    focusActiveSidebarButton();
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT && v == btnLogin) {
                    return true;
                }
            }
            return false;
        };
        if (btnSync != null) btnSync.setOnKeyListener(headerBtnKeyListener);
        if (btnUpdate != null) btnUpdate.setOnKeyListener(headerBtnKeyListener);
        if (btnLogin != null) btnLogin.setOnKeyListener(headerBtnKeyListener);

        // Sidebar Navigation click listeners
        if (btnNavLive != null) btnNavLive.setOnClickListener(v -> switchSection("live"));
        if (btnNavReplay != null) btnNavReplay.setOnClickListener(v -> switchSection("replay"));
        if (btnNavVod != null) btnNavVod.setOnClickListener(v -> switchSection("vod"));
        if (btnNavSeries != null) btnNavSeries.setOnClickListener(v -> switchSection("series"));
        if (btnNavFavs != null) btnNavFavs.setOnClickListener(v -> switchSection("favs"));
        if (btnNavSearch != null) btnNavSearch.setOnClickListener(v -> switchSection("search"));
        if (btnNavSettings != null) btnNavSettings.setOnClickListener(v -> showSettingsDialog());
        if (btnNavSync != null) btnNavSync.setOnClickListener(v -> showCloudSyncDialog());

        // Sidebar D-Pad handler: navigates from sidebar into categories or search; blocks leaking left
        View.OnKeyListener navRightListener = (v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                    if ("search".equals(currentType) && etGlobalSearch != null) {
                        etGlobalSearch.requestFocus();
                    } else {
                        focusCategoriesList();
                    }
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                    return true; // Block escaping left from sidebar
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP && v == btnNavLive) {
                    if (focusHeaderBar()) return true;
                }
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
        if (tabSearch != null) tabSearch.setOnClickListener(v -> switchSection("search"));

        // Global Search setup
        if (etGlobalSearch != null) {
            etGlobalSearch.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                    | android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                    | android.text.InputType.TYPE_TEXT_VARIATION_FILTER);

            etGlobalSearch.addTextChangedListener(new TextWatcher() {
                @Override
                public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

                @Override
                public void onTextChanged(CharSequence s, int start, int before, int count) {
                    if (!isProgrammaticSearch) {
                        final String text = s != null ? s.toString().trim() : "";
                        final boolean isDeletion = before > count;
                        if (pendingInputSearchRunnable != null) {
                            searchHandler.removeCallbacks(pendingInputSearchRunnable);
                            pendingInputSearchRunnable = null;
                        }
                        if (pendingTmdbSearchRunnable != null) {
                            searchHandler.removeCallbacks(pendingTmdbSearchRunnable);
                            pendingTmdbSearchRunnable = null;
                        }
                        globalSearchGeneration.incrementAndGet();
                        if (text.length() < 2) {
                            // Defer UI update slightly so IME continuous key-repeat on backspace is never interrupted by a layout pass
                            pendingInputSearchRunnable = () -> {
                                if (tvSearchResultsCount != null) {
                                    tvSearchResultsCount.setText(text.isEmpty()
                                            ? "Saisissez un texte pour rechercher dans tous les catalogues."
                                            : "Saisissez au moins 2 caractères pour lancer la recherche.");
                                }
                                if (searchResultsAdapter != null) {
                                    searchResultsAdapter.setItems(new ArrayList<>());
                                }
                            };
                            searchHandler.postDelayed(pendingInputSearchRunnable, isDeletion ? 250 : 80);
                            return;
                        }
                        // Use 850ms debounce on deletion (so holding backspace never triggers intermediate searches)
                        // and 300ms on typing for snappy responsiveness.
                        final long delayMs = isDeletion ? 850L : 300L;
                        final boolean allowPersonEnrichment = !isDeletion;
                        pendingInputSearchRunnable = () -> performGlobalSearch(text, globalSearchFilter, null, false, allowPersonEnrichment);
                        searchHandler.postDelayed(pendingInputSearchRunnable, delayMs);
                    }
                }

                @Override
                public void afterTextChanged(Editable s) {}
            });

            etGlobalSearch.setOnEditorActionListener((v, actionId, event) -> {
                if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH
                        || actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                    String q = etGlobalSearch.getText() != null ? etGlobalSearch.getText().toString().trim() : "";
                    performGlobalSearch(q, globalSearchFilter, null, false, true);
                    return true;
                }
                return false;
            });

            etGlobalSearch.setOnKeyListener((v, keyCode, event) -> {
                if (keyCode == KeyEvent.KEYCODE_DEL || keyCode == KeyEvent.KEYCODE_FORWARD_DEL) {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) {
                        if (event.getRepeatCount() == 0) {
                            startContinuousBackspace(etGlobalSearch, 340L);
                        }
                    } else if (event.getAction() == KeyEvent.ACTION_UP) {
                        stopContinuousBackspace();
                    }
                    return false;
                }
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    stopContinuousBackspace();
                    if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                        focusSearchFilterOrInput();
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                        if (focusHeaderBar()) return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        int selEnd = etGlobalSearch.getSelectionEnd();
                        int len = etGlobalSearch.getText() != null ? etGlobalSearch.getText().length() : 0;
                        if (selEnd >= len) {
                            if (btnSearchBackspace != null && btnSearchBackspace.getVisibility() == View.VISIBLE) {
                                btnSearchBackspace.requestFocus();
                                return true;
                            } else if (btnSearchClear != null) {
                                btnSearchClear.requestFocus();
                                return true;
                            }
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        int selStart = etGlobalSearch.getSelectionStart();
                        if (selStart <= 0) {
                            focusActiveSidebarButton();
                            return true;
                        }
                    }
                }
                return false;
            });
        }

        if (btnSearchBackspace != null) {
            btnSearchBackspace.setOnClickListener(v -> {
                deleteOneCharFromEditText(etGlobalSearch);
            });

            btnSearchBackspace.setOnTouchListener((v, event) -> {
                if (event.getAction() == android.view.MotionEvent.ACTION_DOWN) {
                    deleteOneCharFromEditText(etGlobalSearch);
                    startContinuousBackspace(etGlobalSearch, 280L);
                    return true;
                } else if (event.getAction() == android.view.MotionEvent.ACTION_UP
                        || event.getAction() == android.view.MotionEvent.ACTION_CANCEL) {
                    stopContinuousBackspace();
                    return true;
                }
                return false;
            });

            btnSearchBackspace.setOnFocusChangeListener((v, hasFocus) -> {
                if (!hasFocus) stopContinuousBackspace();
            });

            btnSearchBackspace.setOnKeyListener((v, keyCode, event) -> {
                if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) {
                        if (event.getRepeatCount() == 0) {
                            deleteOneCharFromEditText(etGlobalSearch);
                            startContinuousBackspace(etGlobalSearch, 280L);
                        }
                        return true;
                    } else if (event.getAction() == KeyEvent.ACTION_UP) {
                        stopContinuousBackspace();
                        return true;
                    }
                }
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    stopContinuousBackspace();
                    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        if (etGlobalSearch != null) {
                            etGlobalSearch.requestFocus();
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        if (btnSearchClear != null) {
                            btnSearchClear.requestFocus();
                            return true;
                        }
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                        if (focusHeaderBar()) return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                        focusSearchFilterOrInput();
                        return true;
                    }
                }
                return false;
            });
        }

        if (btnSearchClear != null) {
            btnSearchClear.setOnClickListener(v -> {
                stopContinuousBackspace();
                isProgrammaticSearch = true;
                if (etGlobalSearch != null) etGlobalSearch.setText("");
                isProgrammaticSearch = false;
                performGlobalSearch("", globalSearchFilter);
                if (etGlobalSearch != null) etGlobalSearch.requestFocus();
            });

            btnSearchClear.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        if (btnSearchBackspace != null && btnSearchBackspace.getVisibility() == View.VISIBLE) {
                            btnSearchBackspace.requestFocus();
                            return true;
                        } else if (etGlobalSearch != null) {
                            etGlobalSearch.requestFocus();
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                        if (focusHeaderBar()) return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                        focusSearchFilterOrInput();
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        return true;
                    }
                }
                return false;
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

        View.OnKeyListener searchFilterKeyListener = (v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    if (etGlobalSearch != null) {
                        etGlobalSearch.requestFocus();
                        return true;
                    }
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    if (searchResultsAdapter != null && searchResultsAdapter.getItemCount() > 0 && recyclerSearchResults != null) {
                        focusRecyclerViewItem(recyclerSearchResults, 0);
                        return true;
                    }
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                    if (v.getId() == R.id.btn_search_filter_all) {
                        focusActiveSidebarButton();
                        return true;
                    }
                }
            }
            return false;
        };

        if (btnSearchFilterAll != null) {
            btnSearchFilterAll.setOnClickListener(filterListener);
            btnSearchFilterAll.setOnKeyListener(searchFilterKeyListener);
        }
        if (btnSearchFilterLive != null) {
            btnSearchFilterLive.setOnClickListener(filterListener);
            btnSearchFilterLive.setOnKeyListener(searchFilterKeyListener);
        }
        if (btnSearchFilterVod != null) {
            btnSearchFilterVod.setOnClickListener(filterListener);
            btnSearchFilterVod.setOnKeyListener(searchFilterKeyListener);
        }
        if (btnSearchFilterSeries != null) {
            btnSearchFilterSeries.setOnClickListener(filterListener);
            btnSearchFilterSeries.setOnKeyListener(searchFilterKeyListener);
        }

        // Quick in-bouquet search
        if (etSearch != null) {
            etSearch.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                    | android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
                    | android.text.InputType.TYPE_TEXT_VARIATION_FILTER);

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
                if (keyCode == KeyEvent.KEYCODE_DEL || keyCode == KeyEvent.KEYCODE_FORWARD_DEL) {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) {
                        if (event.getRepeatCount() == 0) {
                            startContinuousBackspace(etSearch, 340L);
                        }
                    } else if (event.getAction() == KeyEvent.ACTION_UP) {
                        stopContinuousBackspace();
                    }
                    return false;
                }
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    stopContinuousBackspace();
                    if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                        focusChannelsList();
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        int selStart = etSearch.getSelectionStart();
                        if (selStart <= 0) {
                            focusCategoriesList();
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                        if (focusHeaderBar()) {
                            return true;
                        }
                        if (channelsAdapter != null && channelsAdapter.getItemCount() > 0) {
                            focusRecyclerViewItem(recyclerChannels, channelsAdapter.getItemCount() - 1);
                        }
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        int selEnd = etSearch.getSelectionEnd();
                        int len = etSearch.getText() != null ? etSearch.getText().length() : 0;
                        if (selEnd >= len) {
                            return true;
                        }
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
                    pushAccountsToCloud(false);
                }
            });
        }

        updateSidebarHighlights();
    }

    private void deleteOneCharFromEditText(EditText target) {
        if (target == null) return;
        Editable editable = target.getText();
        if (editable == null || editable.length() == 0) return;
        int selStart = target.getSelectionStart();
        int selEnd = target.getSelectionEnd();
        if (selStart < 0 || selEnd < 0) {
            int len = editable.length();
            editable.delete(len - 1, len);
            target.setSelection(editable.length());
        } else if (selStart != selEnd) {
            int min = Math.min(selStart, selEnd);
            int max = Math.max(selStart, selEnd);
            editable.delete(min, max);
            target.setSelection(min);
        } else if (selStart > 0) {
            editable.delete(selStart - 1, selStart);
            target.setSelection(selStart - 1);
        } else if (editable.length() > 0) {
            int len = editable.length();
            editable.delete(len - 1, len);
            target.setSelection(editable.length());
        }
    }

    private void startContinuousBackspace(final EditText target, long initialDelayMs) {
        stopContinuousBackspace();
        if (target == null) return;
        activeBackspaceTarget = target;
        backspaceRepeatRunnable = new Runnable() {
            @Override
            public void run() {
                if (activeBackspaceTarget == null || isFinishing() || isDestroyed()) return;
                Editable ed = activeBackspaceTarget.getText();
                if (ed == null || ed.length() == 0) {
                    stopContinuousBackspace();
                    return;
                }
                deleteOneCharFromEditText(activeBackspaceTarget);
                searchHandler.postDelayed(this, 60L);
            }
        };
        searchHandler.postDelayed(backspaceRepeatRunnable, initialDelayMs);
    }

    private void stopContinuousBackspace() {
        if (backspaceRepeatRunnable != null) {
            searchHandler.removeCallbacks(backspaceRepeatRunnable);
            backspaceRepeatRunnable = null;
        }
        activeBackspaceTarget = null;
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density + 0.5f);
    }

    private final java.util.concurrent.atomic.AtomicInteger sectionLoadGeneration = new java.util.concurrent.atomic.AtomicInteger(0);
    private final java.util.concurrent.atomic.AtomicInteger categoryLoadGeneration = new java.util.concurrent.atomic.AtomicInteger(0);
    private volatile boolean wantFocusChannelsOnCategoryLoad = false;

    public void switchSection(String section) {
        stopContinuousBackspace();
        currentType = section;
        updateSidebarHighlights();
        sectionLoadGeneration.incrementAndGet();
        categoryLoadGeneration.incrementAndGet();
        mainHandler.removeCallbacks(categoryDebounceRunnable);
        pendingCategoryToLoad = null;
        wantFocusChannelsOnCategoryLoad = false;

        if ("search".equals(section)) {
            exitVodBouquetGrid();
            if (panelSearch != null) panelSearch.setVisibility(View.VISIBLE);
            if (layoutContentSplit != null) layoutContentSplit.setVisibility(View.GONE);
            if (tvSectionTitle != null) tvSectionTitle.setText("🔍 RECHERCHE GLOBALE");
            updateSearchFilterTabs();
            if (etGlobalSearch != null) {
                etGlobalSearch.requestFocus();
            }
            return;
        }

        if (panelSearch != null) panelSearch.setVisibility(View.GONE);
        if (layoutContentSplit != null) layoutContentSplit.setVisibility(View.VISIBLE);
        if (pendingInputSearchRunnable != null) {
            searchHandler.removeCallbacks(pendingInputSearchRunnable);
            pendingInputSearchRunnable = null;
        }
        if (pendingTmdbSearchRunnable != null) {
            searchHandler.removeCallbacks(pendingTmdbSearchRunnable);
            pendingTmdbSearchRunnable = null;
        }
        globalSearchGeneration.incrementAndGet();

        boolean isLandscapeSplit = findViewById(R.id.sidebar) != null;
        boolean isVod = "vod".equals(section) || "series".equals(section);
        int spanCount = isLandscapeSplit ? 5 : 3;

        isVodGridMode = false;
        if (isLandscapeSplit) {
            if (sidebar != null) sidebar.setVisibility(View.VISIBLE);
            if (panelBouquets != null) panelBouquets.setVisibility(View.VISIBLE);
            if (headerBar != null) headerBar.setVisibility(View.VISIBLE);
        }

        // Clear existing items BEFORE changing grid/list mode so Live TV channel logos never flash inside VOD cards
        if (channelsAdapter != null) {
            channelsAdapter.setItems(new ArrayList<>());
        }
        if (categoriesAdapter != null) {
            categoriesAdapter.setItems(new ArrayList<>());
        }

        if (recyclerChannels != null && channelsAdapter != null) {
            channelsAdapter.setVodGridMode(isVod, spanCount);
            if (isVod) {
                recyclerChannels.setLayoutManager(new GridLayoutManager(this, spanCount));
                if (layoutLiveHeader != null) layoutLiveHeader.setVisibility(View.GONE);
                if (layoutVodHero != null) layoutVodHero.setVisibility(View.VISIBLE);
            } else {
                recyclerChannels.setLayoutManager(new LinearLayoutManager(this));
                if (layoutVodHero != null) layoutVodHero.setVisibility(View.GONE);
                if (layoutLiveHeader != null) layoutLiveHeader.setVisibility(View.VISIBLE);
            }
        }

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
        switchToSearch(query, null);
    }

    private void switchToSearch(String query, KeoDatabase.ChannelItem sourceItemToIndex) {
        switchSection("search");
        globalSearchFilter = "all";
        updateSearchFilterTabs();
        isProgrammaticSearch = true;
        if (etGlobalSearch != null) {
            etGlobalSearch.setText(query != null ? query : "");
            if (query != null && !query.isEmpty()) {
                etGlobalSearch.setSelection(query.length());
            }
        }
        isProgrammaticSearch = false;
        boolean isPersonChipClick = (sourceItemToIndex != null) || (query != null && !query.trim().isEmpty());
        performGlobalSearch(query != null ? query : "", "all", sourceItemToIndex, isPersonChipClick, true);
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
        if (tabSearch != null) tabSearch.setSelected("search".equals(currentType));
    }

    private void updateSearchFilterTabs() {
        if (btnSearchFilterAll != null) btnSearchFilterAll.setSelected("all".equals(globalSearchFilter));
        if (btnSearchFilterLive != null) btnSearchFilterLive.setSelected("live".equals(globalSearchFilter));
        if (btnSearchFilterVod != null) btnSearchFilterVod.setSelected("vod".equals(globalSearchFilter));
        if (btnSearchFilterSeries != null) btnSearchFilterSeries.setSelected("series".equals(globalSearchFilter));
    }

    private void performGlobalSearch(String query, String filter) {
        performGlobalSearch(query, filter, null, false, true);
    }

    private void performGlobalSearch(String query, String filter, final KeoDatabase.ChannelItem sourceItemToIndex) {
        performGlobalSearch(query, filter, sourceItemToIndex, sourceItemToIndex != null, true);
    }

    private static final Map<String, JsonObject> tmdbPersonSearchCache = new ConcurrentHashMap<>();
    private static final Map<Integer, JsonObject> tmdbPersonCreditsCache = new ConcurrentHashMap<>();

    private void performGlobalSearch(String query, String filter, final KeoDatabase.ChannelItem sourceItemToIndex, final boolean forcePersonSearch, final boolean allowTmdbPersonEnrichment) {
        final String q = query != null ? query.replace('\u00A0', ' ').trim() : "";
        if (pendingInputSearchRunnable != null) {
            searchHandler.removeCallbacks(pendingInputSearchRunnable);
            pendingInputSearchRunnable = null;
        }
        if (pendingTmdbSearchRunnable != null) {
            searchHandler.removeCallbacks(pendingTmdbSearchRunnable);
            pendingTmdbSearchRunnable = null;
        }
        final int myGen = globalSearchGeneration.incrementAndGet();

        if (q.length() < 2) {
            if (tvSearchResultsCount != null) {
                tvSearchResultsCount.setText(q.isEmpty()
                        ? "Saisissez un texte pour rechercher dans tous les catalogues."
                        : "Saisissez au moins 2 caractères pour lancer la recherche.");
            }
            if (searchResultsAdapter != null) {
                searchResultsAdapter.setItems(new ArrayList<>());
            }
            return;
        }

        if (tvSearchResultsCount != null) {
            tvSearchResultsCount.setText("Recherche en cours pour '" + q + "'...");
        }

        if (sourceItemToIndex != null && sourceItemToIndex.id != null) {
            db.updateChannelMetadataInMemoryOnly(sourceItemToIndex.id, sourceItemToIndex.cast, sourceItemToIndex.director);
            new Thread(() -> {
                try {
                    db.updateChannelMetadata(
                            sourceItemToIndex.id,
                            sourceItemToIndex.cast,
                            sourceItemToIndex.director,
                            sourceItemToIndex.plot,
                            sourceItemToIndex.genre,
                            sourceItemToIndex.releaseDate,
                            sourceItemToIndex.rating
                    );
                } catch (Exception ignored) {}
            }).start();
        }

        new Thread(() -> {
            if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;
            final String streamTypeFilter = "all".equals(filter) ? null : filter;
            final List<KeoDatabase.ChannelItem> results = db.searchChannels(q, streamTypeFilter);
            if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;
            final List<KeoDatabase.ChannelItem> currentResults = new ArrayList<>(results);

            runOnUiThread(() -> {
                if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;
                boolean resultsHadFocus = (recyclerSearchResults != null && recyclerSearchResults.hasFocus());
                if (tvSearchResultsCount != null) {
                    tvSearchResultsCount.setText(currentResults.size() + " résultat(s) trouvé(s) pour '" + q + "'");
                }
                if (searchResultsAdapter != null) {
                    searchResultsAdapter.setItems(new ArrayList<>(currentResults));
                    if (resultsHadFocus && !currentResults.isEmpty()) {
                        focusRecyclerViewItem(recyclerSearchResults, 0);
                    }
                }
            });

            if (allowTmdbPersonEnrichment && q.length() >= 3 && !"live".equals(streamTypeFilter)) {
                enrichSearchResultsWithActorCredits(q, streamTypeFilter, currentResults, myGen, forcePersonSearch);
            }
        }).start();
    }

    private static int extractCreditYear(JsonObject c) {
        if (c == null) return 0;
        String dateStr = "";
        if (c.has("release_date") && !c.get("release_date").isJsonNull()) {
            dateStr = c.get("release_date").getAsString().trim();
        } else if (c.has("first_air_date") && !c.get("first_air_date").isJsonNull()) {
            dateStr = c.get("first_air_date").getAsString().trim();
        }
        if (dateStr.length() >= 4) {
            try {
                int y = Integer.parseInt(dateStr.substring(0, 4));
                if (y >= 1920 && y <= 2035) return y;
            } catch (Exception ignored) {}
        }
        return 0;
    }

    private static boolean hasExcludedGenre(JsonObject c, boolean allowDocumentary) {
        if (c == null || !c.has("genre_ids") || !c.get("genre_ids").isJsonArray()) return false;
        JsonArray gArr = c.getAsJsonArray("genre_ids");
        for (int i = 0; i < gArr.size(); i++) {
            try {
                int gid = gArr.get(i).getAsInt();
                // 10763 = News, 10767 = Talk Show, 10764 = Reality
                if (gid == 10763 || gid == 10767 || gid == 10764) return true;
                // 99 = Documentary
                if (gid == 99 && !allowDocumentary) return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    private static void sortSearchChannelItemsDeterministically(List<KeoDatabase.ChannelItem> items) {
        if (items == null || items.size() <= 1) return;
        final Map<String, String> normCache = new HashMap<>(items.size() * 2);
        final Map<String, Integer> langCache = new HashMap<>(items.size() * 2);
        for (KeoDatabase.ChannelItem item : items) {
            if (item == null || item.id == null) continue;
            String raw = item.name != null ? item.name : "";
            normCache.put(item.id, KeoDatabase.normalizeTitleForMatch(raw));
            String upper = raw.toUpperCase(Locale.ROOT);
            int lp = (upper.contains("FR") || upper.contains("VF") || upper.contains("VO") || upper.contains("MULTI")) ? 0 : 1;
            langCache.put(item.id, lp);
        }
        Collections.sort(items, (a, b) -> {
            boolean aVod = a.streamType != null && ("vod".equalsIgnoreCase(a.streamType) || "series".equalsIgnoreCase(a.streamType));
            boolean bVod = b.streamType != null && ("vod".equalsIgnoreCase(b.streamType) || "series".equalsIgnoreCase(b.streamType));
            if (aVod != bVod) return aVod ? -1 : 1;
            String na = normCache.get(a.id);
            String nb = normCache.get(b.id);
            if (na != null && nb != null) {
                int c = na.compareTo(nb);
                if (c != 0) return c;
            }
            Integer la = langCache.get(a.id);
            Integer lb = langCache.get(b.id);
            if (la != null && lb != null && !la.equals(lb)) {
                return Integer.compare(la, lb);
            }
            String ra = a.name != null ? a.name : "";
            String rb = b.name != null ? b.name : "";
            return ra.compareToIgnoreCase(rb);
        });
    }

    private void enrichSearchResultsWithActorCredits(String query, String streamTypeFilter, List<KeoDatabase.ChannelItem> currentResults, final int myGen, final boolean forcePersonSearch) {
        if (query == null || query.trim().length() < 3) return;
        if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;
        final String q = query.replace('\u00A0', ' ').trim();
        try {
            String qLower = KeoDatabase.stripAccents(q).toLowerCase(Locale.ROOT).trim();
            String qTitleNorm = KeoDatabase.normalizeTitleForMatch(q);

            // Count how many current results matched directly by title (to avoid turning movie searches like "Rambo" into minor crew searches)
            int directTitleMatchCount = 0;
            synchronized (currentResults) {
                for (KeoDatabase.ChannelItem item : currentResults) {
                    if (item == null || item.name == null) continue;
                    String itemNorm = KeoDatabase.normalizeTitleForMatch(item.name);
                    if (itemNorm.equals(qTitleNorm) || itemNorm.startsWith(qTitleNorm + " ")) {
                        directTitleMatchCount++;
                    }
                }
            }

            JsonObject searchObj = tmdbPersonSearchCache.get(qLower);
            if (searchObj == null) {
                String enc = URLEncoder.encode(q, "UTF-8");
                String searchUrl = "https://api.themoviedb.org/3/search/person?api_key=f090bb54758cabf231fb605d3e3e0468&query=" + enc + "&language=fr-FR";
                String searchJson = XtreamClient.fetchTmdbUrl(searchUrl);
                if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;
                searchObj = JsonParser.parseString(searchJson).getAsJsonObject();
                tmdbPersonSearchCache.put(qLower, searchObj);
            }
            if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;
            JsonArray results = searchObj.has("results") && searchObj.get("results").isJsonArray()
                    ? searchObj.getAsJsonArray("results") : null;
            if (results == null || results.size() == 0) return;

            JsonObject bestPerson = null;
            double bestScore = -1.0;
            for (int i = 0; i < Math.min(10, results.size()); i++) {
                JsonObject p = results.get(i).getAsJsonObject();
                String name = p.has("name") && !p.get("name").isJsonNull() ? p.get("name").getAsString() : "";
                String nameNorm = KeoDatabase.stripAccentsLowerFast(name).trim();
                double pop = p.has("popularity") && !p.get("popularity").isJsonNull() ? p.get("popularity").getAsDouble() : 0.0;
                String dept = p.has("known_for_department") && !p.get("known_for_department").isJsonNull() ? p.get("known_for_department").getAsString() : "";
                boolean isActorOrDirector = "Acting".equalsIgnoreCase(dept) || "Directing".equalsIgnoreCase(dept);

                int knownForVotes = 0;
                if (p.has("known_for") && p.get("known_for").isJsonArray()) {
                    JsonArray kf = p.getAsJsonArray("known_for");
                    for (int k = 0; k < kf.size(); k++) {
                        if (kf.get(k).isJsonObject()) {
                            JsonObject kObj = kf.get(k).getAsJsonObject();
                            if (kObj.has("vote_count") && !kObj.get("vote_count").isJsonNull()) {
                                knownForVotes += kObj.get("vote_count").getAsInt();
                            }
                        }
                    }
                }

                boolean exactNameMatch = nameNorm.equals(qLower);
                boolean surnameMatch = nameNorm.endsWith(" " + qLower);
                boolean firstNameMatch = nameNorm.startsWith(qLower + " ");

                if (!forcePersonSearch) {
                    // When the user typed in the search box manually:
                    // 1. Must match full name, surname, or first name
                    if (!exactNameMatch && !surnameMatch && !firstNameMatch) {
                        continue;
                    }
                    // 2. If user typed a single word (not an exact full name), require a genuinely well-known actor/director
                    if (!exactNameMatch) {
                        if (!isActorOrDirector) continue;
                        if (knownForVotes < 2500 && pop < 12.0) continue;
                        // 3. If the query already matches 2+ movie titles directly (e.g. "Rambo", "Rocky"), only enrich if it's a major surname match
                        if (directTitleMatchCount >= 2 && (!surnameMatch || knownForVotes < 15000)) {
                            continue;
                        }
                    }
                }

                double score = knownForVotes + (pop * 20.0);
                if (exactNameMatch) {
                    score += 500000.0;
                } else if (surnameMatch) {
                    score += 25000.0;
                } else if (firstNameMatch) {
                    score += 10000.0;
                }
                if (isActorOrDirector) {
                    score += 2000.0;
                }
                if (score > bestScore && (knownForVotes > 20 || pop > 1.0 || exactNameMatch || forcePersonSearch)) {
                    bestScore = score;
                    bestPerson = p;
                }
            }
            if (bestPerson == null) return;

            int personId = bestPerson.get("id").getAsInt();
            final String personName = bestPerson.has("name") ? bestPerson.get("name").getAsString() : q;
            final String personNameNorm = KeoDatabase.stripAccentsLowerFast(personName).trim();
            final boolean isExactPersonQuery = forcePersonSearch || personNameNorm.equals(qLower);
            final String[] personTokens = personNameNorm.split("\\s+");
            final String personSurname = personTokens.length > 1 ? personTokens[personTokens.length - 1] : personNameNorm;
            final String knownDept = bestPerson.has("known_for_department") ? bestPerson.get("known_for_department").getAsString() : "Acting";
            final boolean isDirector = "Directing".equalsIgnoreCase(knownDept);

            JsonObject creditsObj = tmdbPersonCreditsCache.get(personId);
            if (creditsObj == null) {
                String creditsUrl = "https://api.themoviedb.org/3/person/" + personId + "/combined_credits?api_key=f090bb54758cabf231fb605d3e3e0468&language=fr-FR";
                String creditsJson = XtreamClient.fetchTmdbUrl(creditsUrl);
                if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;
                creditsObj = JsonParser.parseString(creditsJson).getAsJsonObject();
                tmdbPersonCreditsCache.put(personId, creditsObj);
            }
            if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;

            List<String> titles = new ArrayList<>(600);
            Set<String> seenTitleStrings = new HashSet<>(600);
            Map<String, Set<Integer>> normTitleYears = new HashMap<>(600);
            final java.util.Set<String> directorTitles = new java.util.HashSet<>();
            final java.util.Set<String> actorTitles = new java.util.HashSet<>();

            if (creditsObj.has("crew") && creditsObj.get("crew").isJsonArray()) {
                JsonArray crewArr = creditsObj.getAsJsonArray("crew");
                List<JsonObject> dirCredits = new ArrayList<>();
                for (int i = 0; i < crewArr.size(); i++) {
                    JsonObject c = crewArr.get(i).getAsJsonObject();
                    String job = c.has("job") && !c.get("job").isJsonNull() ? c.get("job").getAsString() : "";
                    String dept = c.has("department") && !c.get("department").isJsonNull() ? c.get("department").getAsString() : "";
                    int voteCount = c.has("vote_count") && !c.get("vote_count").isJsonNull() ? c.get("vote_count").getAsInt() : 0;
                    if (("Director".equalsIgnoreCase(job) || "Directing".equalsIgnoreCase(dept)) && voteCount >= 5) {
                        if (!hasExcludedGenre(c, true)) {
                            dirCredits.add(c);
                        }
                    }
                }
                Collections.sort(dirCredits, (a, b) -> {
                    int va = a.has("vote_count") && !a.get("vote_count").isJsonNull() ? a.get("vote_count").getAsInt() : 0;
                    int vb = b.has("vote_count") && !b.get("vote_count").isJsonNull() ? b.get("vote_count").getAsInt() : 0;
                    return Integer.compare(vb, va);
                });
                for (JsonObject c : dirCredits) {
                    int creditYear = extractCreditYear(c);
                    List<String> cur = new ArrayList<>();
                    collectTitlesFromCredit(cur, c);
                    for (String t : cur) {
                        String norm = KeoDatabase.normalizeTitleForMatch(t);
                        if (!norm.isEmpty()) directorTitles.add(norm);
                        if (creditYear > 0) KeoDatabase.registerTitleYear(normTitleYears, t, creditYear);
                        if (seenTitleStrings.add(t)) titles.add(t);
                    }
                }
            }

            if (creditsObj.has("cast") && creditsObj.get("cast").isJsonArray()) {
                JsonArray castArr = creditsObj.getAsJsonArray("cast");
                List<JsonObject> castCredits = new ArrayList<>();
                for (int i = 0; i < castArr.size(); i++) {
                    JsonObject c = castArr.get(i).getAsJsonObject();
                    String character = c.has("character") && !c.get("character").isJsonNull() ? c.get("character").getAsString().trim() : "";
                    String charLower = character.toLowerCase(Locale.ROOT);
                    String mediaType = c.has("media_type") && !c.get("media_type").isJsonNull() ? c.get("media_type").getAsString() : "";
                    int voteCount = c.has("vote_count") && !c.get("vote_count").isJsonNull() ? c.get("vote_count").getAsInt() : 0;
                    int episodeCount = c.has("episode_count") && !c.get("episode_count").isJsonNull() ? c.get("episode_count").getAsInt() : 99;

                    String tFr = c.has("title") && !c.get("title").isJsonNull() ? c.get("title").getAsString()
                            : (c.has("name") && !c.get("name").isJsonNull() ? c.get("name").getAsString() : "");
                    String tNorm = KeoDatabase.stripAccents(tFr).toLowerCase(Locale.ROOT);
                    boolean hasPersonSurnameInTitle = personSurname.length() >= 4 && tNorm.contains(personSurname);

                    if (charLower.contains("uncredited") || charLower.contains("non crédité") || charLower.contains("non credite")
                            || charLower.contains("archive")) {
                        continue;
                    }
                    // Skip talk shows, news, reality, and documentaries (unless the documentary title is about the person)
                    if (hasExcludedGenre(c, hasPersonSurnameInTitle)) {
                        continue;
                    }
                    // Skip TV guest appearances (< 5 episodes or < 20 votes)
                    if ("tv".equalsIgnoreCase(mediaType) && (episodeCount < 5 || voteCount < 20)) {
                        continue;
                    }
                    // Skip obscure movies/shorts with < 18 votes
                    if ("movie".equalsIgnoreCase(mediaType) && voteCount < 18 && !hasPersonSurnameInTitle) {
                        continue;
                    }
                    if (charLower.equals("self") || charLower.startsWith("self ") || charLower.startsWith("self-")
                            || charLower.contains("himself") || charLower.contains("herself")
                            || charLower.contains("lui-même") || charLower.contains("lui-meme")
                            || charLower.contains("elle-même") || charLower.contains("elle-meme")
                            || charLower.equals("host") || charLower.equals("guest")) {
                        if (!hasPersonSurnameInTitle) {
                            continue;
                        }
                    }
                    castCredits.add(c);
                }
                Collections.sort(castCredits, (a, b) -> {
                    int va = a.has("vote_count") && !a.get("vote_count").isJsonNull() ? a.get("vote_count").getAsInt() : 0;
                    int vb = b.has("vote_count") && !b.get("vote_count").isJsonNull() ? b.get("vote_count").getAsInt() : 0;
                    return Integer.compare(vb, va);
                });
                // Process ALL legitimate acting credits with year validation
                for (JsonObject c : castCredits) {
                    int creditYear = extractCreditYear(c);
                    List<String> cur = new ArrayList<>();
                    collectTitlesFromCredit(cur, c);
                    for (String t : cur) {
                        String norm = KeoDatabase.normalizeTitleForMatch(t);
                        if (!norm.isEmpty()) actorTitles.add(norm);
                        if (creditYear > 0) KeoDatabase.registerTitleYear(normTitleYears, t, creditYear);
                        if (seenTitleStrings.add(t)) titles.add(t);
                    }
                }
            }

            if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;

            // Combine:
            // 1) Local person search by resolved full personName
            // 2) Full in-memory catalog title + year search across all TMDB credits
            List<KeoDatabase.ChannelItem> personDbChannels = db.searchChannelsByPersonName(personName, streamTypeFilter);
            if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;
            List<KeoDatabase.ChannelItem> creditChannels = titles.isEmpty()
                    ? new ArrayList<>()
                    : db.searchChannelsByTitles(titles, normTitleYears, streamTypeFilter);
            if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;

            java.util.Set<String> existingIds = new java.util.HashSet<>();
            final List<KeoDatabase.ChannelItem> mergedResults = new ArrayList<>();
            // Only keep Step-1 results if this wasn't a specific person search (to discard partial title noise)
            if (!isExactPersonQuery) {
                synchronized (currentResults) {
                    for (KeoDatabase.ChannelItem item : currentResults) {
                        if (item != null && item.id != null && existingIds.add(item.id)) {
                            mergedResults.add(item);
                        }
                    }
                }
            }

            for (KeoDatabase.ChannelItem pItem : personDbChannels) {
                if (pItem != null && pItem.id != null && existingIds.add(pItem.id)) {
                    mergedResults.add(pItem);
                }
            }

            List<KeoDatabase.ChannelItem> directedBatch = new ArrayList<>();
            List<KeoDatabase.ChannelItem> actedBatch = new ArrayList<>();

            for (KeoDatabase.ChannelItem newItem : creditChannels) {
                if (newItem == null || newItem.id == null) continue;
                if (existingIds.add(newItem.id)) {
                    mergedResults.add(newItem);
                }
                String normItem = KeoDatabase.normalizeTitleForMatch(newItem.name);
                boolean isTitleDirected = directorTitles.contains(normItem) || (isDirector && !actorTitles.contains(normItem));
                boolean isTitleActed = actorTitles.contains(normItem) || (!isDirector && !directorTitles.contains(normItem));
                if (isTitleDirected) directedBatch.add(newItem);
                if (isTitleActed) actedBatch.add(newItem);
            }

            if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;

            sortSearchChannelItemsDeterministically(mergedResults);
            synchronized (currentResults) {
                currentResults.clear();
                currentResults.addAll(mergedResults);
            }

            if (myGen == globalSearchGeneration.get() && "search".equals(currentType)) {
                final int totalCount = mergedResults.size();
                final String roleLabel = (!directorTitles.isEmpty() && isDirector) ? "réalisateur" : "filmographie complète";
                runOnUiThread(() -> {
                    if (myGen != globalSearchGeneration.get() || !"search".equals(currentType)) return;
                    boolean resultsHadFocus = (recyclerSearchResults != null && recyclerSearchResults.hasFocus());
                    String prevFocusedId = (resultsHadFocus && activeChannel != null) ? activeChannel.id : null;
                    int prevPos = searchResultsAdapter != null ? searchResultsAdapter.getSelectedPos() : 0;

                    if (tvSearchResultsCount != null) {
                        tvSearchResultsCount.setText(totalCount + " résultat(s) pour '" + personName + "' (" + roleLabel + ")");
                    }
                    if (searchResultsAdapter != null) {
                        searchResultsAdapter.setItems(new ArrayList<>(mergedResults));
                        if (resultsHadFocus && !mergedResults.isEmpty()) {
                            int targetIdx = Math.max(0, Math.min(prevPos, mergedResults.size() - 1));
                            if (prevFocusedId != null) {
                                for (int i = 0; i < mergedResults.size(); i++) {
                                    if (prevFocusedId.equals(mergedResults.get(i).id)) {
                                        targetIdx = i;
                                        break;
                                    }
                                }
                            }
                            searchResultsAdapter.setSelectedPos(targetIdx);
                            focusRecyclerViewItem(recyclerSearchResults, targetIdx);
                        }
                    }
                });
            }

            // Persist person indexing in background AFTER UI is already updated!
            if (!directedBatch.isEmpty()) {
                db.indexPersonForChannels(directedBatch, personName, true, false);
            }
            if (!actedBatch.isEmpty()) {
                db.indexPersonForChannels(actedBatch, personName, false, true);
            }
        } catch (Exception e) {
            Log.e(TAG, "enrichSearchResultsWithActorCredits error: " + e.getMessage());
        }
    }

    private void collectTitlesFromCredit(List<String> titles, JsonObject c) {
        if (c.has("title") && !c.get("title").isJsonNull()) {
            addTitleVariants(titles, c.get("title").getAsString());
        }
        if (c.has("original_title") && !c.get("original_title").isJsonNull()) {
            addTitleVariants(titles, c.get("original_title").getAsString());
        }
        if (c.has("name") && !c.get("name").isJsonNull()) {
            addTitleVariants(titles, c.get("name").getAsString());
        }
        if (c.has("original_name") && !c.get("original_name").isJsonNull()) {
            addTitleVariants(titles, c.get("original_name").getAsString());
        }
    }

    private void addTitleVariants(List<String> list, String title) {
        if (title == null) return;
        String t = title.replace('\u00A0', ' ').replace('\u202F', ' ').replace('\u2007', ' ').trim();
        if (t.length() < 3) return;
        if (t.matches("^\\d+$")) return;
        if (!list.contains(t)) list.add(t);

        String noDots = t.replace(".", "").trim();
        if (!noDots.equals(t) && noDots.length() >= 3 && !list.contains(noDots)) {
            list.add(noDots);
        }

        String unacc = KeoDatabase.stripAccents(t);
        if (!unacc.equals(t) && unacc.length() >= 3 && !list.contains(unacc)) {
            list.add(unacc);
        }

        // Only split subtitles on ':' or whitespace-surrounded dash (' - ', ' – ', ' — '), NEVER on hyphens inside words ("Camping-Car", "Au-delà")
        String[] parts = KeoDatabase.splitSubtitleFast(t);
        if (parts != null && parts.length > 0) {
            String base = parts[0].trim();
            if (base.length() >= 4 && !base.matches("^\\d+$") && !list.contains(base)) {
                list.add(base);
                String baseUnacc = KeoDatabase.stripAccents(base);
                if (!baseUnacc.equals(base) && !list.contains(baseUnacc)) {
                    list.add(baseUnacc);
                }
            }
        }

        String lower = t.toLowerCase(Locale.ROOT);
        String stripped = null;
        if (lower.startsWith("le ") || lower.startsWith("la ") || lower.startsWith("un ")) {
            stripped = t.substring(3).trim();
        } else if (lower.startsWith("les ") || lower.startsWith("the ") || lower.startsWith("des ")) {
            stripped = t.substring(4).trim();
        } else if (lower.startsWith("l'") || lower.startsWith("d'")) {
            stripped = t.substring(2).trim();
        } else if (lower.startsWith("une ")) {
            stripped = t.substring(4).trim();
        }
        if (stripped != null && stripped.length() >= 6 && !list.contains(stripped)) {
            list.add(stripped);
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

        boolean isVod = "vod".equals(currentType) || "series".equals(currentType);
        int spanCount = isLandscapeSplit ? 5 : 3;
        if (isVod) {
            recyclerChannels.setLayoutManager(new GridLayoutManager(this, spanCount));
        } else {
            recyclerChannels.setLayoutManager(new LinearLayoutManager(this));
        }
        recyclerChannels.setNestedScrollingEnabled(true);
        recyclerChannels.setOverScrollMode(View.OVER_SCROLL_ALWAYS);
        channelsAdapter = new ChannelsAdapter();
        channelsAdapter.setVodGridMode(isVod, spanCount);
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

        // Fast-path: if the view is already attached, visible, and no layout pass is pending from notifyDataSetChanged(), focus immediately!
        View directView = lm.findViewByPosition(targetPos);
        if (directView != null && !rv.isLayoutRequested()) {
            directView.requestFocus();
            return;
        }
        if (directView != null) {
            directView.requestFocus();
        }

        // View is off-screen or RecyclerView is re-laying out after setItems(): scroll and request focus once laid out
        rv.scrollToPosition(targetPos);
        rv.post(() -> {
            View view = lm.findViewByPosition(targetPos);
            if (view != null) {
                view.requestFocus();
            } else {
                RecyclerView.ViewHolder vh = rv.findViewHolderForAdapterPosition(targetPos);
                if (vh != null && vh.itemView != null) {
                    vh.itemView.requestFocus();
                } else {
                    rv.postDelayed(() -> {
                        View view2 = lm.findViewByPosition(targetPos);
                        if (view2 != null) {
                            view2.requestFocus();
                        } else {
                            RecyclerView.ViewHolder vh2 = rv.findViewHolderForAdapterPosition(targetPos);
                            if (vh2 != null && vh2.itemView != null) {
                                vh2.itemView.requestFocus();
                            }
                        }
                    }, 30);
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

    private boolean focusHeaderBar() {
        if (headerBar != null && headerBar.getVisibility() == View.VISIBLE) {
            View btnSync = findViewById(R.id.btn_header_sync);
            if (btnSync != null && btnSync.getVisibility() == View.VISIBLE) {
                btnSync.requestFocus();
                return true;
            }
            View btnUpdate = findViewById(R.id.btn_header_update);
            if (btnUpdate != null && btnUpdate.getVisibility() == View.VISIBLE) {
                btnUpdate.requestFocus();
                return true;
            }
            View btnLogin = findViewById(R.id.btn_header_login);
            if (btnLogin != null && btnLogin.getVisibility() == View.VISIBLE) {
                btnLogin.requestFocus();
                return true;
            }
        }
        return false;
    }

    private void focusSearchFilterOrInput() {
        if ("all".equals(globalSearchFilter) && btnSearchFilterAll != null && btnSearchFilterAll.getVisibility() == View.VISIBLE) {
            btnSearchFilterAll.requestFocus();
        } else if ("live".equals(globalSearchFilter) && btnSearchFilterLive != null && btnSearchFilterLive.getVisibility() == View.VISIBLE) {
            btnSearchFilterLive.requestFocus();
        } else if ("vod".equals(globalSearchFilter) && btnSearchFilterVod != null && btnSearchFilterVod.getVisibility() == View.VISIBLE) {
            btnSearchFilterVod.requestFocus();
        } else if ("series".equals(globalSearchFilter) && btnSearchFilterSeries != null && btnSearchFilterSeries.getVisibility() == View.VISIBLE) {
            btnSearchFilterSeries.requestFocus();
        } else if (btnSearchFilterAll != null && btnSearchFilterAll.getVisibility() == View.VISIBLE) {
            btnSearchFilterAll.requestFocus();
        } else if (etGlobalSearch != null && etGlobalSearch.getVisibility() == View.VISIBLE) {
            etGlobalSearch.requestFocus();
        }
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

    private void enterVodBouquetGrid(boolean requestFocus) {
        // Keep the 3-pane layout 100% stable (never hide sidebar/panelBouquets/headerBar or trigger notifyDataSetChanged!)
        isVodGridMode = false;
        if (layoutLiveHeader != null) layoutLiveHeader.setVisibility(View.GONE);
        if (layoutVodHero != null) layoutVodHero.setVisibility(View.VISIBLE);

        if (tvVodCategoryTitle != null && selectedCategory != null) {
            tvVodCategoryTitle.setText(selectedCategory.name.toUpperCase());
        }

        if (channelsAdapter != null && channelsAdapter.getItemCount() > 0) {
            int pos = channelsAdapter.getSelectedPos();
            if (pos >= 0 && pos < channelsAdapter.getItemCount()) {
                updateVodHeroBanner(channelsAdapter.getItems().get(pos), pos, channelsAdapter.getItemCount());
            }
        }

        if (requestFocus) {
            if (pendingCategoryToLoad != null) {
                KeoDatabase.CategoryItem cat = pendingCategoryToLoad;
                pendingCategoryToLoad = null;
                mainHandler.removeCallbacks(categoryDebounceRunnable);
                wantFocusChannelsOnCategoryLoad = true;
                selectCategory(cat);
            } else if (channelsAdapter != null && channelsAdapter.getItemCount() > 0) {
                focusChannelsList();
            } else {
                wantFocusChannelsOnCategoryLoad = true;
            }
        }
    }

    private void exitVodBouquetGrid() {
        isVodGridMode = false;
        boolean isLandscapeSplit = findViewById(R.id.sidebar) != null;
        if (isLandscapeSplit) {
            if (sidebar != null) sidebar.setVisibility(View.VISIBLE);
            if (panelBouquets != null) panelBouquets.setVisibility(View.VISIBLE);
            if (headerBar != null) headerBar.setVisibility(View.VISIBLE);
        }
        boolean isVod = "vod".equals(currentType) || "series".equals(currentType);
        if (layoutVodHero != null) layoutVodHero.setVisibility(isVod ? View.VISIBLE : View.GONE);
        if ("live".equals(currentType) || "replay".equals(currentType)) {
            if (layoutLiveHeader != null) layoutLiveHeader.setVisibility(View.VISIBLE);
        }
        focusCategoriesList();
    }

    private void updateVodHeroBanner(KeoDatabase.ChannelItem item, int position, int totalCount) {
        if (item == null) return;

        // Counter: e.g. "2 / 693"
        if (tvVodCounter != null) {
            tvVodCounter.setText((position + 1) + " / " + totalCount);
        }

        // Bouquet name
        if (tvVodCategoryTitle != null) {
            if (selectedCategory != null && selectedCategory.name != null) {
                tvVodCategoryTitle.setText(selectedCategory.name.toUpperCase());
            } else if (item.groupName != null) {
                tvVodCategoryTitle.setText(item.groupName.toUpperCase());
            }
        }

        // Title
        if (tvVodHeroTitle != null) {
            tvVodHeroTitle.setText(item.name != null ? item.name : "");
        }

        // Quality
        if (tvVodHeroQuality != null) {
            tvVodHeroQuality.setText(item.resolution != null && !item.resolution.isEmpty() ? item.resolution : "HD");
        }

        // Year
        if (tvVodHeroYear != null) {
            String year = "";
            if (item.releaseDate != null && !item.releaseDate.isEmpty()) {
                year = item.releaseDate;
            }
            tvVodHeroYear.setText(year);
            tvVodHeroYear.setVisibility(year.isEmpty() ? View.GONE : View.VISIBLE);
        }

        // Genre
        if (tvVodHeroGenre != null) {
            if (item.genre != null && !item.genre.isEmpty()) {
                tvVodHeroGenre.setText(" • " + item.genre);
                tvVodHeroGenre.setVisibility(View.VISIBLE);
            } else {
                tvVodHeroGenre.setVisibility(View.GONE);
            }
        }

        // Duration reset
        if (tvVodHeroDuration != null) {
            tvVodHeroDuration.setText("");
            tvVodHeroDuration.setVisibility(View.GONE);
        }

        // Rating
        if (tvVodHeroRating != null) {
            if (item.rating != null && !item.rating.isEmpty()) {
                tvVodHeroRating.setText(" • ⭐ " + item.rating);
                tvVodHeroRating.setVisibility(View.VISIBLE);
            } else {
                tvVodHeroRating.setVisibility(View.GONE);
            }
        }

        // Cast
        if (tvVodHeroCast != null) {
            if (item.cast != null && !item.cast.isEmpty()) {
                tvVodHeroCast.setText("Cast: " + item.cast);
                tvVodHeroCast.setVisibility(View.VISIBLE);
            } else {
                tvVodHeroCast.setVisibility(View.GONE);
            }
        }

        // Director
        if (tvVodHeroDirector != null) {
            if (item.director != null && !item.director.isEmpty()) {
                tvVodHeroDirector.setText("Director: " + item.director);
                tvVodHeroDirector.setVisibility(View.VISIBLE);
            } else {
                tvVodHeroDirector.setVisibility(View.GONE);
            }
        }

        // Plot
        if (tvVodHeroPlot != null) {
            if (item.plot != null && !item.plot.isEmpty()) {
                tvVodHeroPlot.setText(item.plot);
                tvVodHeroPlot.setVisibility(View.VISIBLE);
            } else {
                tvVodHeroPlot.setText("");
                tvVodHeroPlot.setVisibility(View.GONE);
            }
        }

        // Backdrop Image
        if (ivVodHeroBackdrop != null) {
            if (item.logo != null && !item.logo.isEmpty()) {
                ivVodHeroBackdrop.setVisibility(View.VISIBLE);
                ImageLoader.load(this, item.logo, ivVodHeroBackdrop);
            } else {
                ivVodHeroBackdrop.setVisibility(View.GONE);
            }
        }

        // Async enrichment for duration and missing plot
        if (pendingVodHeroRunnable != null) {
            vodHeroHandler.removeCallbacks(pendingVodHeroRunnable);
        }

        final KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl != null && pl.serverUrl != null && !pl.serverUrl.isEmpty() && "vod".equals(item.streamType)) {
            JsonObject cachedInfo = vodDetailsCache.get(item.id);
            if (cachedInfo != null) {
                applyVodHeroExtraInfo(item, cachedInfo);
            } else {
                pendingVodHeroRunnable = () -> {
                    xtreamClient.fetchVodInfo(pl.serverUrl, pl.username, pl.password, item.id, new XtreamClient.VodInfoCallback() {
                        @Override
                        public void onSuccess(JsonObject info, JsonObject movieData) {
                            if (isFinishing() || isDestroyed()) return;
                            vodDetailsCache.put(item.id, info);
                            runOnUiThread(() -> applyVodHeroExtraInfo(item, info));
                        }

                        @Override
                        public void onError(String error) {
                            // Silent fallback
                        }
                    });
                };
                vodHeroHandler.postDelayed(pendingVodHeroRunnable, 250);
            }
        }
    }

    private void applyVodHeroExtraInfo(KeoDatabase.ChannelItem item, JsonObject info) {
        if (info == null) return;
        try {
            if (info.has("duration_secs") && !info.get("duration_secs").isJsonNull()) {
                try {
                    int secs = Integer.parseInt(info.get("duration_secs").getAsString());
                    int hours = secs / 3600;
                    int mins = (secs % 3600) / 60;
                    if (tvVodHeroDuration != null) {
                        tvVodHeroDuration.setText(" • " + (hours > 0 ? hours + "h " : "") + mins + "m");
                        tvVodHeroDuration.setVisibility(View.VISIBLE);
                    }
                } catch (Exception ignored) {}
            }
            if (info.has("plot") && !info.get("plot").isJsonNull() && tvVodHeroPlot != null) {
                String p = info.get("plot").getAsString().trim();
                if (!p.isEmpty()) {
                    tvVodHeroPlot.setText(p);
                    tvVodHeroPlot.setVisibility(View.VISIBLE);
                    item.plot = p;
                }
            }
            if (info.has("cast") && !info.get("cast").isJsonNull() && tvVodHeroCast != null) {
                String c = info.get("cast").getAsString().trim();
                if (!c.isEmpty()) {
                    tvVodHeroCast.setText("Cast: " + c);
                    tvVodHeroCast.setVisibility(View.VISIBLE);
                    item.cast = c;
                }
            }
            if (info.has("director") && !info.get("director").isJsonNull() && tvVodHeroDirector != null) {
                String d = info.get("director").getAsString().trim();
                if (!d.isEmpty()) {
                    tvVodHeroDirector.setText("Director: " + d);
                    tvVodHeroDirector.setVisibility(View.VISIBLE);
                    item.director = d;
                }
            }
        } catch (Throwable ignored) {}
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
        final int mySecGen = sectionLoadGeneration.get();
        final String loadType = currentType;
        new Thread(() -> {
            if (mySecGen != sectionLoadGeneration.get()) return;
            final List<KeoDatabase.CategoryItem> cats;
            SharedPreferences prefs = getSharedPreferences("keotv_prefs", MODE_PRIVATE);
            boolean showFavs = prefs.getBoolean("pref_show_favorites_category", true);
            boolean showForYou = prefs.getBoolean("pref_show_for_you", true);

            if ("replay".equals(loadType)) {
                cats = db.getReplayCategories();
            } else if ("favs".equals(loadType)) {
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
                cats = new ArrayList<>(db.getCategories(loadType, showFavs));
                if (showForYou && "vod".equals(loadType)) {
                    int forYouCount = db.getForYouVodCount();
                    if (forYouCount > 0) {
                        cats.add(0, new KeoDatabase.CategoryItem("cat_vod_for_you", "✨ Pour vous", "vod", forYouCount, -1));
                    }
                } else if (showForYou && "series".equals(loadType)) {
                    int forYouCount = db.getForYouSeriesCount();
                    if (forYouCount > 0) {
                        cats.add(0, new KeoDatabase.CategoryItem("cat_series_for_you", "✨ Pour vous", "series", forYouCount, -1));
                    }
                }
            }

            runOnUiThread(() -> {
                if (mySecGen != sectionLoadGeneration.get() || isFinishing() || isDestroyed()) return;
                View curFocus = getCurrentFocus();
                boolean sidebarHasFocus = (sidebar != null && sidebar.hasFocus());
                boolean hadCatFocus = !sidebarHasFocus && ((recyclerCategories != null && recyclerCategories.hasFocus())
                        || curFocus == null
                        || (panelSearch != null && panelSearch.getVisibility() != View.VISIBLE && panelSearch.hasFocus()));
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
                    if (hadCatFocus) {
                        focusCategoriesList();
                    }
                    selectCategory(targetCat);
                } else {
                    channelsAdapter.setItems(new ArrayList<>());
                    if (tvChannelsHeader != null) {
                        tvChannelsHeader.setText("Aucun élément disponible dans cette section.");
                    }
                    if (hadCatFocus) {
                        focusActiveSidebarButton();
                    }
                }
            });
        }).start();
    }

    private void selectCategory(KeoDatabase.CategoryItem cat) {
        if (cat == null) return;
        selectedCategory = cat;
        final int myCatGen = categoryLoadGeneration.incrementAndGet();
        final String loadType = currentType;
        new Thread(() -> {
            if (myCatGen != categoryLoadGeneration.get()) return;
            List<KeoDatabase.ChannelItem> channelsList = new ArrayList<>();
            try {
                if ("replay".equals(loadType)) {
                    channelsList = db.getReplayChannelsByGroup(cat.id);
                } else if ("cat_vod_for_you".equals(cat.id)) {
                    channelsList = db.getForYouVod(MainActivity.this, 60);
                } else if ("cat_series_for_you".equals(cat.id)) {
                    channelsList = db.getForYouSeries(MainActivity.this, 60);
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
                if (myCatGen != categoryLoadGeneration.get() || isFinishing() || isDestroyed()) return;
                boolean hadChannelFocus = (recyclerChannels != null && recyclerChannels.hasFocus()) || wantFocusChannelsOnCategoryLoad;
                wantFocusChannelsOnCategoryLoad = false;
                channelsAdapter.setItems(channels);
                lastBottomReachedTime = 0;
                lastTopReachedTime = 0;
                if (tvChannelsHeader != null) {
                    tvChannelsHeader.setText(cat.name.toUpperCase() + " (" + channels.size() + ")");
                }
                if (tvVodCategoryTitle != null) {
                    tvVodCategoryTitle.setText(cat.name.toUpperCase());
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
                    if ("vod".equals(currentType) || "series".equals(currentType)) {
                        updateVodHeroBanner(targetCh, channelsAdapter.getSelectedPos(), channels.size());
                    } else {
                        // Prefetch EPG for the selected channel only to keep UI 100% fluid
                        if (!epgProgramsCache.containsKey(targetCh.id)) {
                            fetchEpgForChannel(targetCh);
                        }
                    }
                    if (hadChannelFocus) {
                        focusChannelsList();
                    } else if (getCurrentFocus() == null) {
                        focusCategoriesList();
                    }
                } else {
                    activeChannel = null;
                    if (tvVodCounter != null) tvVodCounter.setText("0 / 0");
                    if (hadChannelFocus || getCurrentFocus() == null) {
                        focusCategoriesList();
                    }
                }
            });
        }).start();
    }

    private void selectChannel(KeoDatabase.ChannelItem ch) {
        activeChannel = ch;
        if (ch == null) return;

        // Clear stale replay program title when switching channels
        PlayerActivity.pendingCurrentProgramTitle = null;
        PlayerActivity.pendingCurrentProgramDesc = null;
        PlayerActivity.pendingCurrentProgramTime = null;
        PlayerActivity.pendingNextProgramTitle = null;

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

        if ("live".equals(ch.streamType) || "replay".equals(ch.streamType) || "live".equals(currentType) || "replay".equals(currentType)) {
            XtreamClient.EpgProgram curProg = epgCurrentProgramCache.get(ch.id);
            updateLiveHeroBanner(ch, curProg, false, true, false);
        }

        // Asynchronously fetch short EPG for live channel with 300ms debounce
        if ("live".equals(ch.streamType) || "replay".equals(ch.streamType) || "live".equals(currentType) || "replay".equals(currentType)) {
            if (epgDebounceRunnable != null) {
                mainHandler.removeCallbacks(epgDebounceRunnable);
            }
            epgDebounceRunnable = () -> fetchEpgForChannel(ch);
            mainHandler.postDelayed(epgDebounceRunnable, 300);
        }
    }

    private void fetchEpgForChannel(final KeoDatabase.ChannelItem ch) {
        if (ch == null || ch.streamId == null || ch.streamId.isEmpty()) return;
        if (pendingEpgRequests.contains(ch.id)) return;
        pendingEpgRequests.add(ch.id);

        KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl == null || pl.serverUrl == null || pl.serverUrl.isEmpty()) {
            pendingEpgRequests.remove(ch.id);
            return;
        }

        XtreamClient.fetchFullChannelTimeline(pl.serverUrl, pl.username, pl.password, ch.streamId, ch.tvArchive == 1, new XtreamClient.EpgCallback() {
            @Override
            public void onSuccess(List<XtreamClient.EpgProgram> programs, XtreamClient.EpgProgram current, XtreamClient.EpgProgram next) {
                pendingEpgRequests.remove(ch.id);
                if (isFinishing() || isDestroyed()) return;
                if (programs != null && !programs.isEmpty()) {
                    epgProgramsCache.put(ch.id, programs);
                }
                if (current != null && current.title != null && !current.title.isEmpty()) {
                    epgCurrentTitleCache.put(ch.id, current.title);
                    epgCurrentProgramCache.put(ch.id, current);
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
                    updateLiveHeroBanner(ch, current, false, true, false);
                }

                if (recyclerChannels != null && channelsAdapter != null) {
                    int pos = channelsAdapter.getPositionForId(ch.id);
                    if (pos != -1) {
                        RecyclerView.ViewHolder vh = recyclerChannels.findViewHolderForAdapterPosition(pos);
                        if (vh instanceof ChannelsAdapter.ViewHolder) {
                            ChannelsAdapter.ViewHolder cvh = (ChannelsAdapter.ViewHolder) vh;
                            if (!cvh.isVod) {
                                boolean wasWaitingPast = cvh.pendingActivatePast;
                                boolean wasWaitingFuture = cvh.pendingActivateFuture;
                                cvh.bindTimeline(ch, programs, current != null ? current.title : ch.name);
                                if (wasWaitingPast) {
                                    cvh.pendingActivatePast = false;
                                    cvh.activateTimelinePast();
                                } else if (wasWaitingFuture) {
                                    cvh.pendingActivateFuture = false;
                                    cvh.activateTimelineFuture();
                                }
                            }
                        }
                    }
                }
            }

            @Override
            public void onError(String error) {
                pendingEpgRequests.remove(ch.id);
                // Silently ignore background EPG failures
            }
        });
    }

    private void updateLiveHeroBanner(KeoDatabase.ChannelItem ch, XtreamClient.EpgProgram prog, boolean isPast, boolean isCurrent, boolean isFuture) {
        if (ch == null) return;

        if (tvChannelsHeader != null) {
            String chNum = "";
            if (channelsAdapter != null) {
                int pos = channelsAdapter.getPositionForId(ch.id);
                if (pos != -1) chNum = (pos + 1) + " • ";
            }
            tvChannelsHeader.setText(chNum + ch.name);
        }

        if (ivLiveHeroLogo != null) {
            if (ch.logo != null && !ch.logo.trim().isEmpty()) {
                ivLiveHeroLogo.setVisibility(View.VISIBLE);
                ImageLoader.load(this, ch.logo, ivLiveHeroLogo);
            } else {
                ivLiveHeroLogo.setVisibility(View.GONE);
            }
        }

        if (tvLiveHeroRes != null) {
            String res = ch.resolution != null && !ch.resolution.isEmpty() ? ch.resolution : "HD";
            tvLiveHeroRes.setText(res);
            tvLiveHeroRes.setVisibility(View.VISIBLE);
        }

        if (tvLiveHeroBadge != null) {
            if (isCurrent) {
                tvLiveHeroBadge.setText("🔴 EN DIRECT");
                tvLiveHeroBadge.setTextColor(0xFF34D399);
                tvLiveHeroBadge.setBackgroundColor(0xFF132E27);
                tvLiveHeroBadge.setVisibility(View.VISIBLE);
            } else if (isPast) {
                if (ch.tvArchive == 1 || "replay".equals(currentType)) {
                    tvLiveHeroBadge.setText("↺ REPLAY DISPONIBLE");
                    tvLiveHeroBadge.setTextColor(0xFF38BDF8);
                    tvLiveHeroBadge.setBackgroundColor(0xFF0F243A);
                } else {
                    tvLiveHeroBadge.setText("DIFFUSÉ");
                    tvLiveHeroBadge.setTextColor(0xFF94A3B8);
                    tvLiveHeroBadge.setBackgroundColor(0xFF1E293B);
                }
                tvLiveHeroBadge.setVisibility(View.VISIBLE);
            } else if (isFuture) {
                tvLiveHeroBadge.setText("⏭️ PROCHAINEMENT");
                tvLiveHeroBadge.setTextColor(0xFF94A3B8);
                tvLiveHeroBadge.setBackgroundColor(0xFF1E293B);
                tvLiveHeroBadge.setVisibility(View.VISIBLE);
            } else {
                tvLiveHeroBadge.setVisibility(View.GONE);
            }
        }

        if (tvLiveHeroTitle != null) {
            String title = (prog != null && prog.title != null && !prog.title.isEmpty()) ? prog.title : ch.name;
            tvLiveHeroTitle.setText(title);
        }

        if (tvLiveHeroTime != null) {
            if (prog != null && prog.getFormattedTime() != null) {
                StringBuilder sb = new StringBuilder(prog.getFormattedTime());
                if (prog.durationMinutes > 0) {
                    sb.append(" • ").append(prog.durationMinutes).append(" min");
                }
                tvLiveHeroTime.setText(sb.toString());
            } else {
                tvLiveHeroTime.setText("");
            }
        }

        if (pbLiveHeroProgress != null) {
            if (isCurrent && prog != null && prog.stopMs > prog.startMs) {
                long now = System.currentTimeMillis();
                long total = prog.stopMs - prog.startMs;
                int pct = (int) Math.max(0, Math.min(100, (now - prog.startMs) * 100 / total));
                pbLiveHeroProgress.setProgress(pct);
                pbLiveHeroProgress.setVisibility(View.VISIBLE);
            } else {
                pbLiveHeroProgress.setVisibility(View.GONE);
            }
        }

        if (tvLiveHeroDesc != null) {
            if (prog != null && prog.desc != null && !prog.desc.trim().isEmpty()) {
                tvLiveHeroDesc.setText(prog.desc);
            } else {
                tvLiveHeroDesc.setText("Naviguez sur la timeline pour explorer les programmes en direct, passés (Replay) et futurs.");
            }
        }
    }

    private void showProgramDetailDialog(KeoDatabase.ChannelItem ch, XtreamClient.EpgProgram prog) {
        if (isFinishing() || isDestroyed() || prog == null) return;
        AlertDialog.Builder builder = new AlertDialog.Builder(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF0F172A);
        int pad = dpToPx(20);
        root.setPadding(pad, pad, pad, pad);

        TextView tvCh = new TextView(this);
        tvCh.setText(ch != null ? "📺 " + ch.name : "Guide TV");
        tvCh.setTextColor(0xFF38BDF8);
        tvCh.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tvCh.setTypeface(null, Typeface.BOLD);
        root.addView(tvCh);

        TextView tvTitle = new TextView(this);
        tvTitle.setText(prog.title != null ? prog.title : "");
        tvTitle.setTextColor(0xFFFFFFFF);
        tvTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        tvTitle.setTypeface(null, Typeface.BOLD);
        tvTitle.setPadding(0, dpToPx(6), 0, 0);
        root.addView(tvTitle);

        TextView tvTime = new TextView(this);
        String timeStr = prog.getFormattedTime();
        if (prog.durationMinutes > 0) timeStr += " • " + prog.durationMinutes + " min";
        tvTime.setText("🕒 " + timeStr);
        tvTime.setTextColor(0xFF94A3B8);
        tvTime.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        tvTime.setPadding(0, dpToPx(4), 0, dpToPx(12));
        root.addView(tvTime);

        ScrollView sv = new ScrollView(this);
        TextView tvDesc = new TextView(this);
        tvDesc.setText(prog.desc != null && !prog.desc.isEmpty() ? prog.desc : "Aucune description détaillée disponible pour ce programme.");
        tvDesc.setTextColor(0xFFCBD5E1);
        tvDesc.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tvDesc.setLineSpacing(dpToPx(2), 1.1f);
        sv.addView(tvDesc);
        LinearLayout.LayoutParams svLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f);
        root.addView(sv, svLp);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END);
        actions.setPadding(0, dpToPx(14), 0, 0);

        Button btnClose = new Button(this);
        btnClose.setText("Fermer");
        btnClose.setTextColor(0xFFFFFFFF);
        btnClose.setBackgroundResource(R.drawable.bg_button_selector);
        btnClose.setFocusable(true);
        actions.addView(btnClose);

        root.addView(actions);

        builder.setView(root);
        AlertDialog dialog = builder.create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }
        btnClose.setOnClickListener(v -> dialog.dismiss());
        dialog.show();
        btnClose.requestFocus();
    }

    private boolean handleCarouselDown(int currentPos, int totalCount, boolean isVod) {
        return handleCarouselDown(recyclerChannels, currentPos, totalCount, isVod);
    }

    private boolean handleCarouselDown(RecyclerView rv, int currentPos, int totalCount, boolean isVod) {
        if (totalCount <= 0) return true;
        lastTopReachedTime = 0;

        RecyclerView targetRv = rv != null ? rv : recyclerChannels;
        int span = 1;
        if (isVod) {
            RecyclerView.LayoutManager lm = targetRv != null ? targetRv.getLayoutManager() : null;
            if (lm instanceof GridLayoutManager) {
                span = ((GridLayoutManager) lm).getSpanCount();
            } else {
                span = (findViewById(R.id.sidebar) != null ? 5 : 3);
            }
        }
        int lastRowStart = isVod ? ((totalCount - 1) - ((totalCount - 1) % span)) : (totalCount - 1);

        if (currentPos < lastRowStart) {
            int nextPos = Math.min(currentPos + span, totalCount - 1);
            lastBottomReachedTime = 0;
            focusRecyclerViewItem(targetRv, nextPos);
            return true; // Strictly consume! Focus must NEVER leak out of channels!
        }

        // In search mode or if targetRv is recyclerSearchResults: stay on last item, do not loop
        if (targetRv == recyclerSearchResults || "search".equals(currentType)) {
            return true;
        }

        // At bottom boundary: pause before wrapping around to top
        long now = System.currentTimeMillis();
        if (lastBottomReachedTime == 0 || (now - lastBottomReachedTime > 1500)) {
            lastBottomReachedTime = now;
            return true; // Pause at bottom boundary
        }
        if (now - lastBottomReachedTime >= CAROUSEL_PAUSE_MS) {
            lastBottomReachedTime = 0;
            int targetPos = isVod ? Math.min(currentPos % span, totalCount - 1) : 0;
            focusRecyclerViewItem(targetRv, targetPos);
        }
        return true;
    }

    private boolean handleCarouselUp(int currentPos, int totalCount, boolean isVod) {
        return handleCarouselUp(recyclerChannels, currentPos, totalCount, isVod);
    }

    private boolean handleCarouselUp(RecyclerView rv, int currentPos, int totalCount, boolean isVod) {
        if (totalCount <= 0) return true;
        lastBottomReachedTime = 0;

        RecyclerView targetRv = rv != null ? rv : recyclerChannels;
        int span = 1;
        if (isVod) {
            RecyclerView.LayoutManager lm = targetRv != null ? targetRv.getLayoutManager() : null;
            if (lm instanceof GridLayoutManager) {
                span = ((GridLayoutManager) lm).getSpanCount();
            } else {
                span = (findViewById(R.id.sidebar) != null ? 5 : 3);
            }
        }

        if (currentPos >= span) {
            int prevPos = Math.max(0, currentPos - span);
            lastTopReachedTime = 0;
            focusRecyclerViewItem(targetRv, prevPos);
            return true; // Strictly consume! Focus must NEVER leak out of channels!
        }

        // If in search mode, pressing UP from top row should focus the active search filter or search input!
        if (targetRv == recyclerSearchResults || "search".equals(currentType)) {
            focusSearchFilterOrInput();
            return true;
        }

        // If in live channels mode and etSearch is visible and reachable, pressing UP from top row focuses etSearch!
        if (!isVod && layoutLiveHeader != null && layoutLiveHeader.getVisibility() == View.VISIBLE && etSearch != null && etSearch.getVisibility() == View.VISIBLE) {
            etSearch.requestFocus();
            return true;
        }

        // Otherwise, pressing UP from the top row reaches the top header / VOD action buttons!
        if (focusHeaderBar()) {
            return true;
        }

        // At top boundary: pause before wrapping around to bottom
        long now = System.currentTimeMillis();
        if (lastTopReachedTime == 0 || (now - lastTopReachedTime > 1500)) {
            lastTopReachedTime = now;
            return true; // Pause at top boundary
        }
        if (now - lastTopReachedTime >= CAROUSEL_PAUSE_MS) {
            lastTopReachedTime = 0;
            int lastRowStart = isVod ? ((totalCount - 1) - ((totalCount - 1) % span)) : (totalCount - 1);
            int targetPos = isVod ? Math.min(lastRowStart + (currentPos % span), totalCount - 1) : (totalCount - 1);
            focusRecyclerViewItem(targetRv, targetPos);
        }
        return true;
    }

    private XtreamClient.EpgProgram getCurrentProgram(KeoDatabase.ChannelItem item) {
        if (item == null) return null;
        XtreamClient.EpgProgram cur = epgCurrentProgramCache.get(item.id);
        if (cur != null) return cur;
        List<XtreamClient.EpgProgram> progs = epgProgramsCache.get(item.id);
        if (progs != null && !progs.isEmpty()) {
            long now = System.currentTimeMillis();
            int closestIdx = -1;
            long closestDiff = Long.MAX_VALUE;
            for (int i = 0; i < progs.size(); i++) {
                XtreamClient.EpgProgram p = progs.get(i);
                if (now >= p.startMs && now <= p.stopMs) {
                    epgCurrentProgramCache.put(item.id, p);
                    return p;
                }
                long diff = Math.abs(now - p.startMs);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestIdx = i;
                }
            }
            if (closestIdx != -1) return progs.get(closestIdx);
        }
        return null;
    }

    private XtreamClient.EpgProgram getPastProgram(KeoDatabase.ChannelItem item) {
        if (item == null) return null;
        List<XtreamClient.EpgProgram> progs = epgProgramsCache.get(item.id);
        if (progs != null && !progs.isEmpty()) {
            long now = System.currentTimeMillis();
            XtreamClient.EpgProgram bestPast = null;
            for (XtreamClient.EpgProgram p : progs) {
                if (p.stopMs <= now) {
                    if (bestPast == null || p.stopMs > bestPast.stopMs) {
                        bestPast = p;
                    }
                }
            }
            return bestPast;
        }
        return null;
    }

    private XtreamClient.EpgProgram getNextProgram(KeoDatabase.ChannelItem item) {
        if (item == null) return null;
        List<XtreamClient.EpgProgram> progs = epgProgramsCache.get(item.id);
        if (progs != null && !progs.isEmpty()) {
            long now = System.currentTimeMillis();
            XtreamClient.EpgProgram bestNext = null;
            for (XtreamClient.EpgProgram p : progs) {
                if (p.startMs >= now) {
                    if (bestNext == null || p.startMs < bestNext.startMs) {
                        bestNext = p;
                    }
                }
            }
            return bestNext;
        }
        return null;
    }

    private boolean handleCategoryCarouselDown(int currentPos, int totalCount) {
        if (totalCount <= 0) return true;
        lastCategoryTopTime = 0;

        if (currentPos < totalCount - 1) {
            lastCategoryBottomTime = 0;
            focusRecyclerViewItem(recyclerCategories, currentPos + 1);
            return true; // Strictly consume! Focus stays firmly in bouquets!
        }

        // At bottom boundary: pause before wrapping around to top
        long now = System.currentTimeMillis();
        if (lastCategoryBottomTime == 0 || (now - lastCategoryBottomTime > 1500)) {
            lastCategoryBottomTime = now;
            return true; // Pause at bottom boundary
        }
        if (now - lastCategoryBottomTime >= CAROUSEL_PAUSE_MS) {
            lastCategoryBottomTime = 0;
            focusRecyclerViewItem(recyclerCategories, 0);
        }
        return true;
    }

    private boolean handleCategoryCarouselUp(int currentPos, int totalCount) {
        if (totalCount <= 0) return true;
        lastCategoryBottomTime = 0;

        if (currentPos > 0) {
            lastCategoryTopTime = 0;
            focusRecyclerViewItem(recyclerCategories, currentPos - 1);
            return true; // Strictly consume! Focus stays firmly in bouquets!
        }

        if (focusHeaderBar()) {
            return true;
        }

        // At top boundary: pause before wrapping around to bottom
        long now = System.currentTimeMillis();
        if (lastCategoryTopTime == 0 || (now - lastCategoryTopTime > 1500)) {
            lastCategoryTopTime = now;
            return true; // Pause at top boundary
        }
        if (now - lastCategoryTopTime >= CAROUSEL_PAUSE_MS) {
            lastCategoryTopTime = 0;
            focusRecyclerViewItem(recyclerCategories, totalCount - 1);
        }
        return true;
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

        List<KeoDatabase.ChannelItem> currentList = "search".equals(currentType) && searchResultsAdapter != null ? searchResultsAdapter.getItems() : channelsAdapter.getItems();
        List<String> urls = new ArrayList<>();
        List<String> titles = new ArrayList<>();
        int startIndex = 0;

        for (int i = 0; i < currentList.size(); i++) {
            KeoDatabase.ChannelItem c = currentList.get(i);
            if (c == null || c.isSeparator) continue;
            if (c.streamUrl == null || c.streamUrl.trim().isEmpty()) continue;
            if ("live".equals(activeChannel.streamType) && !"live".equals(c.streamType)) continue;
            if (c.id != null && c.id.equals(activeChannel.id)) {
                startIndex = urls.size();
            }
            urls.add(c.streamUrl);
            titles.add(c.name != null ? c.name : "");
        }
        if (urls.isEmpty()) {
            urls.add(activeChannel.streamUrl);
            titles.add(activeChannel.name != null ? activeChannel.name : "");
            startIndex = 0;
        }

        PlayerActivity.pendingUrls = urls;
        PlayerActivity.pendingTitles = titles;
        PlayerActivity.pendingIndex = startIndex;
        PlayerActivity.pendingIsLive = !"vod".equals(activeChannel.streamType);
        PlayerActivity.pendingSeriesId = null;
        PlayerActivity.pendingCurrentProgramTitle = null;
        PlayerActivity.pendingCurrentProgramDesc = null;
        PlayerActivity.pendingCurrentProgramTime = null;
        PlayerActivity.pendingNextProgramTitle = null;

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
        populateActorChips(layoutActorsContainer, movieItem != null ? movieItem.director : "", castStr, dialog, movieItem, firstActor);
    }

    private void populateActorChips(LinearLayout layoutActorsContainer, String directorStr, String castStr, AlertDialog dialog, KeoDatabase.ChannelItem movieItem, String[] firstActor) {
        if (layoutActorsContainer == null) return;
        boolean hasDirector = (directorStr != null && !directorStr.trim().isEmpty());
        boolean hasCast = (castStr != null && !castStr.trim().isEmpty());
        if (!hasDirector && !hasCast) return;

        layoutActorsContainer.removeAllViews();

        // 1. Render clickable Director chip(s) first in distinct amber/gold badge style
        if (hasDirector) {
            String[] dirList = directorStr.split("[,;/]");
            int dirAdded = 0;
            for (String rawDir : dirList) {
                final String dirName = rawDir.trim();
                if (dirName.isEmpty()) continue;
                dirAdded++;

                Button dirChip = new Button(MainActivity.this);
                dirChip.setText("🎬 Réal. : " + dirName);
                dirChip.setTextColor(0xFFFDE68A);
                dirChip.setTextSize(11.5f);
                dirChip.setTypeface(Typeface.DEFAULT_BOLD);
                dirChip.setAllCaps(false);
                dirChip.setFocusable(true);
                dirChip.setPadding(dpToPx(12), dpToPx(5), dpToPx(12), dpToPx(5));

                GradientDrawable dirBg = new GradientDrawable();
                dirBg.setColor(0x33F59E0B);
                dirBg.setCornerRadius(dpToPx(14));
                dirBg.setStroke(dpToPx(1), 0xFFF59E0B);
                dirChip.setBackground(dirBg);

                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT, dpToPx(34));
                lp.setMarginEnd(dpToPx(8));
                dirChip.setLayoutParams(lp);

                dirChip.setOnFocusChangeListener((v, hasFocus) -> {
                    GradientDrawable bg = (GradientDrawable) dirChip.getBackground();
                    if (hasFocus) {
                        bg.setColor(0xFFD97706);
                        bg.setStroke(dpToPx(2), Color.WHITE);
                        dirChip.setTextColor(Color.WHITE);
                        dirChip.setScaleX(1.05f);
                        dirChip.setScaleY(1.05f);
                    } else {
                        bg.setColor(0x33F59E0B);
                        bg.setStroke(dpToPx(1), 0xFFF59E0B);
                        dirChip.setTextColor(0xFFFDE68A);
                        dirChip.setScaleX(1.0f);
                        dirChip.setScaleY(1.0f);
                    }
                });

                dirChip.setOnClickListener(v -> {
                    dialog.dismiss();
                    switchToSearch(dirName, movieItem);
                });

                layoutActorsContainer.addView(dirChip);
                if (dirAdded >= 3) break;
            }
        }

        // 2. Render clickable Actor chips right after Director chip(s)
        if (hasCast) {
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
                    switchToSearch(actorName, movieItem);
                });

                layoutActorsContainer.addView(actorChip);
                if (addedCount >= 16) break;
            }
        }
    }

    private void bindDirectorHeaderButton(Button btnDir, TextView tvDir, final String directorStr, final AlertDialog dialog, final KeoDatabase.ChannelItem item) {
        if (directorStr != null && !directorStr.trim().isEmpty()) {
            String[] dirs = directorStr.split("[,;/]");
            final String firstDir = dirs.length > 0 ? dirs[0].trim() : directorStr.trim();
            if (btnDir != null) {
                btnDir.setText("🎬 Réalisateur : " + directorStr.trim());
                btnDir.setVisibility(View.VISIBLE);
                btnDir.setOnClickListener(v -> {
                    dialog.dismiss();
                    switchToSearch(firstDir, item);
                });
                if (tvDir != null) tvDir.setVisibility(View.GONE);
            } else if (tvDir != null) {
                tvDir.setText("Réalisateur : " + directorStr.trim());
                tvDir.setVisibility(View.VISIBLE);
            }
        } else {
            if (btnDir != null) btnDir.setVisibility(View.GONE);
            if (tvDir != null) tvDir.setVisibility(View.GONE);
        }
    }

    private void enrichItemCreditsFromTmdb(final KeoDatabase.ChannelItem item, final AlertDialog dialog,
                                           final Button btnDir, final TextView tvDir,
                                           final LinearLayout layoutActorsContainer, final String[] firstActor) {
        if (item == null || item.name == null) return;
        boolean needDirector = (item.director == null || item.director.trim().isEmpty());
        boolean needCast = (item.cast == null || item.cast.trim().isEmpty());
        if (!needDirector && !needCast) return;

        new Thread(() -> {
            try {
                String cleanTitle = KeoDatabase.extractCleanTitle(item.name);
                if (cleanTitle.length() < 2) return;
                int targetYear = KeoDatabase.extractYear(item.name, item.releaseDate);
                boolean isSeries = "series".equalsIgnoreCase(item.streamType);
                String encTitle = URLEncoder.encode(cleanTitle, "UTF-8");

                int tmdbId = -1;
                if (isSeries) {
                    String searchUrl = "https://api.themoviedb.org/3/search/tv?api_key=f090bb54758cabf231fb605d3e3e0468&query=" + encTitle + "&language=fr-FR";
                    String json = XtreamClient.fetchTmdbUrl(searchUrl);
                    JsonObject obj = JsonParser.parseString(json).getAsJsonObject();
                    JsonArray arr = obj.has("results") && obj.get("results").isJsonArray() ? obj.getAsJsonArray("results") : null;
                    if (arr != null && arr.size() > 0) {
                        tmdbId = pickBestTmdbMatchId(arr, cleanTitle, targetYear);
                    }
                } else {
                    String searchUrl = "https://api.themoviedb.org/3/search/movie?api_key=f090bb54758cabf231fb605d3e3e0468&query=" + encTitle + "&language=fr-FR"
                            + (targetYear > 0 ? "&year=" + targetYear : "");
                    String json = XtreamClient.fetchTmdbUrl(searchUrl);
                    JsonObject obj = JsonParser.parseString(json).getAsJsonObject();
                    JsonArray arr = obj.has("results") && obj.get("results").isJsonArray() ? obj.getAsJsonArray("results") : null;
                    if ((arr == null || arr.size() == 0) && targetYear > 0) {
                        String fallbackUrl = "https://api.themoviedb.org/3/search/movie?api_key=f090bb54758cabf231fb605d3e3e0468&query=" + encTitle + "&language=fr-FR";
                        json = XtreamClient.fetchTmdbUrl(fallbackUrl);
                        obj = JsonParser.parseString(json).getAsJsonObject();
                        arr = obj.has("results") && obj.get("results").isJsonArray() ? obj.getAsJsonArray("results") : null;
                    }
                    if (arr != null && arr.size() > 0) {
                        tmdbId = pickBestTmdbMatchId(arr, cleanTitle, targetYear);
                    }
                }

                if (tmdbId <= 0) return;

                String foundDirector = "";
                String foundCast = "";

                if (isSeries) {
                    String detailUrl = "https://api.themoviedb.org/3/tv/" + tmdbId + "?api_key=f090bb54758cabf231fb605d3e3e0468&append_to_response=credits&language=fr-FR";
                    String detailJson = XtreamClient.fetchTmdbUrl(detailUrl);
                    JsonObject detailObj = JsonParser.parseString(detailJson).getAsJsonObject();
                    List<String> dirs = new ArrayList<>();
                    if (detailObj.has("created_by") && detailObj.get("created_by").isJsonArray()) {
                        JsonArray cb = detailObj.getAsJsonArray("created_by");
                        for (int i = 0; i < Math.min(2, cb.size()); i++) {
                            JsonObject p = cb.get(i).getAsJsonObject();
                            if (p.has("name") && !p.get("name").isJsonNull()) {
                                dirs.add(p.get("name").getAsString().trim());
                            }
                        }
                    }
                    if (detailObj.has("credits") && detailObj.get("credits").isJsonObject()) {
                        JsonObject cred = detailObj.getAsJsonObject("credits");
                        if (dirs.isEmpty() && cred.has("crew") && cred.get("crew").isJsonArray()) {
                            JsonArray crew = cred.getAsJsonArray("crew");
                            for (int i = 0; i < crew.size(); i++) {
                                JsonObject c = crew.get(i).getAsJsonObject();
                                String job = c.has("job") && !c.get("job").isJsonNull() ? c.get("job").getAsString() : "";
                                if ("Director".equalsIgnoreCase(job) || "Series Director".equalsIgnoreCase(job)) {
                                    String n = c.has("name") && !c.get("name").isJsonNull() ? c.get("name").getAsString().trim() : "";
                                    if (!n.isEmpty() && !dirs.contains(n)) dirs.add(n);
                                    if (dirs.size() >= 2) break;
                                }
                            }
                        }
                        if (cred.has("cast") && cred.get("cast").isJsonArray()) {
                            JsonArray castArr = cred.getAsJsonArray("cast");
                            List<String> actors = new ArrayList<>();
                            for (int i = 0; i < Math.min(12, castArr.size()); i++) {
                                JsonObject a = castArr.get(i).getAsJsonObject();
                                if (a.has("name") && !a.get("name").isJsonNull()) {
                                    actors.add(a.get("name").getAsString().trim());
                                }
                            }
                            foundCast = android.text.TextUtils.join(", ", actors);
                        }
                    }
                    foundDirector = android.text.TextUtils.join(", ", dirs);
                } else {
                    String credUrl = "https://api.themoviedb.org/3/movie/" + tmdbId + "/credits?api_key=f090bb54758cabf231fb605d3e3e0468&language=fr-FR";
                    String credJson = XtreamClient.fetchTmdbUrl(credUrl);
                    JsonObject credObj = JsonParser.parseString(credJson).getAsJsonObject();
                    if (credObj.has("crew") && credObj.get("crew").isJsonArray()) {
                        JsonArray crew = credObj.getAsJsonArray("crew");
                        List<String> dirs = new ArrayList<>();
                        for (int i = 0; i < crew.size(); i++) {
                            JsonObject c = crew.get(i).getAsJsonObject();
                            String job = c.has("job") && !c.get("job").isJsonNull() ? c.get("job").getAsString() : "";
                            if ("Director".equalsIgnoreCase(job)) {
                                String n = c.has("name") && !c.get("name").isJsonNull() ? c.get("name").getAsString().trim() : "";
                                if (!n.isEmpty() && !dirs.contains(n)) dirs.add(n);
                                if (dirs.size() >= 2) break;
                            }
                        }
                        foundDirector = android.text.TextUtils.join(", ", dirs);
                    }
                    if (credObj.has("cast") && credObj.get("cast").isJsonArray()) {
                        JsonArray castArr = credObj.getAsJsonArray("cast");
                        List<String> actors = new ArrayList<>();
                        for (int i = 0; i < Math.min(12, castArr.size()); i++) {
                            JsonObject a = castArr.get(i).getAsJsonObject();
                            if (a.has("name") && !a.get("name").isJsonNull()) {
                                actors.add(a.get("name").getAsString().trim());
                            }
                        }
                        foundCast = android.text.TextUtils.join(", ", actors);
                    }
                }

                boolean updated = false;
                if ((item.director == null || item.director.trim().isEmpty()) && !foundDirector.isEmpty()) {
                    item.director = foundDirector;
                    updated = true;
                }
                if ((item.cast == null || item.cast.trim().isEmpty()) && !foundCast.isEmpty()) {
                    item.cast = foundCast;
                    updated = true;
                }
                if (!updated) return;

                db.updateChannelMetadata(item.id, item.cast, item.director, item.plot, item.genre, item.releaseDate, item.rating);

                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed() || dialog == null || !dialog.isShowing()) return;
                    bindDirectorHeaderButton(btnDir, tvDir, item.director, dialog, item);
                    populateActorChips(layoutActorsContainer, item.director, item.cast, dialog, item, firstActor);
                });
            } catch (Exception ignored) {}
        }).start();
    }

    private static int pickBestTmdbMatchId(JsonArray results, String cleanTitle, int targetYear) {
        String targetNorm = KeoDatabase.normalizeTitleForMatch(cleanTitle);
        int bestId = -1;
        int bestScore = Integer.MIN_VALUE;
        for (int i = 0; i < Math.min(8, results.size()); i++) {
            JsonObject r = results.get(i).getAsJsonObject();
            if (!r.has("id") || r.get("id").isJsonNull()) continue;
            int id = r.get("id").getAsInt();
            String t1 = r.has("title") && !r.get("title").isJsonNull() ? r.get("title").getAsString()
                    : (r.has("name") && !r.get("name").isJsonNull() ? r.get("name").getAsString() : "");
            String t2 = r.has("original_title") && !r.get("original_title").isJsonNull() ? r.get("original_title").getAsString()
                    : (r.has("original_name") && !r.get("original_name").isJsonNull() ? r.get("original_name").getAsString() : "");
            String n1 = KeoDatabase.normalizeTitleForMatch(t1);
            String n2 = KeoDatabase.normalizeTitleForMatch(t2);
            int y = extractCreditYear(r);

            int score = 0;
            if (n1.equals(targetNorm) || n2.equals(targetNorm)) {
                score += 500;
            } else if (n1.startsWith(targetNorm) || n2.startsWith(targetNorm)) {
                score += 200;
            }
            if (targetYear > 0 && y > 0) {
                int diff = Math.abs(targetYear - y);
                if (diff == 0) score += 400;
                else if (diff <= 1) score += 250;
                else if (diff <= 2) score += 100;
                else score -= 300;
            }
            score -= (i * 15);
            if (score > bestScore) {
                bestScore = score;
                bestId = id;
            }
        }
        return bestId;
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
            Button btnMovieDirector = view.findViewById(R.id.btn_movie_director);
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
            bindDirectorHeaderButton(btnMovieDirector, tvDirector, movieItem.director, dialog, movieItem);
            if ((movieItem.director != null && !movieItem.director.isEmpty()) || (movieItem.cast != null && !movieItem.cast.isEmpty())) {
                populateActorChips(layoutActorsContainer, movieItem.director, movieItem.cast, dialog, movieItem, firstActor);
            }
            enrichItemCreditsFromTmdb(movieItem, dialog, btnMovieDirector, tvDirector, layoutActorsContainer, firstActor);

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
                        }
                        if (!director.isEmpty()) {
                            movieItem.director = director;
                        }
                        movieItem.genre = genre;
                        movieItem.plot = plot;
                        movieItem.releaseDate = releaseDate;
                        movieItem.rating = rating;

                        bindDirectorHeaderButton(btnMovieDirector, tvDirector, movieItem.director, dialog, movieItem);
                        if ((movieItem.director != null && !movieItem.director.isEmpty()) || (movieItem.cast != null && !movieItem.cast.isEmpty())) {
                            populateActorChips(layoutActorsContainer, movieItem.director, movieItem.cast, dialog, movieItem, firstActor);
                        }
                        enrichItemCreditsFromTmdb(movieItem, dialog, btnMovieDirector, tvDirector, layoutActorsContainer, firstActor);

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
                pushAccountsToCloud(false);
            });

            if (btnSearchActor != null) {
                btnSearchActor.setOnClickListener(v -> {
                    dialog.dismiss();
                    if (!firstActor[0].isEmpty()) {
                        switchToSearch(firstActor[0], movieItem);
                    } else {
                        switchToSearch(tvTitle.getText().toString(), movieItem);
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
            Button btnSeriesDirector = view.findViewById(R.id.btn_series_director);
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
            bindDirectorHeaderButton(btnSeriesDirector, tvDirector, seriesItem.director, dialog, seriesItem);
            if (seriesItem.genre != null && !seriesItem.genre.isEmpty() && tvMeta != null) {
                String meta = (seriesItem.releaseDate != null ? seriesItem.releaseDate + " • " : "") + seriesItem.genre;
                tvMeta.setText(meta);
            }
            if ((seriesItem.director != null && !seriesItem.director.isEmpty()) || (seriesItem.cast != null && !seriesItem.cast.isEmpty())) {
                populateActorChips(layoutActorsContainer, seriesItem.director, seriesItem.cast, dialog, seriesItem, firstActor);
            }
            enrichItemCreditsFromTmdb(seriesItem, dialog, btnSeriesDirector, tvDirector, layoutActorsContainer, firstActor);

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
                    pushAccountsToCloud(false);
                });
            }

            // Search actor / series button
            if (btnSearchActor != null) {
                btnSearchActor.setOnClickListener(v -> {
                    dialog.dismiss();
                    if (firstActor[0] != null && !firstActor[0].isEmpty()) {
                        switchToSearch(firstActor[0], seriesItem);
                    } else {
                        switchToSearch(seriesItem.name, seriesItem);
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

                        if (!cast.isEmpty()) {
                            seriesItem.cast = cast;
                        }
                        if (!director.isEmpty()) {
                            seriesItem.director = director;
                        }
                        seriesItem.genre = genre;
                        seriesItem.plot = plot;
                        seriesItem.releaseDate = releaseDate;
                        seriesItem.rating = rating;

                        bindDirectorHeaderButton(btnSeriesDirector, tvDirector, seriesItem.director, dialog, seriesItem);
                        if (tvMeta != null && (!genre.isEmpty() || !releaseDate.isEmpty())) {
                            tvMeta.setText((!releaseDate.isEmpty() ? releaseDate + " • " : "") + genre);
                        }
                        if ((seriesItem.director != null && !seriesItem.director.isEmpty()) || (seriesItem.cast != null && !seriesItem.cast.isEmpty())) {
                            populateActorChips(layoutActorsContainer, seriesItem.director, seriesItem.cast, dialog, seriesItem, firstActor);
                        }
                        enrichItemCreditsFromTmdb(seriesItem, dialog, btnSeriesDirector, tvDirector, layoutActorsContainer, firstActor);

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
        // Strict guard: Replay is strictly for Linear TV, never for VOD or Series
        if ("vod".equals(ch.streamType) || "series".equals(ch.streamType)) return;

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
            public void onSuccess(final List<XtreamClient.EpgProgram> pastPrograms) {
                if (isFinishing() || isDestroyed()) return;
                if (pastPrograms.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Aucun programme en Replay disponible pour cette chaîne.", Toast.LENGTH_LONG).show();
                    return;
                }

                // Default sort: newest programs first (descending by start time)
                Collections.sort(pastPrograms, (a, b) -> Long.compare(b.startMs, a.startMs));
                final boolean[] isDesc = new boolean[]{true};

                AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this);
                LinearLayout root = new LinearLayout(MainActivity.this);
                root.setOrientation(LinearLayout.VERTICAL);
                root.setPadding(dpToPx(20), dpToPx(16), dpToPx(20), dpToPx(16));
                GradientDrawable rootBg = new GradientDrawable();
                rootBg.setColor(0xFF0F172A);
                rootBg.setCornerRadius(dpToPx(16));
                rootBg.setStroke(dpToPx(1), 0xFF334155);
                root.setBackground(rootBg);

                // Header Layout (Title + Count Badge + Sort Toggle Button)
                LinearLayout header = new LinearLayout(MainActivity.this);
                header.setOrientation(LinearLayout.HORIZONTAL);
                header.setGravity(Gravity.CENTER_VERTICAL);

                TextView tvTitle = new TextView(MainActivity.this);
                tvTitle.setText("🔄 Replay : " + (ch.name != null ? ch.name : "Chaîne TV"));
                tvTitle.setTextSize(16.5f);
                tvTitle.setTypeface(Typeface.DEFAULT_BOLD);
                tvTitle.setTextColor(Color.WHITE);
                header.addView(tvTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

                TextView tvBadge = new TextView(MainActivity.this);
                tvBadge.setText(pastPrograms.size() + " émissions");
                tvBadge.setTextSize(11f);
                tvBadge.setTypeface(Typeface.DEFAULT_BOLD);
                tvBadge.setTextColor(0xFF38BDF8);
                tvBadge.setPadding(dpToPx(8), dpToPx(3), dpToPx(8), dpToPx(3));
                GradientDrawable countBg = new GradientDrawable();
                countBg.setColor(0xFF0C4A6E);
                countBg.setCornerRadius(dpToPx(12));
                countBg.setStroke(dpToPx(1), 0xFF0284C7);
                tvBadge.setBackground(countBg);
                header.addView(tvBadge);

                // Sort toggle button (newest first <-> oldest first)
                final TextView tvSortToggle = new TextView(MainActivity.this);
                tvSortToggle.setText("⇅ Plus récents");
                tvSortToggle.setTextSize(11f);
                tvSortToggle.setTypeface(Typeface.DEFAULT_BOLD);
                tvSortToggle.setTextColor(0xFF38BDF8);
                tvSortToggle.setPadding(dpToPx(10), dpToPx(3), dpToPx(10), dpToPx(3));
                tvSortToggle.setFocusable(true);
                tvSortToggle.setFocusableInTouchMode(true);
                GradientDrawable sortBg = new GradientDrawable();
                sortBg.setColor(0xFF1E293B);
                sortBg.setCornerRadius(dpToPx(12));
                sortBg.setStroke(dpToPx(1), 0xFF0284C7);
                tvSortToggle.setBackground(sortBg);

                LinearLayout.LayoutParams sortLp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                sortLp.setMarginStart(dpToPx(8));
                tvSortToggle.setLayoutParams(sortLp);

                tvSortToggle.setOnFocusChangeListener((v, hasFocus) -> {
                    GradientDrawable d = (GradientDrawable) tvSortToggle.getBackground();
                    if (hasFocus) {
                        d.setColor(0xFF0284C7);
                        d.setStroke(dpToPx(2), Color.WHITE);
                        tvSortToggle.setTextColor(Color.WHITE);
                        tvSortToggle.setScaleX(1.05f);
                        tvSortToggle.setScaleY(1.05f);
                    } else {
                        d.setColor(0xFF1E293B);
                        d.setStroke(dpToPx(1), 0xFF0284C7);
                        tvSortToggle.setTextColor(0xFF38BDF8);
                        tvSortToggle.setScaleX(1.0f);
                        tvSortToggle.setScaleY(1.0f);
                    }
                });

                header.addView(tvSortToggle);
                root.addView(header);

                TextView tvSub = new TextView(MainActivity.this);
                tvSub.setText("Sélectionnez une émission passée pour lancer le replay :");
                tvSub.setTextSize(12f);
                tvSub.setTextColor(0xFF94A3B8);
                tvSub.setPadding(0, dpToPx(4), 0, dpToPx(12));
                root.addView(tvSub);

                ScrollView sv = new ScrollView(MainActivity.this);
                final LinearLayout listContainer = new LinearLayout(MainActivity.this);
                listContainer.setOrientation(LinearLayout.VERTICAL);

                final AlertDialog dialog = builder.setView(root).create();
                if (dialog.getWindow() != null) {
                    dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                }

                // Populate programs list
                populateCatchupCards(listContainer, pastPrograms, dialog, ch, pl);

                tvSortToggle.setOnClickListener(v -> {
                    isDesc[0] = !isDesc[0];
                    Collections.reverse(pastPrograms);
                    tvSortToggle.setText(isDesc[0] ? "⇅ Plus récents" : "⇅ Plus anciens");
                    populateCatchupCards(listContainer, pastPrograms, dialog, ch, pl);
                });
                tvSortToggle.setOnKeyListener((v, keyCode, event) -> {
                    if (event.getAction() == KeyEvent.ACTION_DOWN && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
                        tvSortToggle.performClick();
                        return true;
                    }
                    return false;
                });

                sv.addView(listContainer);
                LinearLayout.LayoutParams svLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f);
                svLp.height = Math.min(pastPrograms.size() * dpToPx(75) + dpToPx(20), dpToPx(380));
                root.addView(sv, svLp);

                TextView btnClose = new TextView(MainActivity.this);
                btnClose.setText("Fermer");
                btnClose.setTextSize(13f);
                btnClose.setTypeface(Typeface.DEFAULT_BOLD);
                btnClose.setTextColor(0xFF94A3B8);
                btnClose.setGravity(Gravity.CENTER);
                btnClose.setPadding(dpToPx(16), dpToPx(10), dpToPx(16), dpToPx(10));
                btnClose.setFocusable(true);
                GradientDrawable closeBg = new GradientDrawable();
                closeBg.setColor(0xFF1E293B);
                closeBg.setCornerRadius(dpToPx(8));
                btnClose.setBackground(closeBg);
                btnClose.setOnClickListener(v -> dialog.dismiss());
                btnClose.setOnFocusChangeListener((v, hasFocus) -> {
                    GradientDrawable d = (GradientDrawable) btnClose.getBackground();
                    if (hasFocus) {
                        d.setColor(0xFF334155);
                        d.setStroke(dpToPx(2), Color.WHITE);
                        btnClose.setTextColor(Color.WHITE);
                    } else {
                        d.setColor(0xFF1E293B);
                        d.setStroke(0, Color.TRANSPARENT);
                        btnClose.setTextColor(0xFF94A3B8);
                    }
                });
                LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                closeLp.topMargin = dpToPx(8);
                root.addView(btnClose, closeLp);

                dialog.show();
            }

            @Override
            public void onError(String error) {
                if (isFinishing() || isDestroyed()) return;
                Toast.makeText(MainActivity.this, "Erreur Replay : " + error, Toast.LENGTH_LONG).show();
            }
        });
    }

    private void populateCatchupCards(LinearLayout listContainer, List<XtreamClient.EpgProgram> pastPrograms, AlertDialog dialog, KeoDatabase.ChannelItem ch, KeoDatabase.PlaylistItem pl) {
        listContainer.removeAllViews();
        for (int i = 0; i < pastPrograms.size(); i++) {
            final XtreamClient.EpgProgram prog = pastPrograms.get(i);

            LinearLayout card = new LinearLayout(MainActivity.this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dpToPx(14), dpToPx(12), dpToPx(14), dpToPx(12));
            card.setFocusable(true);
            card.setFocusableInTouchMode(true);

            LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            cardLp.setMargins(0, dpToPx(4), 0, dpToPx(4));
            card.setLayoutParams(cardLp);

            GradientDrawable cardBg = new GradientDrawable();
            cardBg.setColor(0xFF1E293B);
            cardBg.setCornerRadius(dpToPx(10));
            cardBg.setStroke(dpToPx(1), 0xFF334155);
            card.setBackground(cardBg);

            // Row 1: Day Badge + Time & Duration + Play Pill
            LinearLayout metaRow = new LinearLayout(MainActivity.this);
            metaRow.setOrientation(LinearLayout.HORIZONTAL);
            metaRow.setGravity(Gravity.CENTER_VERTICAL);

            TextView tvDay = new TextView(MainActivity.this);
            tvDay.setText(prog.getFormattedDayLabel());
            tvDay.setTextSize(11f);
            tvDay.setTypeface(Typeface.DEFAULT_BOLD);
            tvDay.setTextColor(0xFF38BDF8);
            tvDay.setPadding(dpToPx(6), dpToPx(2), dpToPx(6), dpToPx(2));
            GradientDrawable dayBg = new GradientDrawable();
            dayBg.setColor(0xFF0F2B48);
            dayBg.setCornerRadius(dpToPx(6));
            tvDay.setBackground(dayBg);
            metaRow.addView(tvDay);

            TextView tvTime = new TextView(MainActivity.this);
            tvTime.setText("  " + prog.getFormattedTimeWithDuration());
            tvTime.setTextSize(12f);
            tvTime.setTextColor(0xFF94A3B8);
            tvTime.setTypeface(Typeface.MONOSPACE);
            metaRow.addView(tvTime, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

            TextView tvPlay = new TextView(MainActivity.this);
            tvPlay.setText("▶ Voir");
            tvPlay.setTextSize(11f);
            tvPlay.setTypeface(Typeface.DEFAULT_BOLD);
            tvPlay.setTextColor(Color.WHITE);
            tvPlay.setPadding(dpToPx(10), dpToPx(4), dpToPx(10), dpToPx(4));
            GradientDrawable playBg = new GradientDrawable();
            playBg.setColor(0xFF0284C7);
            playBg.setCornerRadius(dpToPx(8));
            tvPlay.setBackground(playBg);
            metaRow.addView(tvPlay);

            card.addView(metaRow);

            // Row 2: Title
            TextView tvProgTitle = new TextView(MainActivity.this);
            tvProgTitle.setText(prog.title != null ? prog.title : "Émission");
            tvProgTitle.setTextSize(14f);
            tvProgTitle.setTypeface(Typeface.DEFAULT_BOLD);
            tvProgTitle.setTextColor(Color.WHITE);
            tvProgTitle.setPadding(0, dpToPx(6), 0, 0);
            card.addView(tvProgTitle);

            // Row 3: Description (if available)
            if (prog.desc != null && !prog.desc.trim().isEmpty()) {
                TextView tvProgDesc = new TextView(MainActivity.this);
                tvProgDesc.setText(prog.desc.trim());
                tvProgDesc.setTextSize(11f);
                tvProgDesc.setTextColor(0xFF64748B);
                tvProgDesc.setMaxLines(2);
                tvProgDesc.setEllipsize(TextUtils.TruncateAt.END);
                tvProgDesc.setPadding(0, dpToPx(2), 0, 0);
                card.addView(tvProgDesc);
            }

            // Focus and click handling
            card.setOnFocusChangeListener((v, hasFocus) -> {
                GradientDrawable d = (GradientDrawable) card.getBackground();
                if (hasFocus) {
                    d.setColor(0xFF0369A1);
                    d.setStroke(dpToPx(2), Color.WHITE);
                    card.setScaleX(1.02f);
                    card.setScaleY(1.02f);
                } else {
                    d.setColor(0xFF1E293B);
                    d.setStroke(dpToPx(1), 0xFF334155);
                    card.setScaleX(1.0f);
                    card.setScaleY(1.0f);
                }
            });

            card.setOnClickListener(v -> {
                dialog.dismiss();
                playCatchupStream(ch, prog, pl);
            });

            card.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
                    card.performClick();
                    return true;
                }
                return false;
            });

            listContainer.addView(card);
        }
    }

    private void playCatchupStream(KeoDatabase.ChannelItem ch, XtreamClient.EpgProgram prog, KeoDatabase.PlaylistItem pl) {
        try {
            String server = pl.serverUrl.trim().replaceAll("/+$", "");
            if (!server.startsWith("http://") && !server.startsWith("https://")) server = "http://" + server;
            String user = pl.username.trim();
            String pass = pl.password.trim();

            // Extract clean numeric streamId
            String cleanId = ch.streamId != null && !ch.streamId.isEmpty() ? ch.streamId : "";
            if (cleanId.isEmpty() && ch.id != null) {
                cleanId = ch.id.replaceAll("^.*_", "");
            }
            if (cleanId.isEmpty() && ch.streamUrl != null) {
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("/(\\d+)(?:\\.[a-zA-Z0-9]+)?(?:\\?|$)").matcher(ch.streamUrl);
                if (m.find()) cleanId = m.group(1);
            }

            // Duration in minutes
            long durationMins = (prog.stopMs - prog.startMs) / (60 * 1000);
            if (durationMins <= 0) durationMins = 60;
            long startSec = prog.startMs / 1000L;
            long stopSec = prog.stopMs / 1000L;

            // Formats for start date:
            // 1. Raw start from server EPG (exact server clock without timezone offset issues!)
            String rawStart = "";
            if (prog.start != null && prog.start.length() >= 16) {
                rawStart = prog.start.substring(0, 10) + ":" + prog.start.substring(11, 13) + "-" + prog.start.substring(14, 16);
            }

            // 2. Local device clock format
            SimpleDateFormat sdfLocal = new SimpleDateFormat("yyyy-MM-dd:HH-mm", Locale.US);
            String localFormatted = sdfLocal.format(new Date(prog.startMs));

            // 3. UTC clock format
            SimpleDateFormat sdfUtc = new SimpleDateFormat("yyyy-MM-dd:HH-mm", Locale.US);
            sdfUtc.setTimeZone(TimeZone.getTimeZone("UTC"));
            String utcFormatted = sdfUtc.format(new Date(prog.startMs));

            String encUser = URLEncoder.encode(user, "UTF-8");
            String encPass = URLEncoder.encode(pass, "UTF-8");

            List<String> urls = new ArrayList<>();
            List<String> titles = new ArrayList<>();
            java.util.Set<String> seen = new java.util.HashSet<>();

            java.util.List<String> timeFormats = new ArrayList<>();
            if (!rawStart.isEmpty()) timeFormats.add(rawStart);
            if (!timeFormats.contains(localFormatted)) timeFormats.add(localFormatted);
            if (!timeFormats.contains(utcFormatted)) timeFormats.add(utcFormatted);

            for (String tf : timeFormats) {
                String tfDash = tf.replace(":", "-");
                // Standard TS format (Raw credentials)
                String u1 = server + "/timeshift/" + user + "/" + pass + "/" + durationMins + "/" + tf + "/" + cleanId + ".ts";
                if (seen.add(u1)) urls.add(u1);

                // Standard HLS format
                String u2 = server + "/timeshift/" + user + "/" + pass + "/" + durationMins + "/" + tf + "/" + cleanId + ".m3u8";
                if (seen.add(u2)) urls.add(u2);

                // Streaming PHP timeshift endpoint
                String u3 = server + "/streaming/timeshift.php?username=" + user + "&password=" + pass + "&stream=" + cleanId + "&start=" + tf + "&duration=" + durationMins;
                if (seen.add(u3)) urls.add(u3);

                // Encoded credentials variant
                String u4 = server + "/timeshift/" + encUser + "/" + encPass + "/" + durationMins + "/" + tf + "/" + cleanId + ".ts";
                if (seen.add(u4)) urls.add(u4);

                // Dash separator variant
                String u5 = server + "/timeshift/" + user + "/" + pass + "/" + durationMins + "/" + tfDash + "/" + cleanId + ".ts";
                if (seen.add(u5)) urls.add(u5);
            }

            // Unix timestamp epoch formats (XUI.one, ZapX)
            String uEpochTs = server + "/timeshift/" + user + "/" + pass + "/" + durationMins + "/" + startSec + "/" + cleanId + ".ts";
            if (seen.add(uEpochTs)) urls.add(uEpochTs);

            String uEpochM3u8 = server + "/timeshift/" + user + "/" + pass + "/" + durationMins + "/" + startSec + "/" + cleanId + ".m3u8";
            if (seen.add(uEpochM3u8)) urls.add(uEpochM3u8);

            // Flussonic / XC HLS catchup format (m3u8 with utc/lutc parameters)
            String uFlussonic = server + "/live/" + user + "/" + pass + "/" + cleanId + ".m3u8?utc=" + startSec + "&lutc=" + stopSec;
            if (seen.add(uFlussonic)) urls.add(uFlussonic);

            // Root timeshift.php fallback
            String uRootPhp = server + "/timeshift.php?username=" + user + "&password=" + pass + "&stream=" + cleanId + "&start=" + localFormatted + "&duration=" + durationMins;
            if (seen.add(uRootPhp)) urls.add(uRootPhp);

            // Re-order candidate URLs to prioritize previously successful replay format
            try {
                String preferredType = getSharedPreferences("keotv_player", Context.MODE_PRIVATE).getString("working_replay_type", "");
                if (preferredType != null && !preferredType.isEmpty()) {
                    List<String> prioritized = new ArrayList<>();
                    List<String> others = new ArrayList<>();
                    for (String u : urls) {
                        if (PlayerActivity.getReplayUrlType(u).equals(preferredType)) {
                            prioritized.add(u);
                        } else {
                            others.add(u);
                        }
                    }
                    if (!prioritized.isEmpty()) {
                        urls.clear();
                        urls.addAll(prioritized);
                        urls.addAll(others);
                    }
                }
            } catch (Exception ignored) {}

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

    // --- FUTURE EPG GUIDE DIALOG ---
    private void showFutureEpgDialog(final KeoDatabase.ChannelItem ch) {
        if (ch == null || isFinishing() || isDestroyed()) return;
        if ("vod".equals(ch.streamType) || "series".equals(ch.streamType)) return;

        final KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl == null || pl.serverUrl == null || pl.serverUrl.isEmpty()) {
            Toast.makeText(this, "Compte non configuré", Toast.LENGTH_SHORT).show();
            return;
        }

        final String streamId = (ch.streamId != null && !ch.streamId.isEmpty())
                ? ch.streamId
                : ch.id.replace("xtream_live_", "").replace("xtream_replay_", "");

        Toast.makeText(this, "Chargement du guide TV...", Toast.LENGTH_SHORT).show();
        xtreamClient.fetchShortEpg(pl.serverUrl, pl.username, pl.password, streamId, 15, new XtreamClient.EpgCallback() {
            @Override
            public void onSuccess(List<XtreamClient.EpgProgram> programs, XtreamClient.EpgProgram current, XtreamClient.EpgProgram next) {
                if (isFinishing() || isDestroyed()) return;

                long nowMs = System.currentTimeMillis();
                final List<XtreamClient.EpgProgram> futureList = new ArrayList<>();
                for (XtreamClient.EpgProgram p : programs) {
                    if (p.stopMs > nowMs) {
                        futureList.add(p);
                    }
                }

                if (futureList.isEmpty()) {
                    Toast.makeText(MainActivity.this, "Aucun programme futur disponible pour " + ch.name, Toast.LENGTH_SHORT).show();
                    return;
                }

                // Sort chronological
                Collections.sort(futureList, (a, b) -> Long.compare(a.startMs, b.startMs));

                AlertDialog.Builder builder = new AlertDialog.Builder(MainActivity.this);
                LinearLayout root = new LinearLayout(MainActivity.this);
                root.setOrientation(LinearLayout.VERTICAL);
                root.setPadding(dpToPx(20), dpToPx(16), dpToPx(20), dpToPx(16));
                GradientDrawable rootBg = new GradientDrawable();
                rootBg.setColor(0xFF0F172A);
                rootBg.setCornerRadius(dpToPx(16));
                rootBg.setStroke(dpToPx(1), 0xFF334155);
                root.setBackground(rootBg);

                // Header
                LinearLayout header = new LinearLayout(MainActivity.this);
                header.setOrientation(LinearLayout.HORIZONTAL);
                header.setGravity(Gravity.CENTER_VERTICAL);

                TextView tvTitle = new TextView(MainActivity.this);
                tvTitle.setText("📅 Guide TV : " + (ch.name != null ? ch.name : "Chaîne TV"));
                tvTitle.setTextSize(16.5f);
                tvTitle.setTypeface(Typeface.DEFAULT_BOLD);
                tvTitle.setTextColor(Color.WHITE);
                header.addView(tvTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

                TextView tvBadge = new TextView(MainActivity.this);
                tvBadge.setText(futureList.size() + " émissions à venir");
                tvBadge.setTextSize(11f);
                tvBadge.setTypeface(Typeface.DEFAULT_BOLD);
                tvBadge.setTextColor(0xFF38BDF8);
                tvBadge.setPadding(dpToPx(8), dpToPx(3), dpToPx(8), dpToPx(3));
                GradientDrawable countBg = new GradientDrawable();
                countBg.setColor(0xFF0C4A6E);
                countBg.setCornerRadius(dpToPx(12));
                countBg.setStroke(dpToPx(1), 0xFF0284C7);
                tvBadge.setBackground(countBg);
                header.addView(tvBadge);

                root.addView(header);

                TextView tvSub = new TextView(MainActivity.this);
                tvSub.setText("Programmes en cours et à suivre sur cette chaîne :");
                tvSub.setTextSize(12f);
                tvSub.setTextColor(0xFF94A3B8);
                tvSub.setPadding(0, dpToPx(4), 0, dpToPx(12));
                root.addView(tvSub);

                ScrollView sv = new ScrollView(MainActivity.this);
                LinearLayout listContainer = new LinearLayout(MainActivity.this);
                listContainer.setOrientation(LinearLayout.VERTICAL);

                final AlertDialog dialog = builder.setView(root).create();
                if (dialog.getWindow() != null) {
                    dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
                }

                for (int i = 0; i < futureList.size(); i++) {
                    final XtreamClient.EpgProgram prog = futureList.get(i);
                    final boolean isCurrentlyLive = prog.startMs <= nowMs && prog.stopMs > nowMs;

                    LinearLayout card = new LinearLayout(MainActivity.this);
                    card.setOrientation(LinearLayout.VERTICAL);
                    card.setPadding(dpToPx(14), dpToPx(12), dpToPx(14), dpToPx(12));
                    card.setFocusable(true);
                    card.setFocusableInTouchMode(true);

                    LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                    cardLp.setMargins(0, dpToPx(4), 0, dpToPx(4));
                    card.setLayoutParams(cardLp);

                    GradientDrawable cardBg = new GradientDrawable();
                    cardBg.setColor(isCurrentlyLive ? 0xFF0F2B48 : 0xFF1E293B);
                    cardBg.setCornerRadius(dpToPx(10));
                    cardBg.setStroke(dpToPx(1), isCurrentlyLive ? 0xFF0284C7 : 0xFF334155);
                    card.setBackground(cardBg);

                    // Row 1: Day badge + Time
                    LinearLayout metaRow = new LinearLayout(MainActivity.this);
                    metaRow.setOrientation(LinearLayout.HORIZONTAL);
                    metaRow.setGravity(Gravity.CENTER_VERTICAL);

                    TextView tvDay = new TextView(MainActivity.this);
                    tvDay.setText(isCurrentlyLive ? "🔴 EN DIRECT" : prog.getFormattedDayLabel());
                    tvDay.setTextSize(11f);
                    tvDay.setTypeface(Typeface.DEFAULT_BOLD);
                    tvDay.setTextColor(isCurrentlyLive ? 0xFFF43F5E : 0xFF38BDF8);
                    tvDay.setPadding(dpToPx(6), dpToPx(2), dpToPx(6), dpToPx(2));
                    GradientDrawable dayBg = new GradientDrawable();
                    dayBg.setColor(isCurrentlyLive ? 0xFF4C0519 : 0xFF0F2B48);
                    dayBg.setCornerRadius(dpToPx(6));
                    tvDay.setBackground(dayBg);
                    metaRow.addView(tvDay);

                    TextView tvTime = new TextView(MainActivity.this);
                    tvTime.setText("  " + prog.getFormattedTimeWithDuration());
                    tvTime.setTextSize(12f);
                    tvTime.setTextColor(0xFF94A3B8);
                    tvTime.setTypeface(Typeface.MONOSPACE);
                    metaRow.addView(tvTime, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

                    if (isCurrentlyLive) {
                        TextView tvLiveBtn = new TextView(MainActivity.this);
                        tvLiveBtn.setText("▶ Regarder");
                        tvLiveBtn.setTextSize(11f);
                        tvLiveBtn.setTypeface(Typeface.DEFAULT_BOLD);
                        tvLiveBtn.setTextColor(Color.WHITE);
                        tvLiveBtn.setPadding(dpToPx(10), dpToPx(4), dpToPx(10), dpToPx(4));
                        GradientDrawable playBg = new GradientDrawable();
                        playBg.setColor(0xFF0284C7);
                        playBg.setCornerRadius(dpToPx(8));
                        tvLiveBtn.setBackground(playBg);
                        metaRow.addView(tvLiveBtn);
                    }

                    card.addView(metaRow);

                    // Row 2: Title
                    TextView tvProgTitle = new TextView(MainActivity.this);
                    tvProgTitle.setText(prog.title != null ? prog.title : "Émission");
                    tvProgTitle.setTextSize(14f);
                    tvProgTitle.setTypeface(Typeface.DEFAULT_BOLD);
                    tvProgTitle.setTextColor(Color.WHITE);
                    tvProgTitle.setPadding(0, dpToPx(6), 0, 0);
                    card.addView(tvProgTitle);

                    // Row 3: Description
                    if (prog.desc != null && !prog.desc.trim().isEmpty()) {
                        TextView tvProgDesc = new TextView(MainActivity.this);
                        tvProgDesc.setText(prog.desc.trim());
                        tvProgDesc.setTextSize(11f);
                        tvProgDesc.setTextColor(0xFF64748B);
                        tvProgDesc.setMaxLines(2);
                        tvProgDesc.setEllipsize(TextUtils.TruncateAt.END);
                        tvProgDesc.setPadding(0, dpToPx(2), 0, 0);
                        card.addView(tvProgDesc);
                    }

                    card.setOnFocusChangeListener((v, hasFocus) -> {
                        GradientDrawable d = (GradientDrawable) card.getBackground();
                        if (hasFocus) {
                            d.setColor(0xFF0369A1);
                            d.setStroke(dpToPx(2), Color.WHITE);
                            card.setScaleX(1.02f);
                            card.setScaleY(1.02f);
                        } else {
                            d.setColor(isCurrentlyLive ? 0xFF0F2B48 : 0xFF1E293B);
                            d.setStroke(dpToPx(1), isCurrentlyLive ? 0xFF0284C7 : 0xFF334155);
                            card.setScaleX(1.0f);
                            card.setScaleY(1.0f);
                        }
                    });

                    if (isCurrentlyLive) {
                        card.setOnClickListener(v -> {
                            dialog.dismiss();
                            launchPlayerFullscreen();
                        });
                        card.setOnKeyListener((v, keyCode, event) -> {
                            if (event.getAction() == KeyEvent.ACTION_DOWN && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
                                card.performClick();
                                return true;
                            }
                            return false;
                        });
                    }

                    listContainer.addView(card);
                }

                sv.addView(listContainer);
                LinearLayout.LayoutParams svLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f);
                svLp.height = Math.min(futureList.size() * dpToPx(75) + dpToPx(20), dpToPx(380));
                root.addView(sv, svLp);

                TextView btnClose = new TextView(MainActivity.this);
                btnClose.setText("Fermer");
                btnClose.setTextSize(13f);
                btnClose.setTypeface(Typeface.DEFAULT_BOLD);
                btnClose.setTextColor(0xFF94A3B8);
                btnClose.setGravity(Gravity.CENTER);
                btnClose.setPadding(dpToPx(16), dpToPx(10), dpToPx(16), dpToPx(10));
                btnClose.setFocusable(true);
                GradientDrawable closeBg = new GradientDrawable();
                closeBg.setColor(0xFF1E293B);
                closeBg.setCornerRadius(dpToPx(8));
                btnClose.setBackground(closeBg);
                btnClose.setOnClickListener(v -> dialog.dismiss());
                btnClose.setOnFocusChangeListener((v, hasFocus) -> {
                    GradientDrawable d = (GradientDrawable) btnClose.getBackground();
                    if (hasFocus) {
                        d.setColor(0xFF334155);
                        d.setStroke(dpToPx(2), Color.WHITE);
                        btnClose.setTextColor(Color.WHITE);
                    } else {
                        d.setColor(0xFF1E293B);
                        d.setStroke(0, Color.TRANSPARENT);
                        btnClose.setTextColor(0xFF94A3B8);
                    }
                });
                LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                closeLp.topMargin = dpToPx(8);
                root.addView(btnClose, closeLp);

                dialog.show();
            }

            @Override
            public void onError(String error) {
                if (isFinishing() || isDestroyed()) return;
                Toast.makeText(MainActivity.this, "Erreur Guide TV : " + error, Toast.LENGTH_SHORT).show();
            }
        });
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
                    if (db != null) db.warmUpSearchIndexAsync();
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
            tvInfo.setText("Synchronisez instantanément vos abonnements, favoris et timecodes VOD avec le Cloud Supabase (https://keotv.vercel.app/sync).\n\nSaisissez votre email et mot de passe de compte :");
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
                    .setTitle("☁️ Synchronisation Cloud (Favoris, VOD, Playlists)")
                    .setView(layout)
                    .setPositiveButton("☁️ Connexion & Synchroniser", (dialog, which) -> {
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

                        prefs.edit()
                                .putString("cloud_username", ident)
                                .putString("cloud_password", pass)
                                .apply();
                        pullAccountsFromCloud(ident, pass);
                    })
                    .setNeutralButton("⬆️ Sauvegarder vers Cloud", (dialog, which) -> {
                        String ident = etUser.getText().toString().trim();
                        String pass = etPass.getText().toString().trim();
                        if (!ident.isEmpty()) {
                            SharedPreferences.Editor ed = prefs.edit().putString("cloud_username", ident);
                            if (!pass.isEmpty()) ed.putString("cloud_password", pass);
                            ed.apply();
                        }
                        pushAccountsToCloud(true);
                    })
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

                // 1. Restore Favorites from Cloud
                int restoredFavCount = 0;
                if (userObj.has("favorites") && !userObj.get("favorites").isJsonNull()) {
                    try {
                        JsonElement favEl = userObj.get("favorites");
                        List<String> favList = new ArrayList<>();
                        if (favEl.isJsonArray()) {
                            JsonArray fArr = favEl.getAsJsonArray();
                            for (int i = 0; i < fArr.size(); i++) {
                                favList.add(fArr.get(i).getAsString());
                            }
                        } else if (favEl.isJsonObject()) {
                            for (String key : favEl.getAsJsonObject().keySet()) {
                                favList.add(key);
                            }
                        }
                        restoredFavCount = db.restoreFavorites(favList);
                    } catch (Exception favEx) {
                        Log.w(TAG, "Error restoring favorites: " + favEx.getMessage());
                    }
                }

                // 2. Restore Watched Positions from Cloud
                int restoredPosCount = 0;
                if (userObj.has("watched_positions") && !userObj.get("watched_positions").isJsonNull()) {
                    try {
                        JsonElement wpEl = userObj.get("watched_positions");
                        SharedPreferences posPrefs = getSharedPreferences(PlayerActivity.PREFS_POSITIONS, Context.MODE_PRIVATE);
                        String localJson = posPrefs.getString(PlayerActivity.KEY_POSITIONS_JSON, "{}");
                        org.json.JSONObject root = new org.json.JSONObject(localJson);

                        if (wpEl.isJsonObject()) {
                            org.json.JSONObject cloudObj = new org.json.JSONObject(wpEl.toString());
                            java.util.Iterator<String> it = cloudObj.keys();
                            while (it.hasNext()) {
                                String key = it.next();
                                root.put(key, cloudObj.get(key));
                                restoredPosCount++;
                            }
                        } else if (wpEl.isJsonArray()) {
                            JsonArray wpArr = wpEl.getAsJsonArray();
                            for (int i = 0; i < wpArr.size(); i++) {
                                if (wpArr.get(i).isJsonObject()) {
                                    JsonObject item = wpArr.get(i).getAsJsonObject();
                                    String u = item.has("url") ? item.get("url").getAsString() : "";
                                    if (!u.isEmpty()) {
                                        root.put(u, new org.json.JSONObject(item.toString()));
                                        restoredPosCount++;
                                    }
                                }
                            }
                        }
                        posPrefs.edit().putString(PlayerActivity.KEY_POSITIONS_JSON, root.toString()).apply();
                    } catch (Exception posEx) {
                        Log.w(TAG, "Error restoring positions: " + posEx.getMessage());
                    }
                }

                // 3. Restore settings from Cloud
                if (userObj.has("settings") && userObj.get("settings").isJsonObject()) {
                    try {
                        JsonObject setObj = userObj.getAsJsonObject("settings");
                        SharedPreferences.Editor pe = getSharedPreferences("keotv_player_prefs", MODE_PRIVATE).edit();
                        if (setObj.has("hw_accel")) pe.putBoolean("hw_accel", setObj.get("hw_accel").getAsBoolean());
                        if (setObj.has("buffer_sec")) pe.putString("buffer_sec", setObj.get("buffer_sec").getAsString());
                        if (setObj.has("osd_timeout_sec")) pe.putString("osd_timeout_sec", setObj.get("osd_timeout_sec").getAsString());
                        if (setObj.has("epg_position")) pe.putString("epg_position", setObj.get("epg_position").getAsString());
                        pe.apply();
                    } catch (Exception ignored) {}
                }

                final int fRestoredFavs = restoredFavCount;
                final int fRestoredPos = restoredPosCount;

                runOnUiThread(() -> {
                    if (tvHeaderSyncInfo != null) {
                        tvHeaderSyncInfo.setText("☁️ " + cleanIdent + " (Synchronisé)");
                    }
                    tvStatusBadge.setText("☁️ Connecté");
                    Toast.makeText(MainActivity.this, "☁️ Cloud synchronisé (" + fRestoredFavs + " favoris & " + fRestoredPos + " positions restaurés)", Toast.LENGTH_LONG).show();
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

    private void pushAccountsToCloud(final boolean showToast) {
        final SharedPreferences prefs = getSharedPreferences("keotv_prefs", MODE_PRIVATE);
        final String ident = prefs.getString("cloud_username", "");
        if (ident.isEmpty()) {
            if (showToast) {
                Toast.makeText(this, "Connectez-vous d'abord à votre compte Cloud pour sauvegarder.", Toast.LENGTH_SHORT).show();
            }
            return;
        }

        new Thread(() -> {
            try {
                String cleanIdent = ident.trim().toLowerCase();

                // 1. Gather favorites
                List<String> favIds = db.getFavoriteChannelIds();
                JsonArray favArr = new JsonArray();
                for (String f : favIds) favArr.add(f);

                // 2. Gather watched positions
                SharedPreferences posPrefs = getSharedPreferences(PlayerActivity.PREFS_POSITIONS, Context.MODE_PRIVATE);
                String posJson = posPrefs.getString(PlayerActivity.KEY_POSITIONS_JSON, "{}");
                JsonObject watchedObj = JsonParser.parseString(posJson).isJsonObject()
                        ? JsonParser.parseString(posJson).getAsJsonObject() : new JsonObject();

                // 3. Gather settings
                SharedPreferences playerPrefs = getSharedPreferences("keotv_player_prefs", MODE_PRIVATE);
                JsonObject settingsObj = new JsonObject();
                settingsObj.addProperty("hw_accel", playerPrefs.getBoolean("hw_accel", true));
                settingsObj.addProperty("buffer_sec", playerPrefs.getString("buffer_sec", "15"));
                settingsObj.addProperty("osd_timeout_sec", playerPrefs.getString("osd_timeout_sec", "5000"));
                settingsObj.addProperty("epg_position", playerPrefs.getString("epg_position", "bottom"));

                // 4. Build PATCH payload
                JsonObject payload = new JsonObject();
                payload.add("favorites", favArr);
                payload.add("watched_positions", watchedObj);
                payload.add("settings", settingsObj);
                String isoNow = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).format(new Date());
                payload.addProperty("updated_at", isoNow);

                String enc = URLEncoder.encode(cleanIdent, "UTF-8");
                String urlStr = "https://qvfmfstwrkcerzlbemzb.supabase.co/rest/v1/keotv_users?or=(username.eq."
                        + enc + ",id.eq.usr_" + enc + ",id.eq." + enc + ")";

                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(15000);
                conn.setRequestProperty("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2Zm1mc3R3cmtjZXJ6bGJlbXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjE1NDksImV4cCI6MjEwNzYzNzU0OX0.-VCES2YX_FDjWct12sTgTaDtfqnqUfXfPcMS39UmRBs");
                conn.setRequestProperty("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2Zm1mc3R3cmtjZXJ6bGJlbXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjE1NDksImV4cCI6MjEwNzYzNzU0OX0.-VCES2YX_FDjWct12sTgTaDtfqnqUfXfPcMS39UmRBs");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Prefer", "return=representation");
                conn.setDoOutput(true);

                byte[] out = payload.toString().getBytes(StandardCharsets.UTF_8);
                conn.getOutputStream().write(out);

                int code = conn.getResponseCode();
                if (code >= 200 && code < 300) {
                    if (showToast) {
                        final int favCount = favIds.size();
                        runOnUiThread(() -> Toast.makeText(MainActivity.this, "☁️ Sauvegarde Cloud réussie (" + favCount + " favoris & positions VOD sauvegardés)", Toast.LENGTH_SHORT).show());
                    }
                } else {
                    Log.w(TAG, "Cloud push failed with HTTP code: " + code);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to push to cloud", e);
            }
        }).start();
    }

    private void syncCloudSilently() {
        final SharedPreferences prefs = getSharedPreferences("keotv_prefs", MODE_PRIVATE);
        final String ident = prefs.getString("cloud_username", "");
        if (ident.isEmpty()) return;

        new Thread(() -> {
            try {
                String cleanIdent = ident.trim().toLowerCase();
                String enc = URLEncoder.encode(cleanIdent, "UTF-8");
                String urlStr = "https://qvfmfstwrkcerzlbemzb.supabase.co/rest/v1/keotv_users?or=(username.eq."
                        + enc + ",id.eq.usr_" + enc + ",id.eq." + enc + ")&select=*";

                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(12000);
                conn.setRequestProperty("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2Zm1mc3R3cmtjZXJ6bGJlbXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjE1NDksImV4cCI6MjEwNzYzNzU0OX0.-VCES2YX_FDjWct12sTgTaDtfqnqUfXfPcMS39UmRBs");
                conn.setRequestProperty("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2Zm1mc3R3cmtjZXJ6bGJlbXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjE1NDksImV4cCI6MjEwNzYzNzU0OX0.-VCES2YX_FDjWct12sTgTaDtfqnqUfXfPcMS39UmRBs");
                conn.setRequestProperty("Accept", "application/json");

                int code = conn.getResponseCode();
                if (code != 200) return;

                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();

                JsonArray arr = JsonParser.parseString(sb.toString()).getAsJsonArray();
                if (arr.size() == 0) return;

                JsonObject userObj = arr.get(0).getAsJsonObject();

                // 1. Merge Favorites (Union of Cloud & Local so neither device loses favorites)
                boolean favsChanged = false;
                List<String> localFavs = db.getFavoriteChannelIds();
                Set<String> mergedFavs = new HashSet<>(localFavs);
                if (userObj.has("favorites") && !userObj.get("favorites").isJsonNull()) {
                    JsonElement favEl = userObj.get("favorites");
                    if (favEl.isJsonArray()) {
                        JsonArray fArr = favEl.getAsJsonArray();
                        for (int i = 0; i < fArr.size(); i++) {
                            String fid = fArr.get(i).getAsString();
                            if (mergedFavs.add(fid)) {
                                favsChanged = true;
                            }
                        }
                    }
                }
                if (favsChanged) {
                    db.restoreFavorites(new ArrayList<>(mergedFavs));
                }

                // 2. Merge Watched Positions (Take newest updatedAt per URL)
                boolean positionsChanged = false;
                SharedPreferences posPrefs = getSharedPreferences(PlayerActivity.PREFS_POSITIONS, Context.MODE_PRIVATE);
                String localPosJson = posPrefs.getString(PlayerActivity.KEY_POSITIONS_JSON, "{}");
                org.json.JSONObject localRoot = new org.json.JSONObject(localPosJson);

                if (userObj.has("watched_positions") && !userObj.get("watched_positions").isJsonNull()) {
                    JsonElement wpEl = userObj.get("watched_positions");
                    if (wpEl.isJsonObject()) {
                        org.json.JSONObject cloudObj = new org.json.JSONObject(wpEl.toString());
                        java.util.Iterator<String> it = cloudObj.keys();
                        while (it.hasNext()) {
                            String urlKey = it.next();
                            org.json.JSONObject cloudEntry = cloudObj.optJSONObject(urlKey);
                            if (cloudEntry != null) {
                                org.json.JSONObject localEntry = localRoot.optJSONObject(urlKey);
                                long cloudTime = cloudEntry.optLong("updatedAt", 0L);
                                long localTime = localEntry != null ? localEntry.optLong("updatedAt", 0L) : 0L;
                                if (localEntry == null || cloudTime >= localTime) {
                                    localRoot.put(urlKey, cloudEntry);
                                    positionsChanged = true;
                                }
                            }
                        }
                    }
                }
                if (positionsChanged) {
                    posPrefs.edit().putString(PlayerActivity.KEY_POSITIONS_JSON, localRoot.toString()).apply();
                }

                // 3. Restore settings from Cloud
                if (userObj.has("settings") && userObj.get("settings").isJsonObject()) {
                    JsonObject setObj = userObj.getAsJsonObject("settings");
                    SharedPreferences.Editor pe = getSharedPreferences("keotv_player_prefs", MODE_PRIVATE).edit();
                    if (setObj.has("hw_accel")) pe.putBoolean("hw_accel", setObj.get("hw_accel").getAsBoolean());
                    if (setObj.has("buffer_sec")) pe.putString("buffer_sec", setObj.get("buffer_sec").getAsString());
                    if (setObj.has("osd_timeout_sec")) pe.putString("osd_timeout_sec", setObj.get("osd_timeout_sec").getAsString());
                    if (setObj.has("epg_position")) pe.putString("epg_position", setObj.get("epg_position").getAsString());
                    pe.apply();
                }

                // 4. Update Header UI
                runOnUiThread(() -> {
                    if (tvHeaderSyncInfo != null) {
                        tvHeaderSyncInfo.setText("☁️ " + cleanIdent + " (Synchronisé)");
                    }
                    if (channelsAdapter != null) {
                        channelsAdapter.notifyDataSetChanged();
                    }
                });

                // 5. Push merged union back to Supabase so both device and cloud are in parity
                pushAccountsToCloud(false);

            } catch (Exception e) {
                Log.w(TAG, "Silent cloud sync error: " + e.getMessage());
            }
        }).start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        syncCloudSilently();
    }

    private void openWebUrl(String urlStr) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(urlStr));
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Impossible d'ouvrir le lien : " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    private void showSettingsDialog() {
        if (isFinishing() || isDestroyed()) return;

        try {
            final SharedPreferences prefs = getSharedPreferences("keotv_prefs", MODE_PRIVATE);
            final String cloudUser = prefs.getString("cloud_username", "");
            final boolean isCloudConnected = !cloudUser.isEmpty();

            AlertDialog.Builder builder = new AlertDialog.Builder(this);
            LinearLayout root = new LinearLayout(this);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setPadding(dpToPx(22), dpToPx(18), dpToPx(22), dpToPx(18));
            GradientDrawable rootBg = new GradientDrawable();
            rootBg.setColor(0xFF0F172A);
            rootBg.setCornerRadius(dpToPx(16));
            rootBg.setStroke(dpToPx(1), 0xFF334155);
            root.setBackground(rootBg);

            // Header Layout
            LinearLayout header = new LinearLayout(this);
            header.setOrientation(LinearLayout.HORIZONTAL);
            header.setGravity(Gravity.CENTER_VERTICAL);

            TextView tvTitle = new TextView(this);
            tvTitle.setText("⚙️ PARAMÈTRES KEOTV");
            tvTitle.setTextSize(17f);
            tvTitle.setTypeface(Typeface.DEFAULT_BOLD);
            tvTitle.setTextColor(Color.WHITE);
            header.addView(tvTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

            TextView tvBuild = new TextView(this);
            tvBuild.setText("v1.4 • Build " + UpdateManager.getAppVersionCode(this));
            tvBuild.setTextSize(11f);
            tvBuild.setTypeface(Typeface.DEFAULT_BOLD);
            tvBuild.setTextColor(0xFF38BDF8);
            tvBuild.setPadding(dpToPx(8), dpToPx(3), dpToPx(8), dpToPx(3));
            GradientDrawable bBg = new GradientDrawable();
            bBg.setColor(0xFF0C4A6E);
            bBg.setCornerRadius(dpToPx(12));
            bBg.setStroke(dpToPx(1), 0xFF0284C7);
            tvBuild.setBackground(bBg);
            header.addView(tvBuild);

            root.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
            root.addView(header);

            TextView tvSub = new TextView(this);
            tvSub.setText("Configuration du lecteur, synchronisation cloud et réglages système :");
            tvSub.setTextSize(12f);
            tvSub.setTextColor(0xFF94A3B8);
            tvSub.setPadding(0, dpToPx(4), 0, dpToPx(12));
            root.addView(tvSub);

            ScrollView sv = new ScrollView(this);
            sv.setFocusable(false);
            sv.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
            LinearLayout listContainer = new LinearLayout(this);
            listContainer.setOrientation(LinearLayout.VERTICAL);

            final AlertDialog dialog = builder.setView(root).create();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            }

            // 1. Organiser les bouquets & chaînes (Custom order & visibility)
            listContainer.addView(createSettingsCard("📁", "Organiser les bouquets & chaînes",
                    "Réorganiser l'ordre d'affichage (▲/▼), masquer ou afficher des bouquets et chaînes", v -> {
                        dialog.dismiss();
                        showCategoryManagerDialog();
                    }));

            // 2. Favoris en tête des bouquets
            final boolean showFavs = prefs.getBoolean("pref_show_favorites_category", true);
            listContainer.addView(createSettingsCard("⭐", "Favoris en tête des bouquets : " + (showFavs ? "ACTIVÉ" : "DÉSACTIVÉ"),
                    showFavs ? "Le bouquet ⭐ Favoris s'affiche au sommet • Cliquer pour masquer" : "Le bouquet ⭐ Favoris est masqué • Cliquer pour activer", v -> {
                        dialog.dismiss();
                        prefs.edit().putBoolean("pref_show_favorites_category", !showFavs).apply();
                        loadLocalData();
                        Toast.makeText(this, !showFavs ? "Favoris en tête activés" : "Favoris en tête masqués", Toast.LENGTH_SHORT).show();
                    }));

            // 3. Recommandations 'Pour vous' (VOD & Séries)
            final boolean showForYou = prefs.getBoolean("pref_show_for_you", true);
            listContainer.addView(createSettingsCard("✨", "Recommandations 'Pour vous' : " + (showForYou ? "ACTIVÉ" : "DÉSACTIVÉ"),
                    showForYou ? "Le bouquet ✨ Pour vous s'affiche en tête des films et séries • Cliquer pour masquer" : "Le bouquet ✨ Pour vous est masqué • Cliquer pour activer", v -> {
                        dialog.dismiss();
                        prefs.edit().putBoolean("pref_show_for_you", !showForYou).apply();
                        loadLocalData();
                        Toast.makeText(this, !showForYou ? "Recommandations activées" : "Recommandations masquées", Toast.LENGTH_SHORT).show();
                    }));

            // 4. Dons & Feedback (restored pre-build 100)
            listContainer.addView(createSettingsCard("💖", "Soutenir le projet & Avis / Feedback",
                    "Faire un don (GitHub Sponsors / PayPal) ou signaler un bug", v -> {
                        dialog.dismiss();
                        showDonationsAndFeedbackDialog();
                    }));

            // 5. Contrôle Parental
            listContainer.addView(createSettingsCard("🛡️", "Contrôle Parental & Code PIN",
                    "Verrouiller ou déverrouiller l'accès aux bouquets adultes (PIN)", v -> {
                        dialog.dismiss();
                        showParentalControlDialog();
                    }));

            // 6. Compte Cloud & Synchronisation
            if (isCloudConnected) {
                listContainer.addView(createSettingsCard("☁️", "Compte Cloud : " + cloudUser,
                        "Connecté • Synchronisation automatique TV & Mobile", v -> {
                            dialog.dismiss();
                            showCloudSyncDialog();
                        }));
                listContainer.addView(createSettingsCard("🔄", "Synchroniser maintenant",
                        "Fusionner immédiatement favoris, positions VOD et réglages avec le Cloud", v -> {
                            dialog.dismiss();
                            Toast.makeText(this, "Synchronisation Cloud en cours...", Toast.LENGTH_SHORT).show();
                            syncCloudSilently();
                        }));
                listContainer.addView(createSettingsCard("🚪", "Déconnexion du compte Cloud",
                        "Déconnecter votre profil Cloud de cet appareil", v -> {
                            dialog.dismiss();
                            prefs.edit().remove("cloud_username").remove("cloud_password").apply();
                            if (tvHeaderSyncInfo != null) tvHeaderSyncInfo.setText("");
                            Toast.makeText(this, "Compte Cloud déconnecté", Toast.LENGTH_SHORT).show();
                        }));
            } else {
                listContainer.addView(createSettingsCard("☁️", "Connecter un Compte Cloud",
                        "Synchronisez vos favoris, timecodes VOD et abonnements entre TV et Mobile", v -> {
                            dialog.dismiss();
                            showCloudSyncDialog();
                        }));
            }

            // 7. Lecteur Vidéo & Performances
            listContainer.addView(createSettingsCard("📺", "Lecteur Vidéo & Performances",
                    "Accélération matérielle GPU, moteur Media3 ExoPlayer, taille du tampon", v -> {
                        dialog.dismiss();
                        showPlayerSettingsDialog();
                    }));

            // 8. Purge Cache
            listContainer.addView(createSettingsCard("🧹", "Vider le Cache & Resynchroniser",
                    "Purger le cache local des chaînes et retélécharger la playlist", v -> {
                        dialog.dismiss();
                        Toast.makeText(this, "Purge du cache...", Toast.LENGTH_SHORT).show();
                        db.purgeCache(true);
                        loadLocalData();
                        triggerSync();
                    }));

            // 9. Mise à Jour OTA
            listContainer.addView(createSettingsCard("🔄", "Rechercher des Mises à Jour (OTA)",
                    "Vérifier la dernière version de KeoTV et mettre à jour l'APK", v -> {
                        dialog.dismiss();
                        UpdateManager.checkForUpdates(this, true);
                    }));

            // 10. Diagnostic Système
            listContainer.addView(createSettingsCard("📊", "Diagnostic & État du Système",
                    "Statistiques du catalogue, mémoire RAM et base SQLite", v -> {
                        dialog.dismiss();
                        showDiagnosticDialog();
                    }));

            // 11. Réinitialisation Usine
            listContainer.addView(createSettingsCard("⚠️", "Réinitialisation Usine Complète",
                    "Effacer toutes les playlists locales, comptes et réinitialiser l'app", v -> {
                        dialog.dismiss();
                        performFactoryReset();
                    }));

            sv.addView(listContainer);
            LinearLayout.LayoutParams svLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f);
            svLp.height = dpToPx(380);
            root.addView(sv, svLp);

            // Bottom Close button
            TextView btnClose = new TextView(this);
            btnClose.setText("Fermer");
            btnClose.setTextSize(13f);
            btnClose.setTypeface(Typeface.DEFAULT_BOLD);
            btnClose.setTextColor(0xFF94A3B8);
            btnClose.setGravity(Gravity.CENTER);
            btnClose.setPadding(dpToPx(16), dpToPx(10), dpToPx(16), dpToPx(10));
            btnClose.setFocusable(true);
            GradientDrawable closeBg = new GradientDrawable();
            closeBg.setColor(0xFF1E293B);
            closeBg.setCornerRadius(dpToPx(8));
            btnClose.setBackground(closeBg);
            btnClose.setOnClickListener(v -> dialog.dismiss());
            btnClose.setOnFocusChangeListener((v, hasFocus) -> {
                GradientDrawable d = (GradientDrawable) btnClose.getBackground();
                if (hasFocus) {
                    d.setColor(0xFF334155);
                    d.setStroke(dpToPx(2), Color.WHITE);
                    btnClose.setTextColor(Color.WHITE);
                } else {
                    d.setColor(0xFF1E293B);
                    d.setStroke(0, Color.TRANSPARENT);
                    btnClose.setTextColor(0xFF94A3B8);
                }
            });
            LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            closeLp.topMargin = dpToPx(10);
            root.addView(btnClose, closeLp);

            dialog.setOnShowListener(d -> {
                listContainer.post(() -> {
                    if (listContainer.getChildCount() > 0) {
                        listContainer.getChildAt(0).requestFocus();
                    }
                });
            });
            dialog.show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to show settings dialog", t);
        }
    }

    private View createSettingsCard(String icon, String title, String subtitle, View.OnClickListener onClick) {
        final LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dpToPx(14), dpToPx(11), dpToPx(14), dpToPx(11));
        card.setFocusable(true);

        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardLp.setMargins(0, dpToPx(4), 0, dpToPx(4));
        card.setLayoutParams(cardLp);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(0xFF1E293B);
        cardBg.setCornerRadius(dpToPx(10));
        cardBg.setStroke(dpToPx(1), 0xFF334155);
        card.setBackground(cardBg);

        // Icon badge
        TextView tvIcon = new TextView(this);
        tvIcon.setText(icon);
        tvIcon.setTextSize(16f);
        tvIcon.setGravity(Gravity.CENTER);
        card.addView(tvIcon, new LinearLayout.LayoutParams(dpToPx(36), dpToPx(36)));

        // Texts
        LinearLayout textCol = new LinearLayout(this);
        textCol.setOrientation(LinearLayout.VERTICAL);
        textCol.setPadding(dpToPx(10), 0, dpToPx(8), 0);

        final TextView tvTitle = new TextView(this);
        tvTitle.setText(title);
        tvTitle.setTextSize(13.5f);
        tvTitle.setTypeface(Typeface.DEFAULT_BOLD);
        tvTitle.setTextColor(Color.WHITE);
        textCol.addView(tvTitle);

        final TextView tvSub = new TextView(this);
        tvSub.setText(subtitle);
        tvSub.setTextSize(11f);
        tvSub.setTextColor(0xFF94A3B8);
        textCol.addView(tvSub);

        card.addView(textCol, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

        // Chevron
        final TextView tvChevron = new TextView(this);
        tvChevron.setText("›");
        tvChevron.setTextSize(18f);
        tvChevron.setTextColor(0xFF64748B);
        card.addView(tvChevron);

        card.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) card.getBackground();
            if (hasFocus) {
                d.setColor(0xFF0284C7);
                d.setStroke(dpToPx(2), Color.WHITE);
                card.setScaleX(1.02f);
                card.setScaleY(1.02f);
                tvTitle.setTextColor(Color.WHITE);
                tvSub.setTextColor(0xFFE0F2FE);
                tvChevron.setTextColor(Color.WHITE);
            } else {
                d.setColor(0xFF1E293B);
                d.setStroke(dpToPx(1), 0xFF334155);
                card.setScaleX(1.0f);
                card.setScaleY(1.0f);
                tvTitle.setTextColor(Color.WHITE);
                tvSub.setTextColor(0xFF94A3B8);
                tvChevron.setTextColor(0xFF64748B);
            }
        });

        card.setOnClickListener(onClick);
        card.setOnKeyListener((v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
                card.performClick();
                return true;
            }
            return false;
        });

        return card;
    }

    // =============================================================================================
    // CATEGORY & CHANNEL ORDER MANAGER
    // =============================================================================================
    private String activeManagerType = "live";

    private void showCategoryManagerDialog() {
        if (isFinishing() || isDestroyed()) return;

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dpToPx(20), dpToPx(16), dpToPx(20), dpToPx(16));
        root.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);

        GradientDrawable rootBg = new GradientDrawable();
        rootBg.setColor(0xFF0F172A);
        rootBg.setCornerRadius(dpToPx(16));
        rootBg.setStroke(dpToPx(1), 0xFF334155);
        root.setBackground(rootBg);

        // Header Title
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView tvTitle = new TextView(this);
        tvTitle.setText("📁 ORGANISER LES BOUQUETS & CHAÎNES");
        tvTitle.setTextSize(16f);
        tvTitle.setTypeface(Typeface.DEFAULT_BOLD);
        tvTitle.setTextColor(Color.WHITE);
        header.addView(tvTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

        // Reset button
        TextView btnReset = new TextView(this);
        btnReset.setText("🔄 Réinitialiser l'ordre");
        btnReset.setTextSize(12f);
        btnReset.setTypeface(Typeface.DEFAULT_BOLD);
        btnReset.setTextColor(0xFF38BDF8);
        btnReset.setPadding(dpToPx(10), dpToPx(6), dpToPx(10), dpToPx(6));
        btnReset.setFocusable(true);
        GradientDrawable rBg = new GradientDrawable();
        rBg.setColor(0xFF0C4A6E);
        rBg.setCornerRadius(dpToPx(8));
        rBg.setStroke(dpToPx(1), 0xFF0284C7);
        btnReset.setBackground(rBg);
        header.addView(btnReset);

        root.addView(header);

        // Tabs Row: Direct TV / Films VOD / Séries TV
        LinearLayout tabsRow = new LinearLayout(this);
        tabsRow.setOrientation(LinearLayout.HORIZONTAL);
        tabsRow.setPadding(0, dpToPx(12), 0, dpToPx(12));

        final TextView tabLive = createManagerTab("📺 Direct TV", "live".equals(activeManagerType));
        final TextView tabVod = createManagerTab("🎬 Films VOD", "vod".equals(activeManagerType));
        final TextView tabSeries = createManagerTab("🍿 Séries TV", "series".equals(activeManagerType));

        tabsRow.addView(tabLive);
        tabsRow.addView(tabVod);
        tabsRow.addView(tabSeries);
        root.addView(tabsRow);

        // Scrollable List Container
        ScrollView sv = new ScrollView(this);
        sv.setFocusable(false);
        sv.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        LinearLayout.LayoutParams svLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(380));
        final LinearLayout listContainer = new LinearLayout(this);
        listContainer.setOrientation(LinearLayout.VERTICAL);
        sv.addView(listContainer);
        root.addView(sv, svLp);

        // Bottom Close button
        TextView btnClose = new TextView(this);
        btnClose.setText("Fermer & Appliquer");
        btnClose.setTextSize(13f);
        btnClose.setTypeface(Typeface.DEFAULT_BOLD);
        btnClose.setTextColor(0xFF94A3B8);
        btnClose.setGravity(Gravity.CENTER);
        btnClose.setPadding(dpToPx(16), dpToPx(10), dpToPx(16), dpToPx(10));
        btnClose.setFocusable(true);
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(0xFF1E293B);
        closeBg.setCornerRadius(dpToPx(8));
        btnClose.setBackground(closeBg);
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        closeLp.topMargin = dpToPx(10);
        root.addView(btnClose, closeLp);

        final AlertDialog dialog = builder.setView(root).create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }

        btnClose.setOnClickListener(v -> dialog.dismiss());
        btnClose.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btnClose.getBackground();
            if (hasFocus) {
                d.setColor(0xFF334155);
                d.setStroke(dpToPx(2), Color.WHITE);
                btnClose.setTextColor(Color.WHITE);
            } else {
                d.setColor(0xFF1E293B);
                d.setStroke(0, Color.TRANSPARENT);
                btnClose.setTextColor(0xFF94A3B8);
            }
        });

        dialog.setOnDismissListener(d -> loadLocalData());

        // Refresh List logic
        final Runnable refreshList = new Runnable() {
            @Override
            public void run() {
                updateManagerTabStyle(tabLive, "live".equals(activeManagerType));
                updateManagerTabStyle(tabVod, "vod".equals(activeManagerType));
                updateManagerTabStyle(tabSeries, "series".equals(activeManagerType));

                new Thread(() -> {
                    final List<KeoDatabase.CategoryItem> categories = db.getAllCategoriesForManager(activeManagerType);
                    runOnUiThread(() -> {
                        listContainer.removeAllViews();
                        if (categories.isEmpty()) {
                            TextView emptyTv = new TextView(MainActivity.this);
                            emptyTv.setText("Aucun bouquet trouvé dans cette section");
                            emptyTv.setTextColor(0xFF94A3B8);
                            emptyTv.setPadding(dpToPx(16), dpToPx(20), dpToPx(16), dpToPx(20));
                            listContainer.addView(emptyTv);
                            return;
                        }

                        for (int i = 0; i < categories.size(); i++) {
                            final int index = i;
                            final KeoDatabase.CategoryItem cat = categories.get(i);
                            final KeoDatabase.CategoryItem prevCat = (i > 0) ? categories.get(i - 1) : null;
                            final KeoDatabase.CategoryItem nextCat = (i < categories.size() - 1) ? categories.get(i + 1) : null;

                            LinearLayout row = new LinearLayout(MainActivity.this);
                            row.setOrientation(LinearLayout.HORIZONTAL);
                            row.setGravity(Gravity.CENTER_VERTICAL);
                            row.setPadding(dpToPx(12), dpToPx(8), dpToPx(12), dpToPx(8));
                            row.setFocusable(false);

                            GradientDrawable rowBg = new GradientDrawable();
                            rowBg.setColor(cat.isHidden ? 0x221E293B : 0xFF1E293B);
                            rowBg.setCornerRadius(dpToPx(8));
                            rowBg.setStroke(dpToPx(1), cat.isHidden ? 0xFF1E293B : 0xFF334155);
                            row.setBackground(rowBg);

                            LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                            rowLp.setMargins(0, dpToPx(3), 0, dpToPx(3));
                            row.setLayoutParams(rowLp);

                            // Category Name + Count
                            TextView tvCatName = new TextView(MainActivity.this);
                            tvCatName.setText((index + 1) + ". " + cat.name + (cat.count > 0 ? " (" + cat.count + ")" : ""));
                            tvCatName.setTextSize(13f);
                            tvCatName.setTypeface(Typeface.DEFAULT_BOLD);
                            tvCatName.setTextColor(cat.isHidden ? 0xFF64748B : Color.WHITE);
                            row.addView(tvCatName, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

                            // Action: Move Up ▲
                            TextView btnUp = createManagerMiniBtn("▲", v -> {
                                if (prevCat != null) {
                                    db.swapCategoryOrder(cat.id, cat.customOrder, prevCat.id, prevCat.customOrder);
                                    run();
                                }
                            });
                            btnUp.setEnabled(prevCat != null);
                            btnUp.setAlpha(prevCat != null ? 1.0f : 0.3f);
                            row.addView(btnUp);

                            // Action: Move Down ▼
                            TextView btnDown = createManagerMiniBtn("▼", v -> {
                                if (nextCat != null) {
                                    db.swapCategoryOrder(cat.id, cat.customOrder, nextCat.id, nextCat.customOrder);
                                    run();
                                }
                            });
                            btnDown.setEnabled(nextCat != null);
                            btnDown.setAlpha(nextCat != null ? 1.0f : 0.3f);
                            row.addView(btnDown);

                            // Action: Hide / Show 👁️
                            TextView btnEye = createManagerMiniBtn(cat.isHidden ? "🙈" : "👁️", v -> {
                                db.toggleCategoryHidden(cat.id, !cat.isHidden);
                                run();
                            });
                            row.addView(btnEye);

                            // Action: Channels 📋
                            TextView btnChannels = createManagerMiniBtn("📋 Chaînes", v -> {
                                showChannelManagerDialog(cat);
                            });
                            row.addView(btnChannels);

                            listContainer.addView(row);
                        }
                    });
                }).start();
            }
        };

        tabLive.setOnClickListener(v -> { activeManagerType = "live"; refreshList.run(); });
        tabVod.setOnClickListener(v -> { activeManagerType = "vod"; refreshList.run(); });
        tabSeries.setOnClickListener(v -> { activeManagerType = "series"; refreshList.run(); });

        btnReset.setOnClickListener(v -> {
            new AlertDialog.Builder(this)
                    .setTitle("Réinitialiser l'ordre")
                    .setMessage("Voulez-vous rétablir l'ordre d'origine pour ces bouquets ?")
                    .setPositiveButton("Réinitialiser", (d, w) -> {
                        db.resetCategoryOrder(activeManagerType);
                        Toast.makeText(MainActivity.this, "Ordre réinitialisé", Toast.LENGTH_SHORT).show();
                        refreshList.run();
                    })
                    .setNegativeButton("Annuler", null)
                    .show();
        });

        dialog.show();
        refreshList.run();
        dialog.setOnShowListener(d -> {
            tabLive.post(() -> tabLive.requestFocus());
        });
    }

    private TextView createManagerTab(String title, boolean active) {
        TextView tab = new TextView(this);
        tab.setText(title);
        tab.setTextSize(13f);
        tab.setTypeface(Typeface.DEFAULT_BOLD);
        tab.setFocusable(true);
        tab.setGravity(Gravity.CENTER);
        tab.setPadding(dpToPx(14), dpToPx(8), dpToPx(14), dpToPx(8));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
        lp.setMargins(dpToPx(4), 0, dpToPx(4), 0);
        tab.setLayoutParams(lp);
        updateManagerTabStyle(tab, active);
        tab.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                tab.setScaleX(1.05f);
                tab.setScaleY(1.05f);
            } else {
                tab.setScaleX(1.0f);
                tab.setScaleY(1.0f);
            }
        });
        return tab;
    }

    private void updateManagerTabStyle(TextView tab, boolean active) {
        GradientDrawable d = new GradientDrawable();
        if (active) {
            d.setColor(0xFF0284C7);
            d.setStroke(dpToPx(2), Color.WHITE);
            tab.setTextColor(Color.WHITE);
        } else {
            d.setColor(0xFF1E293B);
            d.setStroke(dpToPx(1), 0xFF334155);
            tab.setTextColor(0xFF94A3B8);
        }
        d.setCornerRadius(dpToPx(8));
        tab.setBackground(d);
    }

    private TextView createManagerMiniBtn(String text, View.OnClickListener onClick) {
        TextView btn = new TextView(this);
        btn.setText(text);
        btn.setTextSize(12f);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setTextColor(0xFFE2E8F0);
        btn.setGravity(Gravity.CENTER);
        btn.setFocusable(true);
        btn.setPadding(dpToPx(10), dpToPx(6), dpToPx(10), dpToPx(6));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF334155);
        bg.setCornerRadius(dpToPx(6));
        btn.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dpToPx(3), 0, dpToPx(3), 0);
        btn.setLayoutParams(lp);
        btn.setOnClickListener(onClick);
        btn.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btn.getBackground();
            if (hasFocus) {
                d.setColor(0xFF0284C7);
                d.setStroke(dpToPx(2), Color.WHITE);
                btn.setTextColor(Color.WHITE);
                btn.setScaleX(1.1f);
                btn.setScaleY(1.1f);
            } else {
                d.setColor(0xFF334155);
                d.setStroke(0, Color.TRANSPARENT);
                btn.setTextColor(0xFFE2E8F0);
                btn.setScaleX(1.0f);
                btn.setScaleY(1.0f);
            }
        });
        btn.setOnKeyListener((v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
                btn.performClick();
                return true;
            }
            return false;
        });
        return btn;
    }

    private void showChannelManagerDialog(final KeoDatabase.CategoryItem cat) {
        if (cat == null || isFinishing() || isDestroyed()) return;

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dpToPx(20), dpToPx(16), dpToPx(20), dpToPx(16));
        root.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);

        GradientDrawable rootBg = new GradientDrawable();
        rootBg.setColor(0xFF0F172A);
        rootBg.setCornerRadius(dpToPx(16));
        rootBg.setStroke(dpToPx(1), 0xFF334155);
        root.setBackground(rootBg);

        TextView tvTitle = new TextView(this);
        tvTitle.setText("📋 CHAÎNES : " + cat.name.toUpperCase());
        tvTitle.setTextSize(15f);
        tvTitle.setTypeface(Typeface.DEFAULT_BOLD);
        tvTitle.setTextColor(Color.WHITE);
        tvTitle.setPadding(0, 0, 0, dpToPx(10));
        root.addView(tvTitle);

        ScrollView sv = new ScrollView(this);
        sv.setFocusable(false);
        sv.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        LinearLayout.LayoutParams svLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(380));
        final LinearLayout listContainer = new LinearLayout(this);
        listContainer.setOrientation(LinearLayout.VERTICAL);
        sv.addView(listContainer);
        root.addView(sv, svLp);

        TextView btnClose = new TextView(this);
        btnClose.setText("Retour aux bouquets");
        btnClose.setTextSize(13f);
        btnClose.setTypeface(Typeface.DEFAULT_BOLD);
        btnClose.setTextColor(0xFF94A3B8);
        btnClose.setGravity(Gravity.CENTER);
        btnClose.setPadding(dpToPx(16), dpToPx(10), dpToPx(16), dpToPx(10));
        btnClose.setFocusable(true);
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(0xFF1E293B);
        closeBg.setCornerRadius(dpToPx(8));
        btnClose.setBackground(closeBg);
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        closeLp.topMargin = dpToPx(10);
        root.addView(btnClose, closeLp);

        final AlertDialog dialog = builder.setView(root).create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }
        btnClose.setOnClickListener(v -> dialog.dismiss());
        btnClose.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btnClose.getBackground();
            if (hasFocus) {
                d.setColor(0xFF334155);
                d.setStroke(dpToPx(2), Color.WHITE);
                btnClose.setTextColor(Color.WHITE);
            } else {
                d.setColor(0xFF1E293B);
                d.setStroke(0, Color.TRANSPARENT);
                btnClose.setTextColor(0xFF94A3B8);
            }
        });

        final Runnable refreshChannels = new Runnable() {
            @Override
            public void run() {
                new Thread(() -> {
                    final List<KeoDatabase.ChannelItem> channels = db.getChannelsByGroup(cat.id);
                    runOnUiThread(() -> {
                        listContainer.removeAllViews();
                        if (channels.isEmpty()) {
                            TextView emptyTv = new TextView(MainActivity.this);
                            emptyTv.setText("Aucune chaîne trouvée dans ce bouquet");
                            emptyTv.setTextColor(0xFF94A3B8);
                            emptyTv.setPadding(dpToPx(16), dpToPx(20), dpToPx(16), dpToPx(20));
                            listContainer.addView(emptyTv);
                            return;
                        }

                        for (int i = 0; i < channels.size(); i++) {
                            final int index = i;
                            final KeoDatabase.ChannelItem ch = channels.get(i);
                            final KeoDatabase.ChannelItem prevCh = (i > 0) ? channels.get(i - 1) : null;
                            final KeoDatabase.ChannelItem nextCh = (i < channels.size() - 1) ? channels.get(i + 1) : null;

                            LinearLayout row = new LinearLayout(MainActivity.this);
                            row.setOrientation(LinearLayout.HORIZONTAL);
                            row.setGravity(Gravity.CENTER_VERTICAL);
                            row.setPadding(dpToPx(12), dpToPx(8), dpToPx(12), dpToPx(8));
                            row.setFocusable(false);

                            GradientDrawable rowBg = new GradientDrawable();
                            rowBg.setColor(0xFF1E293B);
                            rowBg.setCornerRadius(dpToPx(8));
                            rowBg.setStroke(dpToPx(1), 0xFF334155);
                            row.setBackground(rowBg);

                            LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                            rowLp.setMargins(0, dpToPx(3), 0, dpToPx(3));
                            row.setLayoutParams(rowLp);

                            TextView tvChName = new TextView(MainActivity.this);
                            tvChName.setText((index + 1) + ". " + ch.name);
                            tvChName.setTextSize(13f);
                            tvChName.setTypeface(Typeface.DEFAULT_BOLD);
                            tvChName.setTextColor(Color.WHITE);
                            row.addView(tvChName, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

                            // Action: Move Up ▲
                            TextView btnUp = createManagerMiniBtn("▲", v -> {
                                if (prevCh != null) {
                                    db.swapChannelOrder(ch.id, ch.num, prevCh.id, prevCh.num);
                                    run();
                                }
                            });
                            btnUp.setEnabled(prevCh != null);
                            btnUp.setAlpha(prevCh != null ? 1.0f : 0.3f);
                            row.addView(btnUp);

                            // Action: Move Down ▼
                            TextView btnDown = createManagerMiniBtn("▼", v -> {
                                if (nextCh != null) {
                                    db.swapChannelOrder(ch.id, ch.num, nextCh.id, nextCh.num);
                                    run();
                                }
                            });
                            btnDown.setEnabled(nextCh != null);
                            btnDown.setAlpha(nextCh != null ? 1.0f : 0.3f);
                            row.addView(btnDown);

                            // Action: Favorite Star
                            TextView btnStar = createManagerMiniBtn(ch.isFav ? "⭐" : "☆", v -> {
                                db.toggleFavorite(ch.id);
                                run();
                            });
                            row.addView(btnStar);

                            listContainer.addView(row);
                        }
                    });
                }).start();
            }
        };

        dialog.show();
        refreshChannels.run();
    }

    private void showDonationsAndFeedbackDialog() {
        if (isFinishing() || isDestroyed()) return;

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dpToPx(22), dpToPx(18), dpToPx(22), dpToPx(18));
        GradientDrawable rootBg = new GradientDrawable();
        rootBg.setColor(0xFF0F172A);
        rootBg.setCornerRadius(dpToPx(16));
        rootBg.setStroke(dpToPx(1), 0xFF334155);
        root.setBackground(rootBg);

        // Header
        TextView tvTitle = new TextView(this);
        tvTitle.setText("💖 SOUTENIR LE PROJET KEOTV");
        tvTitle.setTextSize(17f);
        tvTitle.setTypeface(Typeface.DEFAULT_BOLD);
        tvTitle.setTextColor(Color.WHITE);
        root.addView(tvTitle);

        TextView tvSub = new TextView(this);
        tvSub.setText("KeoTV est entièrement gratuit, open-source et sans publicité.\nUn don symbolique aide grandement à financer l'infrastructure et encourager le développement !");
        tvSub.setTextSize(12f);
        tvSub.setTextColor(0xFF94A3B8);
        tvSub.setPadding(0, dpToPx(6), 0, dpToPx(16));
        root.addView(tvSub);

        ScrollView sv = new ScrollView(this);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);

        // Card 1: Soutenir / Dons
        LinearLayout cardDons = new LinearLayout(this);
        cardDons.setOrientation(LinearLayout.VERTICAL);
        cardDons.setPadding(dpToPx(16), dpToPx(14), dpToPx(16), dpToPx(14));
        GradientDrawable cardDonsBg = new GradientDrawable();
        cardDonsBg.setColor(0xFF1E293B);
        cardDonsBg.setCornerRadius(dpToPx(12));
        cardDonsBg.setStroke(dpToPx(1), 0xFFE11D48); // Rose border
        cardDons.setBackground(cardDonsBg);

        TextView tvDonsHead = new TextView(this);
        tvDonsHead.setText("💝 Faire un Don / Soutenir");
        tvDonsHead.setTextSize(14f);
        tvDonsHead.setTypeface(Typeface.DEFAULT_BOLD);
        tvDonsHead.setTextColor(0xFFFB7185);
        cardDons.addView(tvDonsHead);

        TextView tvDonsDesc = new TextView(this);
        tvDonsDesc.setText("Votre contribution permet de payer l'hébergement du cloud et encourage les nouvelles fonctionnalités.");
        tvDonsDesc.setTextSize(11.5f);
        tvDonsDesc.setTextColor(0xFFCBD5E1);
        tvDonsDesc.setPadding(0, dpToPx(4), 0, dpToPx(12));
        cardDons.addView(tvDonsDesc);

        LinearLayout donsButtonsRow = new LinearLayout(this);
        donsButtonsRow.setOrientation(LinearLayout.HORIZONTAL);

        TextView btnSponsors = createDialogActionButton("💖 GitHub Sponsors", 0xFFE11D48, v -> openWebUrl("https://github.com/sponsors/heyhacene"));
        LinearLayout.LayoutParams spLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
        spLp.setMarginEnd(dpToPx(8));
        donsButtonsRow.addView(btnSponsors, spLp);

        TextView btnPaypal = createDialogActionButton("☕ PayPal", 0xFF0284C7, v -> openWebUrl("https://paypal.me/hacenebouk"));
        LinearLayout.LayoutParams ppLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
        donsButtonsRow.addView(btnPaypal, ppLp);

        cardDons.addView(donsButtonsRow);
        content.addView(cardDons);

        // Spacer
        View spacer = new View(this);
        content.addView(spacer, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(14)));

        // Card 2: Feedback & Bugs
        LinearLayout cardFeedback = new LinearLayout(this);
        cardFeedback.setOrientation(LinearLayout.VERTICAL);
        cardFeedback.setPadding(dpToPx(16), dpToPx(14), dpToPx(16), dpToPx(14));
        GradientDrawable cardFbBg = new GradientDrawable();
        cardFbBg.setColor(0xFF1E293B);
        cardFbBg.setCornerRadius(dpToPx(12));
        cardFbBg.setStroke(dpToPx(1), 0xFF0284C7); // Cyan border
        cardFeedback.setBackground(cardFbBg);

        TextView tvFbHead = new TextView(this);
        tvFbHead.setText("💬 Retours & Signalement de Bugs");
        tvFbHead.setTextSize(14f);
        tvFbHead.setTypeface(Typeface.DEFAULT_BOLD);
        tvFbHead.setTextColor(0xFF38BDF8);
        cardFeedback.addView(tvFbHead);

        TextView tvFbDesc = new TextView(this);
        tvFbDesc.setText("Vous avez rencontré un bug ou vous souhaitez suggérer une amélioration ? Faites-le nous savoir :");
        tvFbDesc.setTextSize(11.5f);
        tvFbDesc.setTextColor(0xFFCBD5E1);
        tvFbDesc.setPadding(0, dpToPx(4), 0, dpToPx(12));
        cardFeedback.addView(tvFbDesc);

        LinearLayout fbButtonsRow = new LinearLayout(this);
        fbButtonsRow.setOrientation(LinearLayout.HORIZONTAL);

        TextView btnGithubIssues = createDialogActionButton("🐞 GitHub Issues", 0xFF334155, v -> openWebUrl("https://github.com/heyhacene/keotv/issues"));
        LinearLayout.LayoutParams ghLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
        ghLp.setMarginEnd(dpToPx(8));
        fbButtonsRow.addView(btnGithubIssues, ghLp);

        TextView btnEmail = createDialogActionButton("📧 Par Email", 0xFF047857, v -> {
            try {
                Intent emailIntent = new Intent(Intent.ACTION_SENDTO);
                emailIntent.setData(Uri.parse("mailto:heyhacene@gmail.com"));
                emailIntent.putExtra(Intent.EXTRA_SUBJECT, "[KeoTV Android] Retour & Suggestions");
                startActivity(Intent.createChooser(emailIntent, "Envoyer un email"));
            } catch (Exception e) {
                openWebUrl("mailto:heyhacene@gmail.com");
            }
        });
        LinearLayout.LayoutParams emLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
        fbButtonsRow.addView(btnEmail, emLp);

        cardFeedback.addView(fbButtonsRow);
        content.addView(cardFeedback);

        sv.addView(content);
        root.addView(sv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f));

        final AlertDialog dialog = builder.setView(root).create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }

        // Bottom Close button
        TextView btnClose = new TextView(this);
        btnClose.setText("Fermer");
        btnClose.setTextSize(13f);
        btnClose.setTypeface(Typeface.DEFAULT_BOLD);
        btnClose.setTextColor(0xFF94A3B8);
        btnClose.setGravity(Gravity.CENTER);
        btnClose.setPadding(dpToPx(16), dpToPx(10), dpToPx(16), dpToPx(10));
        btnClose.setFocusable(true);
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(0xFF1E293B);
        closeBg.setCornerRadius(dpToPx(8));
        btnClose.setBackground(closeBg);
        btnClose.setOnClickListener(v -> dialog.dismiss());
        btnClose.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btnClose.getBackground();
            if (hasFocus) {
                d.setColor(0xFF334155);
                d.setStroke(dpToPx(2), Color.WHITE);
                btnClose.setTextColor(Color.WHITE);
            } else {
                d.setColor(0xFF1E293B);
                d.setStroke(0, Color.TRANSPARENT);
                btnClose.setTextColor(0xFF94A3B8);
            }
        });
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        closeLp.topMargin = dpToPx(12);
        root.addView(btnClose, closeLp);

        dialog.show();
    }

    private TextView createDialogActionButton(String label, int bgColor, View.OnClickListener onClick) {
        final TextView btn = new TextView(this);
        btn.setText(label);
        btn.setTextSize(11.5f);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setTextColor(Color.WHITE);
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dpToPx(12), dpToPx(8), dpToPx(12), dpToPx(8));
        btn.setFocusable(true);
        btn.setFocusableInTouchMode(true);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(bgColor);
        bg.setCornerRadius(dpToPx(8));
        btn.setBackground(bg);
        btn.setOnClickListener(onClick);

        btn.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btn.getBackground();
            if (hasFocus) {
                d.setStroke(dpToPx(2), Color.WHITE);
                btn.setScaleX(1.05f);
                btn.setScaleY(1.05f);
            } else {
                d.setStroke(0, Color.TRANSPARENT);
                btn.setScaleX(1.0f);
                btn.setScaleY(1.0f);
            }
        });
        btn.setOnKeyListener((v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
                btn.performClick();
                return true;
            }
            return false;
        });
        return btn;
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
            int old = this.selectedPos;
            this.selectedPos = pos;
            if (old >= 0 && old < items.size()) notifyItemChanged(old);
            if (pos >= 0 && pos < items.size() && pos != old) notifyItemChanged(pos);
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
                    pendingCategoryToLoad = null;
                    mainHandler.removeCallbacks(categoryDebounceRunnable);
                    wantFocusChannelsOnCategoryLoad = true;
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
                    int pos = holder.getBindingAdapterPosition();
                    if (pos == RecyclerView.NO_POSITION) pos = position;
                    int total = items.size();

                    if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                        return handleCategoryCarouselDown(pos, total);
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                        return handleCategoryCarouselUp(pos, total);
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        focusActiveSidebarButton();
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        if (event.getRepeatCount() == 0) {
                            if (pendingCategoryToLoad != null) {
                                KeoDatabase.CategoryItem catToLoad = pendingCategoryToLoad;
                                pendingCategoryToLoad = null;
                                mainHandler.removeCallbacks(categoryDebounceRunnable);
                                wantFocusChannelsOnCategoryLoad = true;
                                selectCategory(catToLoad);
                            } else if (channelsAdapter != null && channelsAdapter.getItemCount() > 0) {
                                focusChannelsList();
                            } else {
                                wantFocusChannelsOnCategoryLoad = true;
                            }
                        }
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
        public static final int VIEW_TYPE_LIVE = 0;
        public static final int VIEW_TYPE_VOD_GRID = 1;

        private final List<KeoDatabase.ChannelItem> items = new ArrayList<>();
        private int selectedPos = 0;
        private boolean isVodGrid = false;
        private int gridSpanCount = 5;
        private RecyclerView attachedRecyclerView = null;

        @Override
        public void onAttachedToRecyclerView(@NonNull RecyclerView recyclerView) {
            super.onAttachedToRecyclerView(recyclerView);
            this.attachedRecyclerView = recyclerView;
        }

        public RecyclerView getTargetRecyclerView() {
            if (attachedRecyclerView != null) return attachedRecyclerView;
            if ("search".equals(currentType)) return recyclerSearchResults;
            return recyclerChannels;
        }

        public void setVodGridMode(boolean enabled, int spanCount) {
            int newSpan = spanCount > 0 ? spanCount : 5;
            if (this.isVodGrid == enabled && this.gridSpanCount == newSpan) {
                return;
            }
            this.isVodGrid = enabled;
            this.gridSpanCount = newSpan;
            notifyDataSetChanged();
        }

        public boolean isVodGrid() {
            return isVodGrid;
        }

        public void setItems(List<KeoDatabase.ChannelItem> newItems) {
            items.clear();
            items.addAll(newItems);
            selectedPos = 0;
            notifyDataSetChanged();
        }

        public void appendItems(List<KeoDatabase.ChannelItem> moreItems) {
            if (moreItems == null || moreItems.isEmpty()) return;
            int startPos = items.size();
            items.addAll(moreItems);
            notifyItemRangeInserted(startPos, moreItems.size());
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
            int old = this.selectedPos;
            this.selectedPos = pos;
            if (old >= 0 && old < items.size()) notifyItemChanged(old);
            if (pos >= 0 && pos < items.size() && pos != old) notifyItemChanged(pos);
        }

        public List<KeoDatabase.ChannelItem> getItems() {
            return items;
        }

        @Override
        public int getItemViewType(int position) {
            if (isVodGrid) {
                return VIEW_TYPE_VOD_GRID;
            }
            return VIEW_TYPE_LIVE;
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            if (viewType == VIEW_TYPE_VOD_GRID) {
                View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_vod_card, parent, false);
                return new ViewHolder(v, true);
            } else {
                View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_channel, parent, false);
                return new ViewHolder(v, false);
            }
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            KeoDatabase.ChannelItem item = items.get(position);
            holder.isTimelineMode = false;
            holder.pendingActivatePast = false;
            holder.pendingActivateFuture = false;
            holder.leftLongPressTriggered = false;
            if (holder.leftLongPressRunnable != null) {
                holder.itemView.removeCallbacks(holder.leftLongPressRunnable);
                holder.leftLongPressRunnable = null;
            }

            if (holder.isVod) {
                // --- VOD / SERIES POSTER CARD (TiviMate 7-Poster Grid) ---
                if (holder.tvTitle != null) {
                    holder.tvTitle.setText(item.name != null ? item.name : "");
                }
                if (holder.tvBadge != null) {
                    holder.tvBadge.setText(item.resolution != null && !item.resolution.isEmpty() ? item.resolution : "HD");
                }
                if (holder.tvFav != null) {
                    holder.tvFav.setVisibility(item.isFav ? View.VISIBLE : View.GONE);
                }
                if (holder.ivPoster != null) {
                    if (item.logo != null && !item.logo.isEmpty()) {
                        ImageLoader.load(holder.itemView.getContext(), item.logo, holder.ivPoster, R.drawable.bg_poster_placeholder);
                    } else {
                        holder.ivPoster.setImageResource(R.drawable.bg_poster_placeholder);
                    }
                }

                holder.itemView.setSelected(selectedPos == position);

                holder.itemView.setOnClickListener(v -> {
                    int pos = holder.getBindingAdapterPosition();
                    if (pos != RecyclerView.NO_POSITION) {
                        selectedPos = pos;
                        selectChannel(item);
                        if ("series".equals(item.streamType)) {
                            showSeriesDetailDialog(item);
                        } else {
                            showMovieDetailDialog(item);
                        }
                    }
                });

                holder.itemView.setOnLongClickListener(v -> {
                    int pos = holder.getBindingAdapterPosition();
                    if (pos != RecyclerView.NO_POSITION) {
                        selectedPos = pos;
                        selectChannel(item);
                        if ("series".equals(item.streamType)) {
                            showSeriesDetailDialog(item);
                        } else {
                            showMovieDetailDialog(item);
                        }
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
                            updateVodHeroBanner(item, pos, items.size());
                        }
                    }
                });

                holder.itemView.setOnKeyListener((v, keyCode, event) -> {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) {
                        int pos = holder.getBindingAdapterPosition();
                        if (pos == RecyclerView.NO_POSITION) return false;

                        int span = gridSpanCount > 0 ? gridSpanCount : 5;
                        int total = items.size();

                        if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                            if (pos + 1 < total) {
                                focusRecyclerViewItem(getTargetRecyclerView(), pos + 1);
                            }
                            return true; // Strictly consume! Never let focus escape
                        } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                            if ("search".equals(currentType) || getTargetRecyclerView() == recyclerSearchResults) {
                                focusActiveSidebarButton();
                                return true;
                            }
                            if ((pos % span) == 0) {
                                // 1st item in row: return directly to bouquet list!
                                focusCategoriesList();
                            } else if (pos - 1 >= 0) {
                                focusRecyclerViewItem(getTargetRecyclerView(), pos - 1);
                            }
                            return true; // Strictly consume!
                        } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                            return handleCarouselDown(getTargetRecyclerView(), pos, total, true);
                        } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                            return handleCarouselUp(getTargetRecyclerView(), pos, total, true);
                        }
                    }
                    return false;
                });

            } else {
                // --- LIVE CHANNEL ROW (TiviMate Horizontal Timeline Row) ---
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

                boolean isSearchList = (getTargetRecyclerView() == recyclerSearchResults) || "search".equals(currentType);
                boolean isLiveOrReplay = !isSearchList && ("live".equals(item.streamType) || "replay".equals(currentType));

                if (isLiveOrReplay && holder.layoutEpgTimeline != null) {
                    holder.layoutEpgTimeline.setVisibility(View.VISIBLE);
                    if (holder.tvEpg != null) holder.tvEpg.setVisibility(View.GONE);

                    holder.itemView.setFocusable(true);
                    holder.itemView.setClickable(true);
                    holder.itemView.setSelected(selectedPos == position);

                    // Fetch and bind timeline
                    List<XtreamClient.EpgProgram> progs = epgProgramsCache.get(item.id);
                    if (progs != null && !progs.isEmpty()) {
                        XtreamClient.EpgProgram cur = getCurrentProgram(item);
                        holder.bindTimeline(item, progs, cur != null ? cur.title : item.name);
                    } else {
                        holder.bindTimeline(item, null, item.name);
                    }

                    final int pos = position;
                    final int total = items.size();

                    holder.itemView.setOnFocusChangeListener((v, hasFocus) -> {
                        if (hasFocus) {
                            holder.itemView.setSelected(true);
                            selectedPos = holder.getBindingAdapterPosition();
                            selectChannel(item);
                            if (!holder.isTimelineMode) {
                                XtreamClient.EpgProgram cur = getCurrentProgram(item);
                                updateLiveHeroBanner(item, cur, false, true, false);
                                holder.scrollToProgram(holder.currentProgramIndex, false);
                            }
                        } else {
                            if (holder.leftLongPressRunnable != null) {
                                holder.itemView.removeCallbacks(holder.leftLongPressRunnable);
                            }
                            holder.leftLongPressTriggered = false;
                            if (holder.isTimelineMode) {
                                holder.deactivateTimeline();
                            }
                        }
                    });

                    holder.itemView.setOnClickListener(v -> {
                        if (holder.isTimelineMode) {
                            XtreamClient.EpgProgram p = holder.getSelectedProgram();
                            long nowSec = System.currentTimeMillis() / 1000L;
                            if (p != null && p.stopTimestamp > 0 && p.stopTimestamp < nowSec) {
                                // Past program -> Launch Replay!
                                KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
                                if (pl != null) {
                                    playCatchupStream(item, p, pl);
                                } else {
                                    Toast.makeText(MainActivity.this, "Compte non configuré pour le replay", Toast.LENGTH_SHORT).show();
                                }
                            } else {
                                // Current or future program -> deactivate timeline and launch live channel!
                                holder.deactivateTimeline();
                                selectChannel(item);
                                launchPlayerFullscreen();
                            }
                        } else {
                            selectChannel(item);
                            launchPlayerFullscreen();
                        }
                    });

                    holder.itemView.setOnKeyListener((v, keyCode, event) -> {
                        int curPos = holder.getBindingAdapterPosition();
                        if (curPos == RecyclerView.NO_POSITION) curPos = pos;

                        if (event.getAction() == KeyEvent.ACTION_DOWN) {
                            if (!holder.isTimelineMode) {
                                // NORMAL CHANNEL BROWSING MODE
                                if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                                    return handleCarouselUp(getTargetRecyclerView(), curPos, total, false);
                                } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                                    return handleCarouselDown(getTargetRecyclerView(), curPos, total, false);
                                } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                                    if ("search".equals(currentType) || getTargetRecyclerView() == recyclerSearchResults) {
                                        return true;
                                    }
                                    if (event.getRepeatCount() == 0) {
                                        // DPAD_RIGHT: Explore future programs on timeline
                                        holder.activateTimelineFuture();
                                    }
                                    return true;
                                } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                                    if ("search".equals(currentType) || getTargetRecyclerView() == recyclerSearchResults) {
                                        focusActiveSidebarButton();
                                        return true;
                                    }
                                    if (event.getRepeatCount() == 0) {
                                        holder.leftLongPressTriggered = false;
                                        if (holder.leftLongPressRunnable != null) {
                                            holder.itemView.removeCallbacks(holder.leftLongPressRunnable);
                                        }
                                        holder.leftLongPressRunnable = () -> {
                                            holder.leftLongPressTriggered = true;
                                            holder.activateTimelinePast();
                                        };
                                        holder.itemView.postDelayed(holder.leftLongPressRunnable, 350);
                                        return true; // Consume so focus doesn't immediately leave channel row
                                    } else if (event.getRepeatCount() >= 1) {
                                        if (!holder.leftLongPressTriggered) {
                                            holder.leftLongPressTriggered = true;
                                            if (holder.leftLongPressRunnable != null) {
                                                holder.itemView.removeCallbacks(holder.leftLongPressRunnable);
                                            }
                                            holder.activateTimelinePast();
                                        }
                                        return true;
                                    }
                                    return true;
                                }
                            } else {
                                // TIMELINE EXPLORATION MODE (TiviMate horizontal ribbon navigation)
                                if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                                    return holder.timelineStepRight();
                                } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                                    return holder.timelineStepLeft();
                                } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                                    holder.deactivateTimeline();
                                    return handleCarouselUp(getTargetRecyclerView(), curPos, total, false);
                                } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                                    holder.deactivateTimeline();
                                    return handleCarouselDown(getTargetRecyclerView(), curPos, total, false);
                                } else if (keyCode == KeyEvent.KEYCODE_BACK) {
                                    holder.deactivateTimeline();
                                    return true;
                                }
                            }
                        } else if (event.getAction() == KeyEvent.ACTION_UP) {
                            if (!holder.isTimelineMode && keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                                if ("search".equals(currentType) || getTargetRecyclerView() == recyclerSearchResults) {
                                    return true;
                                }
                                if (holder.leftLongPressRunnable != null) {
                                    holder.itemView.removeCallbacks(holder.leftLongPressRunnable);
                                }
                                if (!holder.leftLongPressTriggered) {
                                    // Short tap: return to bouquets list!
                                    focusCategoriesList();
                                }
                                holder.leftLongPressTriggered = false;
                                return true;
                            }
                        }
                        return false;
                    });

                } else {
                    // Fallback when timeline not active (e.g. non-live list in live mode, or search results)
                    holder.itemView.setFocusable(true);
                    holder.itemView.setClickable(true);
                    holder.itemView.setSelected(selectedPos == position);
                    if (holder.layoutEpgTimeline != null) holder.layoutEpgTimeline.setVisibility(View.GONE);
                    if (holder.tvEpg != null) {
                        holder.tvEpg.setVisibility(View.VISIBLE);
                        String typeLabel = "📺 DIRECT";
                        if ("vod".equals(item.streamType)) typeLabel = "🎬 FILM";
                        else if ("series".equals(item.streamType)) typeLabel = "🍿 SÉRIE";
                        String grp = (item.groupName != null && !item.groupName.isEmpty()) ? (" • " + item.groupName) : "";
                        holder.tvEpg.setText(typeLabel + grp);
                    }
                    holder.itemView.setOnFocusChangeListener((v, hasFocus) -> {
                        if (hasFocus) {
                            holder.itemView.setSelected(true);
                            selectedPos = holder.getBindingAdapterPosition();
                            selectChannel(item);
                        }
                    });
                    holder.itemView.setOnClickListener(v -> {
                        selectChannel(item);
                        launchPlayerFullscreen();
                    });
                    holder.itemView.setOnKeyListener((v, keyCode, event) -> {
                        if (event.getAction() == KeyEvent.ACTION_DOWN) {
                            int curPos = holder.getBindingAdapterPosition();
                            if (curPos == RecyclerView.NO_POSITION) return false;
                            if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                                return handleCarouselUp(getTargetRecyclerView(), curPos, items.size(), false);
                            } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                                return handleCarouselDown(getTargetRecyclerView(), curPos, items.size(), false);
                            } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                                if ("search".equals(currentType) || getTargetRecyclerView() == recyclerSearchResults) {
                                    focusActiveSidebarButton();
                                } else {
                                    focusCategoriesList();
                                }
                                return true;
                            } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                                return true;
                            }
                        }
                        return false;
                    });
                }
            }
        }

        @Override
        public int getItemCount() {
            return items.size();
        }

        @Override
        public void onViewRecycled(@NonNull ViewHolder holder) {
            super.onViewRecycled(holder);
            if (holder.isVod && holder.ivPoster != null) {
                ImageLoader.clear(holder.ivPoster);
            } else if (holder.ivLogo != null) {
                ImageLoader.clear(holder.ivLogo);
            }
        }

        class ViewHolder extends RecyclerView.ViewHolder {
            final boolean isVod;

            // Live fields
            TextView tvNum, tvName, tvRes, tvFavStar, tvReplayBadge, tvEpg;
            ImageView ivLogo;
            HorizontalScrollView layoutEpgTimeline;
            LinearLayout layoutEpgSlots;

            // Timeline navigation state
            boolean isTimelineMode = false;
            int selectedTimelineIndex = -1;
            int currentProgramIndex = -1;
            boolean pendingActivatePast = false;
            boolean pendingActivateFuture = false;
            Runnable leftLongPressRunnable = null;
            boolean leftLongPressTriggered = false;
            final List<XtreamClient.EpgProgram> cachedPrograms = new ArrayList<>();
            final List<View> slotViews = new ArrayList<>();
            KeoDatabase.ChannelItem boundChannel = null;

            // VOD fields
            ImageView ivPoster;
            TextView tvBadge;
            TextView tvFav;
            TextView tvTitle;

            ViewHolder(View v, boolean isVod) {
                super(v);
                this.isVod = isVod;
                if (isVod) {
                    ivPoster = v.findViewById(R.id.iv_vod_poster);
                    tvBadge = v.findViewById(R.id.tv_vod_badge);
                    tvFav = v.findViewById(R.id.tv_vod_fav);
                    tvTitle = v.findViewById(R.id.tv_vod_title);
                } else {
                    tvNum = v.findViewById(R.id.tv_channel_num);
                    ivLogo = v.findViewById(R.id.iv_channel_logo);
                    tvName = v.findViewById(R.id.tv_channel_name);
                    tvRes = v.findViewById(R.id.tv_channel_res);
                    tvFavStar = v.findViewById(R.id.tv_channel_fav_star);
                    tvReplayBadge = v.findViewById(R.id.tv_channel_replay_badge);
                    tvEpg = v.findViewById(R.id.tv_channel_epg);
                    layoutEpgTimeline = v.findViewById(R.id.layout_epg_timeline);
                    layoutEpgSlots = v.findViewById(R.id.layout_epg_slots);
                }
            }

            public void bindTimeline(KeoDatabase.ChannelItem ch, List<XtreamClient.EpgProgram> progs, String fallbackTitle) {
                this.boundChannel = ch;
                if (layoutEpgTimeline == null || layoutEpgSlots == null) return;
                layoutEpgSlots.removeAllViews();
                slotViews.clear();
                cachedPrograms.clear();

                long nowSec = System.currentTimeMillis() / 1000L;
                currentProgramIndex = -1;

                if (progs != null && !progs.isEmpty()) {
                    int rawCurIdx = -1;
                    long closestDiff = Long.MAX_VALUE;
                    for (int i = 0; i < progs.size(); i++) {
                        XtreamClient.EpgProgram p = progs.get(i);
                        if (nowSec >= p.startTimestamp && nowSec <= p.stopTimestamp) {
                            rawCurIdx = i;
                            break;
                        }
                        long diff = Math.abs(nowSec - p.startTimestamp);
                        if (diff < closestDiff) {
                            closestDiff = diff;
                            rawCurIdx = i;
                        }
                    }
                    if (rawCurIdx == -1) rawCurIdx = 0;

                    // Window: up to 10 past programs, current, and up to 6 future programs
                    int startWindow = Math.max(0, rawCurIdx - 10);
                    int endWindow = Math.min(progs.size(), rawCurIdx + 7);
                    for (int i = startWindow; i < endWindow; i++) {
                        cachedPrograms.add(progs.get(i));
                    }
                    currentProgramIndex = rawCurIdx - startWindow;
                } else {
                    XtreamClient.EpgProgram directProg = new XtreamClient.EpgProgram();
                    directProg.title = fallbackTitle != null ? fallbackTitle : (ch != null ? ch.name : "Direct");
                    directProg.start = "Direct";
                    directProg.startTimestamp = nowSec - 1800;
                    directProg.stopTimestamp = nowSec + 1800;
                    directProg.startMs = directProg.startTimestamp * 1000L;
                    directProg.stopMs = directProg.stopTimestamp * 1000L;
                    cachedPrograms.add(directProg);
                    currentProgramIndex = 0;
                }

                boolean channelHasReplay = (ch != null && ch.tvArchive == 1) || "replay".equals(currentType);

                LayoutInflater inflater = LayoutInflater.from(itemView.getContext());
                for (int i = 0; i < cachedPrograms.size(); i++) {
                    XtreamClient.EpgProgram p = cachedPrograms.get(i);
                    View slot = inflater.inflate(R.layout.item_epg_slot, layoutEpgSlots, false);
                    slot.setFocusable(false);
                    slot.setClickable(false);

                    TextView tvTime = slot.findViewById(R.id.tv_slot_time);
                    TextView tvTitle = slot.findViewById(R.id.tv_slot_title);
                    TextView tvBadge = slot.findViewById(R.id.tv_slot_badge);
                    ProgressBar pb = slot.findViewById(R.id.pb_slot_progress);

                    String t = p.getFormattedTime();
                    if (t != null && !t.isEmpty()) {
                        tvTime.setText(t);
                    } else if (p.start != null && p.start.length() >= 16) {
                        tvTime.setText(p.start.substring(11, 16));
                    } else {
                        tvTime.setText(p.start != null ? p.start : "");
                    }

                    tvTitle.setText(p.title != null ? p.title : "");

                    boolean isCurrent = (i == currentProgramIndex);
                    boolean isPast = (p.stopTimestamp > 0 && p.stopTimestamp < nowSec);
                    boolean hasReplay = channelHasReplay || p.hasArchive;

                    if (isCurrent) {
                        tvBadge.setVisibility(View.VISIBLE);
                        tvBadge.setText("● DIRECT");
                        tvBadge.setTextColor(0xFF38BDF8);
                        pb.setVisibility(View.VISIBLE);
                        long totalSec = p.stopTimestamp - p.startTimestamp;
                        if (totalSec > 0) {
                            int pct = (int) Math.max(0, Math.min(100, ((nowSec - p.startTimestamp) * 100) / totalSec));
                            pb.setProgress(pct);
                        }
                    } else if (isPast && hasReplay) {
                        tvBadge.setVisibility(View.VISIBLE);
                        tvBadge.setText("🔄 REPLAY");
                        tvBadge.setTextColor(0xFF10B981);
                        pb.setVisibility(View.GONE);
                    } else {
                        tvBadge.setVisibility(View.GONE);
                        pb.setVisibility(View.GONE);
                    }

                    layoutEpgSlots.addView(slot);
                    slotViews.add(slot);
                }

                if (!isTimelineMode) {
                    selectedTimelineIndex = currentProgramIndex;
                }
                updateTimelineCardHighlights();
                scrollToProgram(selectedTimelineIndex, false);
            }

            public void updateTimelineCardHighlights() {
                long nowSec = System.currentTimeMillis() / 1000L;
                boolean channelHasReplay = (boundChannel != null && boundChannel.tvArchive == 1) || "replay".equals(currentType);
                for (int i = 0; i < slotViews.size(); i++) {
                    View slot = slotViews.get(i);
                    TextView tvTitle = slot.findViewById(R.id.tv_slot_title);
                    TextView tvTime = slot.findViewById(R.id.tv_slot_time);
                    XtreamClient.EpgProgram p = (i >= 0 && i < cachedPrograms.size()) ? cachedPrograms.get(i) : null;
                    boolean isPast = p != null && p.stopTimestamp > 0 && p.stopTimestamp < nowSec;
                    boolean isReplay = isPast && (channelHasReplay || (p != null && p.hasArchive));

                    if (isTimelineMode && i == selectedTimelineIndex) {
                        GradientDrawable bg = new GradientDrawable();
                        bg.setCornerRadius(dpToPx(6));
                        if (isReplay) {
                            bg.setColor(0xFF064E3B); // Deep emerald for replay
                            bg.setStroke(dpToPx(2), 0xFF10B981); // Bright emerald border
                        } else {
                            bg.setColor(0xFF1E3A8A); // Blue for future / direct
                            bg.setStroke(dpToPx(2), 0xFF38BDF8);
                        }
                        slot.setBackground(bg);
                        slot.setScaleX(1.05f);
                        slot.setScaleY(1.05f);
                        if (tvTitle != null) tvTitle.setTextColor(0xFFFFFFFF);
                        if (tvTime != null) tvTime.setTextColor(isReplay ? 0xFFA7F3D0 : 0xFFBAE6FD);
                    } else if (!isTimelineMode && i == currentProgramIndex) {
                        GradientDrawable bg = new GradientDrawable();
                        bg.setCornerRadius(dpToPx(6));
                        bg.setColor(0xFF1E293B);
                        bg.setStroke(dpToPx(1), 0xFF38BDF8);
                        slot.setBackground(bg);
                        slot.setScaleX(1.0f);
                        slot.setScaleY(1.0f);
                        if (tvTitle != null) tvTitle.setTextColor(0xFFF8FAFC);
                        if (tvTime != null) tvTime.setTextColor(0xFF94A3B8);
                    } else {
                        GradientDrawable bg = new GradientDrawable();
                        bg.setCornerRadius(dpToPx(6));
                        bg.setColor(0xFF0F172A);
                        bg.setStroke(dpToPx(1), 0xFF1E293B);
                        slot.setBackground(bg);
                        slot.setScaleX(1.0f);
                        slot.setScaleY(1.0f);
                        if (tvTitle != null) tvTitle.setTextColor(0xFFCBD5E1);
                        if (tvTime != null) tvTime.setTextColor(0xFF64748B);
                    }
                }
            }

            public void scrollToProgram(int index, boolean smooth) {
                if (layoutEpgTimeline == null || index < 0 || index >= slotViews.size()) return;
                layoutEpgTimeline.post(() -> {
                    if (layoutEpgTimeline == null || index < 0 || index >= slotViews.size()) return;
                    View targetView = slotViews.get(index);
                    if (targetView != null) {
                        int scrollX = targetView.getLeft() - (layoutEpgTimeline.getWidth() / 3);
                        if (smooth) {
                            layoutEpgTimeline.smoothScrollTo(Math.max(0, scrollX), 0);
                        } else {
                            layoutEpgTimeline.scrollTo(Math.max(0, scrollX), 0);
                        }
                    }
                });
            }

            public void activateTimelinePast() {
                if (boundChannel != null) {
                    List<XtreamClient.EpgProgram> progs = epgProgramsCache.get(boundChannel.id);
                    if (progs != null && !progs.isEmpty() && cachedPrograms.size() <= 1) {
                        bindTimeline(boundChannel, progs, boundChannel.name);
                    } else if (cachedPrograms.size() <= 1) {
                        pendingActivatePast = true;
                        fetchEpgForChannel(boundChannel);
                        Toast.makeText(itemView.getContext(), "Chargement du Replay...", Toast.LENGTH_SHORT).show();
                        return;
                    }
                }
                isTimelineMode = true;
                if (currentProgramIndex > 0) {
                    selectedTimelineIndex = currentProgramIndex - 1;
                } else {
                    selectedTimelineIndex = 0;
                }
                updateTimelineCardHighlights();
                scrollToProgram(selectedTimelineIndex, true);
                notifyProgramSelection();
            }

            public void activateTimelineFuture() {
                if (boundChannel != null) {
                    List<XtreamClient.EpgProgram> progs = epgProgramsCache.get(boundChannel.id);
                    if (progs != null && !progs.isEmpty() && cachedPrograms.size() <= 1) {
                        bindTimeline(boundChannel, progs, boundChannel.name);
                    } else if (cachedPrograms.size() <= 1) {
                        pendingActivateFuture = true;
                        fetchEpgForChannel(boundChannel);
                        Toast.makeText(itemView.getContext(), "Chargement du guide TV...", Toast.LENGTH_SHORT).show();
                        return;
                    }
                }
                isTimelineMode = true;
                if (currentProgramIndex < cachedPrograms.size() - 1) {
                    selectedTimelineIndex = currentProgramIndex + 1;
                } else {
                    selectedTimelineIndex = currentProgramIndex;
                }
                updateTimelineCardHighlights();
                scrollToProgram(selectedTimelineIndex, true);
                notifyProgramSelection();
            }

            public boolean timelineStepRight() {
                if (!isTimelineMode || cachedPrograms.isEmpty()) return false;
                if (selectedTimelineIndex < cachedPrograms.size() - 1) {
                    selectedTimelineIndex++;
                    updateTimelineCardHighlights();
                    scrollToProgram(selectedTimelineIndex, true);
                    notifyProgramSelection();
                }
                return true;
            }

            public boolean timelineStepLeft() {
                if (!isTimelineMode || cachedPrograms.isEmpty()) return false;
                if (selectedTimelineIndex > 0) {
                    selectedTimelineIndex--;
                    updateTimelineCardHighlights();
                    scrollToProgram(selectedTimelineIndex, true);
                    notifyProgramSelection();
                    return true;
                } else if (selectedTimelineIndex == 0) {
                    deactivateTimeline();
                    focusCategoriesList();
                    return true;
                }
                return true;
            }

            public void deactivateTimeline() {
                if (!isTimelineMode) return;
                isTimelineMode = false;
                selectedTimelineIndex = currentProgramIndex;
                updateTimelineCardHighlights();
                scrollToProgram(currentProgramIndex, true);
                if (boundChannel != null) {
                    XtreamClient.EpgProgram cur = getCurrentProgram(boundChannel);
                    updateLiveHeroBanner(boundChannel, cur, false, true, false);
                }
            }

            public XtreamClient.EpgProgram getSelectedProgram() {
                if (selectedTimelineIndex >= 0 && selectedTimelineIndex < cachedPrograms.size()) {
                    return cachedPrograms.get(selectedTimelineIndex);
                }
                return null;
            }

            private void notifyProgramSelection() {
                if (boundChannel == null) return;
                XtreamClient.EpgProgram p = getSelectedProgram();
                if (p != null) {
                    long nowSec = System.currentTimeMillis() / 1000L;
                    boolean isPast = (p.stopTimestamp > 0 && p.stopTimestamp < nowSec);
                    boolean isNext = (p.startTimestamp > nowSec);
                    boolean isCurrent = !isPast && !isNext;
                    updateLiveHeroBanner(boundChannel, p, isPast, isCurrent, isNext);
                }
            }
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // 0. If in timeline mode on a channel row, deactivate timeline and consume back
            if (recyclerChannels != null && recyclerChannels.getLayoutManager() != null) {
                View focused = recyclerChannels.findFocus();
                if (focused != null) {
                    RecyclerView.ViewHolder vh = recyclerChannels.findContainingViewHolder(focused);
                    if (vh instanceof ChannelsAdapter.ViewHolder) {
                        ChannelsAdapter.ViewHolder cvh = (ChannelsAdapter.ViewHolder) vh;
                        if (cvh.isTimelineMode) {
                            cvh.deactivateTimeline();
                            return true;
                        }
                    }
                }
            }
            if ("search".equals(currentType)) {
                if (recyclerSearchResults != null && recyclerSearchResults.hasFocus()) {
                    focusSearchFilterOrInput();
                    return true;
                }
                if ((btnSearchFilterAll != null && btnSearchFilterAll.hasFocus()) ||
                    (btnSearchFilterLive != null && btnSearchFilterLive.hasFocus()) ||
                    (btnSearchFilterVod != null && btnSearchFilterVod.hasFocus()) ||
                    (btnSearchFilterSeries != null && btnSearchFilterSeries.hasFocus()) ||
                    (btnSearchBackspace != null && btnSearchBackspace.hasFocus()) ||
                    (btnSearchClear != null && btnSearchClear.hasFocus())) {
                    stopContinuousBackspace();
                    if (etGlobalSearch != null) etGlobalSearch.requestFocus();
                    return true;
                }
                if (etGlobalSearch != null && etGlobalSearch.hasFocus()) {
                    stopContinuousBackspace();
                    focusActiveSidebarButton();
                    return true;
                }
                switchSection("live");
                focusActiveSidebarButton();
                return true;
            }
            if (isVodGridMode) {
                exitVodBouquetGrid();
                return true;
            }
            if (etSearch != null && etSearch.hasFocus()) {
                if (etSearch.getText() != null && etSearch.getText().length() > 0) {
                    etSearch.setText("");
                }
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
