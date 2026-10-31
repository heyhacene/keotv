package fr.keo.tv;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Full screen native player (ExoPlayer / Media3) optimized for Android TV remote controls.
 * - Live TV: Clean screen, no transport seekbars or pause buttons covering the stream.
 * - VOD / Series: Skip intro pill (+85s) and 10s auto-next episode countdown overlay with cancel option.
 * - Per-series audio & subtitle preference persistence.
 * - Up / Down / Channel +/- arrows zap seamlessly between channels or episodes.
 * - OK / Center button toggles the sleek channel info banner.
 * - Channel info banner automatically animates in and fades out after 3.5 seconds.
 * - Back button cleanly returns to the KeoTV TV guide.
 */
@UnstableApi
public class PlayerActivity extends AppCompatActivity {
    public static boolean isPlayerActivityActive = false;

    public static List<String> pendingUrls = new ArrayList<>();
    public static List<String> pendingTitles = new ArrayList<>();
    public static int pendingIndex = 0;
    public static String pendingUserAgent = "IPTVSmartersPro/3.1.5 (Linux; Android 12)";
    public static boolean pendingIsLive = true;
    public static String pendingSeriesId = null;
    public static String pendingPreferredAudio = null;
    public static String pendingPreferredSubtitle = null;
    public static long pendingStartPositionMs = 0L;
    public static boolean pendingForceRestart = false;
    public static boolean pendingSingleStreamMode = false;
    public static String pendingCurrentProgramTitle = null;
    public static String pendingCurrentProgramDesc = null;
    public static String pendingCurrentProgramTime = null;
    public static String pendingNextProgramTitle = null;
    public static List<String> pendingEpgTitles = new ArrayList<>();
    public static List<String> pendingEpgDescs = new ArrayList<>();
    public static List<String> pendingEpgTimes = new ArrayList<>();
    public static List<String> pendingEpgNextTitles = new ArrayList<>();
    public static int pendingOsdTimeoutMs = 5000;
    public static String pendingEpgOverlayPosition = "bottom";

    public static final String PREFS_POSITIONS = "keotv_playback_positions";
    public static final String KEY_POSITIONS_JSON = "positions_json";

    private ExoPlayer player;
    private boolean singleStreamMode = false;

    // Rich EPG info overlay views
    private LinearLayout epgOverlayCard;
    private TextView epgNowTitle;
    private TextView epgNowTime;
    private TextView epgNowDesc;
    private TextView epgNextTitle;

    public static class EpgItem {
        public final String title;
        public final String time;
        public final String desc;
        public final String next;
        public EpgItem(String title, String time, String desc, String next) {
            this.title = title;
            this.time = time;
            this.desc = desc;
            this.next = next;
        }
    }

    private final Map<Integer, EpgItem> dynamicEpgCache = new ConcurrentHashMap<>();
    private final ExecutorService epgFetchExecutor = Executors.newSingleThreadExecutor();

    // Zap prefetch: a hidden second ExoPlayer pre-buffers the adjacent channel so zapping is a surface swap
    private ExoPlayer prefetchPlayer;
    private int prefetchTargetIdx = -1;
    private long prefetchPreparedAtMs = 0L;
    private int lastZapDirection = 1;
    private Player.Listener playerListener;
    private static final long PREFETCH_MAX_AGE_MS = 20000L;
    private final Runnable prefetchRunnable = () -> startPrefetch();
    private PlayerView playerView;
    private LinearLayout osdContainer;
    private TextView badgeView;
    private TextView titleView;
    private TextView indexView;
    private TextView errorView;
    private final Set<Integer> triedTsFallback = new HashSet<>();
    private boolean isLive = true;
    private boolean isReplayCascade = false;

    // Skip intro & Next episode overlays
    private TextView skipIntroBtn;
    private LinearLayout nextEpisodeCard;
    private TextView nextCountdownText;
    private TextView nextEpisodeTitleText;
    private TextView btnPlayNextNow;
    private TextView btnCancelNext;

    private boolean introSkippedForCurrent = false;
    private boolean introAutoHiddenForCurrent = false;
    private long introShownAtMs = 0L;
    private boolean nextEpisodeDismissed = false;
    private int nextEpisodeCountdownSeconds = 10;
    private boolean isCountdownActive = false;
    private long lastSavedPositionAtMs = 0L;

    private TextView btnExit;

    // Bottom Controls Bar (Scrollable for mobile and TV)
    private HorizontalScrollView bottomControlsHsv;
    private LinearLayout bottomControls;
    private TextView btnPrevChannel;
    private TextView btnPlayPause;
    private TextView btnNextChannel;
    private TextView btnAudioTrack;
    private TextView btnSubtitles;
    private TextView btnAspectRatio;

    // Center Feedback Toast Card for Zapping & Options
    private LinearLayout zapFeedbackCard;
    private TextView zapFeedbackTitle;
    private TextView zapFeedbackSub;
    private final Handler zapHandler = new Handler(Looper.getMainLooper());

    private GestureDetector gestureDetector;
    private int currentResizeModeIndex = 0;
    private static final int[] RESIZE_MODES = new int[]{
            AspectRatioFrameLayout.RESIZE_MODE_FIT,
            AspectRatioFrameLayout.RESIZE_MODE_FILL,
            AspectRatioFrameLayout.RESIZE_MODE_ZOOM
    };
    private static final String[] RESIZE_MODE_NAMES = new String[]{
            "Ajusté (16:9)",
            "Plein écran (Étiré)",
            "Zoom (Sans bandes)"
    };

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Handler osdHandler = new Handler(Looper.getMainLooper());

    private final Runnable hideOsdRunnable = new Runnable() {
        @Override
        public void run() {
            if (osdContainer != null) {
                osdContainer.animate()
                        .alpha(0f)
                        .setDuration(300)
                        .withEndAction(() -> {
                            if (osdContainer != null) osdContainer.setVisibility(View.GONE);
                        });
            }
            if (bottomControlsHsv != null) {
                bottomControlsHsv.animate()
                        .alpha(0f)
                        .setDuration(300)
                        .withEndAction(() -> {
                            if (bottomControlsHsv != null) bottomControlsHsv.setVisibility(View.GONE);
                        });
            }
            if (epgOverlayCard != null) {
                float targetTranslationY = "top".equalsIgnoreCase(pendingEpgOverlayPosition) ? -dp(8) : dp(8);
                epgOverlayCard.animate()
                        .alpha(0f)
                        .translationY(targetTranslationY)
                        .setDuration(250)
                        .withEndAction(() -> {
                            if (epgOverlayCard != null) epgOverlayCard.setVisibility(View.GONE);
                        });
            }
        }
    };

    private final Runnable hideZapRunnable = new Runnable() {
        @Override
        public void run() {
            if (zapFeedbackCard != null) {
                zapFeedbackCard.animate().alpha(0f).scaleX(0.9f).scaleY(0.9f).setDuration(250)
                        .withEndAction(() -> {
                            if (zapFeedbackCard != null) zapFeedbackCard.setVisibility(View.GONE);
                        });
            }
        }
    };

    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            if (player != null && !isLive) {
                checkPlaybackProgress();
            }
            mainHandler.postDelayed(this, 1000);
        }
    };

    private final Runnable countdownTickRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isCountdownActive || player == null) return;
            nextEpisodeCountdownSeconds--;
            if (nextCountdownText != null) {
                nextCountdownText.setText("ÉPISODE SUIVANT DANS " + nextEpisodeCountdownSeconds + "s...");
            }
            if (nextEpisodeCountdownSeconds <= 0) {
                launchNextEpisode();
            } else {
                mainHandler.postDelayed(this, 1000);
            }
        }
    };

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private TextView createOsdButton(String text, View.OnClickListener listener) {
        TextView btn = new TextView(this);
        btn.setText(text);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(12f);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setPadding(dp(14), dp(8), dp(14), dp(8));
        btn.setFocusable(true);
        btn.setFocusableInTouchMode(true);
        btn.setGravity(Gravity.CENTER);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#CC1E293B"));
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), Color.parseColor("#334155"));
        btn.setBackground(bg);

        btn.setOnClickListener(v -> {
            showOsd();
            listener.onClick(v);
        });

        btn.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btn.getBackground();
            if (hasFocus) {
                d.setColor(Color.parseColor("#FF0284C7"));
                d.setStroke(dp(2), Color.WHITE);
                btn.setScaleX(1.05f);
                btn.setScaleY(1.05f);
            } else {
                d.setColor(Color.parseColor("#CC1E293B"));
                d.setStroke(dp(1), Color.parseColor("#334155"));
                btn.setScaleX(1.0f);
                btn.setScaleY(1.0f);
            }
        });

        return btn;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        isPlayerActivityActive = true;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
        isLive = pendingIsLive;
        singleStreamMode = pendingSingleStreamMode;

        // Auto orientation: Landscape on TV, Sensor-based on Mobile/Tablet
        UiModeManager uiModeManager = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        boolean isTv = (uiModeManager != null && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION);
        if (isTv) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        if (isLive) {
            playerView.setUseController(false);
        } else {
            playerView.setUseController(true);
            playerView.setShowNextButton(true);
            playerView.setShowPreviousButton(true);
            playerView.setControllerShowTimeoutMs(3000);
            playerView.setControllerAutoShow(false);
        }
        root.addView(playerView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Modern On-Screen Display (OSD) top banner with gradient
        osdContainer = new LinearLayout(this);
        osdContainer.setOrientation(LinearLayout.HORIZONTAL);
        osdContainer.setGravity(Gravity.CENTER_VERTICAL);
        osdContainer.setPadding(dp(24), dp(16), dp(24), dp(16));

        GradientDrawable osdBg = new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.parseColor("#E6090D16"), Color.parseColor("#99090D16"), Color.TRANSPARENT}
        );
        osdContainer.setBackground(osdBg);

        // Badge indicator
        badgeView = new TextView(this);
        badgeView.setText(isLive ? "DIRECT TV" : (pendingSeriesId != null && !pendingSeriesId.isEmpty() ? "SÉRIE" : "VOD"));
        badgeView.setTextColor(Color.parseColor("#38BDF8"));
        badgeView.setTextSize(11f);
        badgeView.setTypeface(Typeface.DEFAULT_BOLD);
        badgeView.setPadding(dp(10), dp(4), dp(10), dp(4));
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.parseColor("#2638BDF8"));
        badgeBg.setCornerRadius(dp(8));
        badgeBg.setStroke(dp(1), Color.parseColor("#4D38BDF8"));
        badgeView.setBackground(badgeBg);
        osdContainer.addView(badgeView);

        // Title text
        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(18f);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setShadowLayer(8f, 0f, 0f, Color.BLACK);
        titleView.setPadding(dp(14), 0, dp(14), 0);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
        osdContainer.addView(titleView, titleParams);

        // Channel index counter
        indexView = new TextView(this);
        indexView.setTextColor(Color.parseColor("#94A3B8"));
        indexView.setTextSize(13f);
        indexView.setTypeface(Typeface.MONOSPACE);
        osdContainer.addView(indexView);

        // Tactile Close Button (Back to TV Guide on mobile and TV)
        btnExit = createOsdButton("✕  Fermer", v -> finish());
        LinearLayout.LayoutParams exitParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        exitParams.setMarginStart(dp(14));
        btnExit.setLayoutParams(exitParams);
        osdContainer.addView(btnExit);

        root.addView(osdContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        // Rich EPG info overlay card (semi-transparent glass, shows current & next program on TV/Mobile without interrupting stream)
        epgOverlayCard = new LinearLayout(this);
        epgOverlayCard.setOrientation(LinearLayout.VERTICAL);
        epgOverlayCard.setPadding(dp(16), dp(10), dp(16), dp(10));
        GradientDrawable epgCardBg = new GradientDrawable();
        epgCardBg.setColor(Color.parseColor("#73090E17")); // sleek translucent dark glass (45% opacity)
        epgCardBg.setCornerRadius(dp(14));
        epgCardBg.setStroke(dp(1), Color.parseColor("#3338BDF8"));
        epgOverlayCard.setBackground(epgCardBg);
        epgOverlayCard.setVisibility(View.GONE);

        // Header: Now Playing badge + Time
        LinearLayout epgHeaderRow = new LinearLayout(this);
        epgHeaderRow.setOrientation(LinearLayout.HORIZONTAL);
        epgHeaderRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView epgNowBadge = new TextView(this);
        epgNowBadge.setText("EN CE MOMENT");
        epgNowBadge.setTextColor(Color.parseColor("#38BDF8"));
        epgNowBadge.setTextSize(10f);
        epgNowBadge.setTypeface(Typeface.DEFAULT_BOLD);
        epgNowBadge.setPadding(dp(8), dp(3), dp(8), dp(3));
        GradientDrawable nowBg = new GradientDrawable();
        nowBg.setColor(Color.parseColor("#2638BDF8"));
        nowBg.setCornerRadius(dp(6));
        epgNowBadge.setBackground(nowBg);
        epgHeaderRow.addView(epgNowBadge);

        epgNowTime = new TextView(this);
        epgNowTime.setTextColor(Color.parseColor("#94A3B8"));
        epgNowTime.setTextSize(11f);
        epgNowTime.setTypeface(Typeface.MONOSPACE);
        epgNowTime.setPadding(dp(10), 0, 0, 0);
        epgHeaderRow.addView(epgNowTime);
        epgOverlayCard.addView(epgHeaderRow);

        // Current program title
        epgNowTitle = new TextView(this);
        epgNowTitle.setTextColor(Color.WHITE);
        epgNowTitle.setTextSize(15f);
        epgNowTitle.setTypeface(Typeface.DEFAULT_BOLD);
        epgNowTitle.setPadding(0, dp(6), 0, dp(4));
        epgNowTitle.setMaxLines(2);
        epgNowTitle.setEllipsize(TextUtils.TruncateAt.END);
        epgOverlayCard.addView(epgNowTitle);

        // Current program description
        epgNowDesc = new TextView(this);
        epgNowDesc.setTextColor(Color.parseColor("#CBD5E1"));
        epgNowDesc.setTextSize(12f);
        epgNowDesc.setMaxLines(2);
        epgNowDesc.setEllipsize(TextUtils.TruncateAt.END);
        epgNowDesc.setPadding(0, 0, 0, dp(6));
        epgOverlayCard.addView(epgNowDesc);

        // Next program summary row
        epgNextTitle = new TextView(this);
        epgNextTitle.setTextColor(Color.parseColor("#94A3B8"));
        epgNextTitle.setTextSize(11f);
        epgNextTitle.setMaxLines(1);
        epgNextTitle.setEllipsize(TextUtils.TruncateAt.END);
        epgOverlayCard.addView(epgNextTitle);

        boolean isTopOverlay = "top".equalsIgnoreCase(pendingEpgOverlayPosition);
        int screenWidthDp = getResources().getConfiguration().screenWidthDp;
        int cardWidth = (screenWidthDp < 560) ? ViewGroup.LayoutParams.MATCH_PARENT : dp(480);

        FrameLayout.LayoutParams epgCardLp;
        if (isTopOverlay) {
            epgCardLp = new FrameLayout.LayoutParams(
                    cardWidth, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
            epgCardLp.setMargins(dp(16), dp(72), dp(16), 0);
        } else {
            epgCardLp = new FrameLayout.LayoutParams(
                    cardWidth, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
            epgCardLp.setMargins(dp(16), 0, dp(16), dp(84));
        }
        root.addView(epgOverlayCard, epgCardLp);

        // Skip intro button (Strictly Series episodes only, bottom right, auto-hides after 7s)
        skipIntroBtn = new TextView(this);
        skipIntroBtn.setText("⏩  Passer l'intro (+85s)");
        skipIntroBtn.setTextColor(Color.WHITE);
        skipIntroBtn.setTextSize(14f);
        skipIntroBtn.setTypeface(Typeface.DEFAULT_BOLD);
        skipIntroBtn.setPadding(dp(20), dp(10), dp(20), dp(10));
        skipIntroBtn.setFocusable(true);
        skipIntroBtn.setFocusableInTouchMode(true);

        GradientDrawable skipIntroBg = new GradientDrawable();
        skipIntroBg.setColor(Color.parseColor("#E60F172A"));
        skipIntroBg.setCornerRadius(dp(16));
        skipIntroBg.setStroke(dp(2), Color.parseColor("#38BDF8"));
        skipIntroBtn.setBackground(skipIntroBg);
        skipIntroBtn.setVisibility(View.GONE);
        skipIntroBtn.setOnClickListener(v -> performSkipIntro());
        skipIntroBtn.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable bg = (GradientDrawable) skipIntroBtn.getBackground();
            if (hasFocus) {
                bg.setColor(Color.parseColor("#FF0284C7"));
                bg.setStroke(dp(2), Color.WHITE);
                skipIntroBtn.setScaleX(1.06f);
                skipIntroBtn.setScaleY(1.06f);
            } else {
                bg.setColor(Color.parseColor("#E60F172A"));
                bg.setStroke(dp(2), Color.parseColor("#38BDF8"));
                skipIntroBtn.setScaleX(1.0f);
                skipIntroBtn.setScaleY(1.0f);
            }
        });

        FrameLayout.LayoutParams skipParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.END);
        skipParams.setMargins(0, 0, dp(32), dp(64));
        root.addView(skipIntroBtn, skipParams);

        // Next Episode countdown card (bottom right)
        nextEpisodeCard = new LinearLayout(this);
        nextEpisodeCard.setOrientation(LinearLayout.VERTICAL);
        nextEpisodeCard.setPadding(dp(24), dp(18), dp(24), dp(18));
        nextEpisodeCard.setVisibility(View.GONE);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#F20F172A"));
        cardBg.setCornerRadius(dp(16));
        cardBg.setStroke(dp(2), Color.parseColor("#0284C7"));
        nextEpisodeCard.setBackground(cardBg);

        // Header: Countdown
        nextCountdownText = new TextView(this);
        nextCountdownText.setText("ÉPISODE SUIVANT DANS 10s...");
        nextCountdownText.setTextColor(Color.parseColor("#38BDF8"));
        nextCountdownText.setTextSize(12f);
        nextCountdownText.setTypeface(Typeface.DEFAULT_BOLD);
        nextEpisodeCard.addView(nextCountdownText);

        // Next Episode Title
        nextEpisodeTitleText = new TextView(this);
        nextEpisodeTitleText.setTextColor(Color.WHITE);
        nextEpisodeTitleText.setTextSize(16f);
        nextEpisodeTitleText.setTypeface(Typeface.DEFAULT_BOLD);
        nextEpisodeTitleText.setMaxLines(2);
        nextEpisodeTitleText.setEllipsize(TextUtils.TruncateAt.END);
        nextEpisodeTitleText.setPadding(0, dp(6), 0, dp(14));
        nextEpisodeCard.addView(nextEpisodeTitleText);

        // Buttons row
        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);

        btnPlayNextNow = new TextView(this);
        btnPlayNextNow.setText("▶  Lancer maintenant");
        btnPlayNextNow.setTextColor(Color.WHITE);
        btnPlayNextNow.setTextSize(13f);
        btnPlayNextNow.setTypeface(Typeface.DEFAULT_BOLD);
        btnPlayNextNow.setPadding(dp(16), dp(10), dp(16), dp(10));
        btnPlayNextNow.setFocusable(true);
        btnPlayNextNow.setFocusableInTouchMode(true);
        GradientDrawable playBg = new GradientDrawable();
        playBg.setColor(Color.parseColor("#0284C7"));
        playBg.setCornerRadius(dp(10));
        btnPlayNextNow.setBackground(playBg);
        btnPlayNextNow.setOnClickListener(v -> launchNextEpisode());
        btnPlayNextNow.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable bg = (GradientDrawable) btnPlayNextNow.getBackground();
            if (hasFocus) {
                bg.setStroke(dp(2), Color.WHITE);
                btnPlayNextNow.setScaleX(1.05f);
                btnPlayNextNow.setScaleY(1.05f);
            } else {
                bg.setStroke(0, Color.TRANSPARENT);
                btnPlayNextNow.setScaleX(1.0f);
                btnPlayNextNow.setScaleY(1.0f);
            }
        });
        btnRow.addView(btnPlayNextNow);

        btnCancelNext = new TextView(this);
        btnCancelNext.setText("✕  Rester ici");
        btnCancelNext.setTextColor(Color.parseColor("#CBD5E1"));
        btnCancelNext.setTextSize(13f);
        btnCancelNext.setTypeface(Typeface.DEFAULT_BOLD);
        btnCancelNext.setPadding(dp(16), dp(10), dp(16), dp(10));
        btnCancelNext.setFocusable(true);
        btnCancelNext.setFocusableInTouchMode(true);
        GradientDrawable cancelBg = new GradientDrawable();
        cancelBg.setColor(Color.parseColor("#334155"));
        cancelBg.setCornerRadius(dp(10));
        btnCancelNext.setBackground(cancelBg);
        LinearLayout.LayoutParams cancelParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cancelParams.setMarginStart(dp(14));
        btnCancelNext.setLayoutParams(cancelParams);
        btnCancelNext.setOnClickListener(v -> dismissNextEpisodeCountdown());
        btnCancelNext.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable bg = (GradientDrawable) btnCancelNext.getBackground();
            if (hasFocus) {
                bg.setStroke(dp(2), Color.WHITE);
                btnCancelNext.setScaleX(1.05f);
                btnCancelNext.setScaleY(1.05f);
            } else {
                bg.setStroke(0, Color.TRANSPARENT);
                btnCancelNext.setScaleX(1.0f);
                btnCancelNext.setScaleY(1.0f);
            }
        });
        btnRow.addView(btnCancelNext);

        nextEpisodeCard.addView(btnRow);

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.END);
        cardParams.setMargins(0, 0, dp(32), dp(80));
        root.addView(nextEpisodeCard, cardParams);

        // Bottom Controls Bar (Scrollable for mobile and TV)
        bottomControlsHsv = new HorizontalScrollView(this);
        bottomControlsHsv.setHorizontalScrollBarEnabled(false);
        bottomControlsHsv.setFillViewport(true);

        GradientDrawable bottomBg = new GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                new int[]{Color.parseColor("#E6090D16"), Color.parseColor("#99090D16"), Color.TRANSPARENT}
        );
        bottomControlsHsv.setBackground(bottomBg);

        bottomControls = new LinearLayout(this);
        bottomControls.setOrientation(LinearLayout.HORIZONTAL);
        bottomControls.setGravity(Gravity.CENTER);
        bottomControls.setPadding(dp(16), dp(12), dp(16), dp(22));

        btnPrevChannel = createOsdButton("⏮  Précédente", v -> zapPreviousChannel());
        bottomControls.addView(btnPrevChannel);

        btnPlayPause = createOsdButton("⏸  Pause", v -> togglePlayPause());
        LinearLayout.LayoutParams ppParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        ppParams.setMarginStart(dp(10));
        btnPlayPause.setLayoutParams(ppParams);
        bottomControls.addView(btnPlayPause);

        btnNextChannel = createOsdButton("⏭  Suivante", v -> zapNextChannel());
        LinearLayout.LayoutParams npParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        npParams.setMarginStart(dp(10));
        btnNextChannel.setLayoutParams(npParams);
        bottomControls.addView(btnNextChannel);

        btnAudioTrack = createOsdButton("🔊  Audio", v -> showAudioTrackDialog());
        LinearLayout.LayoutParams audParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        audParams.setMarginStart(dp(14));
        btnAudioTrack.setLayoutParams(audParams);
        bottomControls.addView(btnAudioTrack);

        btnSubtitles = createOsdButton("💬  Sous-titres", v -> showSubtitlesDialog());
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subParams.setMarginStart(dp(10));
        btnSubtitles.setLayoutParams(subParams);
        bottomControls.addView(btnSubtitles);

        btnAspectRatio = createOsdButton("📐  Format", v -> toggleAspectRatio());
        LinearLayout.LayoutParams aspParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        aspParams.setMarginStart(dp(10));
        btnAspectRatio.setLayoutParams(aspParams);
        bottomControls.addView(btnAspectRatio);

        // Rotation button (allows 1-tap switch between Landscape and Portrait on mobile)
        if (!isTv) {
            TextView btnRotate = createOsdButton("🔄  Rotation", v -> toggleScreenOrientation());
            LinearLayout.LayoutParams rotParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            rotParams.setMarginStart(dp(10));
            btnRotate.setLayoutParams(rotParams);
            bottomControls.addView(btnRotate);
        }

        if (!isLive) {
            TextView btnRew = createOsdButton("⏪ -10s", v -> seekRelative(-10000));
            LinearLayout.LayoutParams rewParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            rewParams.setMarginStart(dp(10));
            btnRew.setLayoutParams(rewParams);
            bottomControls.addView(btnRew);

            TextView btnFwd = createOsdButton("⏩ +10s", v -> seekRelative(10000));
            LinearLayout.LayoutParams fwdParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            fwdParams.setMarginStart(dp(10));
            btnFwd.setLayoutParams(fwdParams);
            bottomControls.addView(btnFwd);
        }

        bottomControlsHsv.addView(bottomControls);
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(bottomControlsHsv, bottomParams);

        // Center Zap Feedback Pill
        zapFeedbackCard = new LinearLayout(this);
        zapFeedbackCard.setOrientation(LinearLayout.VERTICAL);
        zapFeedbackCard.setGravity(Gravity.CENTER);
        zapFeedbackCard.setPadding(dp(26), dp(16), dp(26), dp(16));
        zapFeedbackCard.setVisibility(View.GONE);

        GradientDrawable zapBg = new GradientDrawable();
        zapBg.setColor(Color.parseColor("#E6090D16"));
        zapBg.setCornerRadius(dp(20));
        zapBg.setStroke(dp(2), Color.parseColor("#38BDF8"));
        zapFeedbackCard.setBackground(zapBg);

        zapFeedbackTitle = new TextView(this);
        zapFeedbackTitle.setTextColor(Color.parseColor("#38BDF8"));
        zapFeedbackTitle.setTextSize(14f);
        zapFeedbackTitle.setTypeface(Typeface.DEFAULT_BOLD);
        zapFeedbackTitle.setGravity(Gravity.CENTER);
        zapFeedbackCard.addView(zapFeedbackTitle);

        zapFeedbackSub = new TextView(this);
        zapFeedbackSub.setTextColor(Color.WHITE);
        zapFeedbackSub.setTextSize(16f);
        zapFeedbackSub.setTypeface(Typeface.DEFAULT_BOLD);
        zapFeedbackSub.setGravity(Gravity.CENTER);
        zapFeedbackSub.setPadding(0, dp(4), 0, 0);
        zapFeedbackCard.addView(zapFeedbackSub);

        FrameLayout.LayoutParams zapParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        root.addView(zapFeedbackCard, zapParams);

        // Error message overlay
        errorView = new TextView(this);
        errorView.setTextColor(Color.parseColor("#FF8A80"));
        errorView.setTextSize(15f);
        errorView.setGravity(Gravity.CENTER);
        errorView.setBackgroundColor(Color.parseColor("#D9000000"));
        errorView.setPadding(dp(24), dp(16), dp(24), dp(16));
        errorView.setVisibility(View.GONE);
        errorView.setOnClickListener(v -> {
            errorView.setVisibility(View.GONE);
            if (player != null) {
                player.seekToDefaultPosition();
                player.prepare();
                player.play();
            }
        });
        FrameLayout.LayoutParams errParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        errParams.setMargins(dp(24), 0, dp(24), 0);
        root.addView(errorView, errParams);

        setContentView(root);

        // Gesture detector for single tap (toggle OSD) and swipe gestures (zapping channels / seek)
        gestureDetector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDown(MotionEvent e) {
                return true;
            }

            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                toggleOsd();
                return true;
            }

            @Override
            public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
                if (e1 == null || e2 == null) return false;
                float diffY = e2.getY() - e1.getY();
                float diffX = e2.getX() - e1.getX();

                // Swipe vertical: changement de chaîne (haut = suivante, bas = précédente)
                if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > dp(35)) {
                    if (diffY < 0) {
                        zapNextChannel();
                    } else {
                        zapPreviousChannel();
                    }
                    return true;
                }

                // Swipe horizontal pour VOD: avance/retour rapide 10s
                if (!isLive && Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > dp(45)) {
                    if (diffX > 0) {
                        seekRelative(10000);
                    } else {
                        seekRelative(-10000);
                    }
                    return true;
                }

                return false;
            }
        });

        playerView.setOnTouchListener((v, event) -> {
            boolean handled = gestureDetector.onTouchEvent(event);
            if (!handled && event.getAction() == MotionEvent.ACTION_UP) {
                v.performClick();
            }
            return true;
        });

        // Detect if this is a Replay / Catchup multi-format fallback cascade
        isReplayCascade = !isLive && (pendingSeriesId == null || pendingSeriesId.isEmpty())
                && !pendingTitles.isEmpty() && pendingTitles.get(0) != null
                && pendingTitles.get(0).startsWith("[Replay]");

        if (isReplayCascade && badgeView != null) {
            badgeView.setText("REPLAY TV");
        }

        DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent(pendingUserAgent)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(isReplayCascade ? 3200 : 8000)
                .setReadTimeoutMs(isReplayCascade ? 4000 : 12000);

        // Ultra-fast initial playback buffer (starts playing after 500ms of stream instead of default 2500ms!)
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                        2500,  // minBufferMs
                        15000, // maxBufferMs
                        500,   // bufferForPlaybackMs (instant startup)
                        1200   // bufferForPlaybackAfterRebufferMs
                )
                .build();

        DefaultMediaSourceFactory mediaSourceFactory = new DefaultMediaSourceFactory(httpFactory)
                .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(isReplayCascade ? 0 : 1));

        player = new ExoPlayer.Builder(this)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(mediaSourceFactory)
                .build();
        playerView.setPlayer(player);

        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < pendingUrls.size(); i++) {
            String title = i < pendingTitles.size() ? pendingTitles.get(i) : "";
            items.add(buildItem(pendingUrls.get(i), title));
        }
        int start = Math.max(0, Math.min(pendingIndex, items.size() - 1));
        String startUrl = (start >= 0 && start < pendingUrls.size()) ? pendingUrls.get(start) : "";

        // Determine start/resume position for VOD Movies and Series Episodes (never for Live TV or Replay)
        long startPosMs = C.TIME_UNSET;
        if (!isLive && !isReplayCascade && !startUrl.isEmpty()) {
            if (pendingForceRestart) {
                clearSavedPositionForUrl(startUrl);
                startPosMs = 0L;
            } else if (pendingStartPositionMs > 15000L) {
                startPosMs = pendingStartPositionMs;
            } else {
                long savedPos = getSavedPositionForUrl(startUrl);
                if (savedPos > 15000L) {
                    startPosMs = savedPos;
                }
            }
        }
        // Reset static hand-over flags so subsequent transitions don't reuse them
        pendingStartPositionMs = 0L;
        pendingForceRestart = false;

        player.setMediaItems(items, start, startPosMs);
        if (startPosMs > 15000L && badgeView != null) {
            badgeView.setText("▶ REPRISE À " + formatTimeMs(startPosMs));
        }

        playerListener = new Player.Listener() {
            @Override
            public void onMediaItemTransition(MediaItem mediaItem, int reason) {
                introSkippedForCurrent = false;
                introAutoHiddenForCurrent = false;
                introShownAtMs = 0L;
                nextEpisodeDismissed = false;
                stopCountdown();
                if (nextEpisodeCard != null) nextEpisodeCard.setVisibility(View.GONE);
                if (skipIntroBtn != null) skipIntroBtn.setVisibility(View.GONE);

                if (badgeView != null && !isLive && !isReplayCascade) {
                    badgeView.setText(pendingSeriesId != null && !pendingSeriesId.isEmpty() ? "SÉRIE" : "VOD");
                }

                // When auto-advancing or switching to another episode in a series, check if it has a saved resume position
                if (!isLive && !isReplayCascade && player != null && reason != Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT) {
                    int idx = player.getCurrentMediaItemIndex();
                    if (idx >= 0 && idx < pendingUrls.size()) {
                        String epUrl = pendingUrls.get(idx);
                        long savedEpPos = getSavedPositionForUrl(epUrl);
                        if (savedEpPos > 15000L && player.getCurrentPosition() < 5000L) {
                            player.seekTo(savedEpPos);
                            if (badgeView != null) {
                                badgeView.setText("▶ REPRISE À " + formatTimeMs(savedEpPos));
                            }
                        }
                    }
                }

                updateTitle();
                showOsd();
                errorView.setVisibility(View.GONE);
                applyLanguagePreferences();
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (btnPlayPause != null) {
                    btnPlayPause.setText(isPlaying ? "⏸  Pause" : "▶  Lecture");
                }
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_READY) {
                    errorView.setVisibility(View.GONE);
                } else if (playbackState == Player.STATE_ENDED) {
                    // Mark current item as completed (100%)
                    saveCurrentPlaybackPosition(true);
                    // Auto-advance to next episode if available and not dismissed
                    if (!isLive && player != null && player.hasNextMediaItem() && !nextEpisodeDismissed) {
                        launchNextEpisode();
                    }
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                handlePlayerError(error);
            }
        };
        player.addListener(playerListener);

        player.prepare();
        player.setPlayWhenReady(true);
        scheduleZapPrefetch(1500);
        applyLanguagePreferences();
        updateTitle();
        showOsd();

        if (!isLive) {
            mainHandler.post(progressRunnable);
        }
    }

    private String formatTimeMs(long ms) {
        long totalSec = Math.max(0L, ms / 1000L);
        long hours = totalSec / 3600L;
        long minutes = (totalSec % 3600L) / 60L;
        long seconds = totalSec % 60L;
        if (hours > 0) {
            return String.format("%dh %02dmin", hours, minutes);
        }
        return String.format("%02d:%02d", minutes, seconds);
    }

    private long getSavedPositionForUrl(String url) {
        if (url == null || url.isEmpty()) return 0L;
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_POSITIONS, Context.MODE_PRIVATE);
            String jsonStr = prefs.getString(KEY_POSITIONS_JSON, "{}");
            org.json.JSONObject root = new org.json.JSONObject(jsonStr);
            org.json.JSONObject item = root.optJSONObject(url);
            if (item != null) {
                long pos = item.optLong("positionMs", 0L);
                long dur = item.optLong("durationMs", 0L);
                boolean completed = item.optBoolean("completed", false);
                if (completed) return 0L;
                if (dur > 0 && (pos >= dur - 45000L || ((double) pos / dur) >= 0.94)) {
                    return 0L;
                }
                return pos;
            }
        } catch (Exception ignored) {}
        return 0L;
    }

    private void clearSavedPositionForUrl(String url) {
        if (url == null || url.isEmpty()) return;
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_POSITIONS, Context.MODE_PRIVATE);
            String jsonStr = prefs.getString(KEY_POSITIONS_JSON, "{}");
            org.json.JSONObject root = new org.json.JSONObject(jsonStr);
            if (root.has(url)) {
                root.remove(url);
                prefs.edit().putString(KEY_POSITIONS_JSON, root.toString()).apply();
            }
        } catch (Exception ignored) {}
    }

    private void saveCurrentPlaybackPosition(boolean forceCompleted) {
        if (player == null || isLive || isReplayCascade) return;
        try {
            int idx = player.getCurrentMediaItemIndex();
            if (idx < 0 || idx >= pendingUrls.size()) return;
            String url = pendingUrls.get(idx);
            if (url == null || url.isEmpty()) return;

            long pos = player.getCurrentPosition();
            long dur = player.getDuration();
            if (dur <= 0 || dur == C.TIME_UNSET) return;

            // Do not save if user watched less than 15 seconds and not completed
            if (!forceCompleted && pos < 15000L) return;

            boolean isCompleted = forceCompleted || (dur > 60000L && (pos >= dur - 45000L || ((double) pos / dur) >= 0.94));
            String title = (idx < pendingTitles.size()) ? pendingTitles.get(idx) : "";
            long now = System.currentTimeMillis();

            SharedPreferences prefs = getSharedPreferences(PREFS_POSITIONS, Context.MODE_PRIVATE);
            String jsonStr = prefs.getString(KEY_POSITIONS_JSON, "{}");
            org.json.JSONObject root = new org.json.JSONObject(jsonStr);

            org.json.JSONObject entry = new org.json.JSONObject();
            entry.put("url", url);
            entry.put("title", title);
            entry.put("positionMs", isCompleted ? dur : pos);
            entry.put("durationMs", dur);
            entry.put("completed", isCompleted);
            entry.put("updatedAt", now);
            if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
                entry.put("seriesId", pendingSeriesId);
                entry.put("episodeIndex", idx);
            }
            root.put(url, entry);

            // Also store the last watched episode summary under "series_<seriesId>" for instant lookup in SeriesDetailModal
            if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
                org.json.JSONObject seriesEntry = new org.json.JSONObject();
                seriesEntry.put("seriesId", pendingSeriesId);
                seriesEntry.put("url", url);
                seriesEntry.put("title", title);
                seriesEntry.put("episodeIndex", idx);
                seriesEntry.put("positionMs", isCompleted ? dur : pos);
                seriesEntry.put("durationMs", dur);
                seriesEntry.put("completed", isCompleted);
                seriesEntry.put("updatedAt", now);
                root.put("series_" + pendingSeriesId, seriesEntry);
            }

            prefs.edit().putString(KEY_POSITIONS_JSON, root.toString()).apply();
            lastSavedPositionAtMs = now;
        } catch (Exception ignored) {}
    }

    private void applyLanguagePreferences() {
        if (player == null) return;
        SharedPreferences prefs = getSharedPreferences("keotv_series_prefs", Context.MODE_PRIVATE);

        String audioPref = pendingPreferredAudio;
        String subPref = pendingPreferredSubtitle;

        if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
            if (audioPref != null && !audioPref.isEmpty()) {
                prefs.edit().putString("audio_" + pendingSeriesId, audioPref).apply();
            } else {
                audioPref = prefs.getString("audio_" + pendingSeriesId, null);
            }

            if (subPref != null && !subPref.isEmpty()) {
                prefs.edit().putString("sub_" + pendingSeriesId, subPref).apply();
            } else {
                subPref = prefs.getString("sub_" + pendingSeriesId, null);
            }
        }

        TrackSelectionParameters.Builder builder = player.getTrackSelectionParameters().buildUpon();

        if (audioPref != null && !audioPref.isEmpty()) {
            String lower = audioPref.trim().toLowerCase();
            if (lower.contains("vf") || lower.contains("fr")) {
                builder.setPreferredAudioLanguages("fra", "fre", "fr");
            } else if (lower.contains("vo") || lower.contains("en")) {
                builder.setPreferredAudioLanguages("eng", "en", "original");
            }
        }

        if (subPref != null && !subPref.isEmpty()) {
            String lower = subPref.trim().toLowerCase();
            if (lower.equals("none") || lower.equals("sans") || lower.equals("off")) {
                builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
                builder.setPreferredTextLanguages();
            } else if (lower.contains("fr")) {
                builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
                builder.setPreferredTextLanguages("fra", "fre", "fr");
            } else if (lower.contains("en")) {
                builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
                builder.setPreferredTextLanguages("eng", "en");
            }
        }

        player.setTrackSelectionParameters(builder.build());
    }

    private void checkPlaybackProgress() {
        if (player == null || isLive) return;
        long pos = player.getCurrentPosition();
        long dur = player.getDuration();
        long now = System.currentTimeMillis();

        // 0. Save playback position every 5 seconds for Movies and Series (never Replay)
        if (!isReplayCascade && dur > 0 && now - lastSavedPositionAtMs >= 5000L) {
            saveCurrentPlaybackPosition(false);
        }

        // 1. Skip intro management:
        //    - STRICTLY for Series episodes (pendingSeriesId != null && !pendingSeriesId.isEmpty())
        //    - NEVER on VOD movies or Replay streams!
        //    - Appears at 5s into the episode and auto-hides after 7 seconds (7000ms) so it never annoys the viewer!
        boolean isSeriesEpisode = pendingSeriesId != null && !pendingSeriesId.isEmpty() && !isReplayCascade;
        if (isSeriesEpisode && !introSkippedForCurrent && !introAutoHiddenForCurrent && dur > 300000L && pos >= 5000L && pos <= 90000L) {
            if (skipIntroBtn != null && skipIntroBtn.getVisibility() != View.VISIBLE) {
                introShownAtMs = now;
                skipIntroBtn.setVisibility(View.VISIBLE);
                skipIntroBtn.setAlpha(0f);
                skipIntroBtn.animate().alpha(1f).setDuration(300).start();
            } else if (skipIntroBtn != null && skipIntroBtn.getVisibility() == View.VISIBLE) {
                // Auto-hide after 7 seconds (Netflix / Prime Video standard)
                if (introShownAtMs > 0L && (now - introShownAtMs) >= 7000L) {
                    introAutoHiddenForCurrent = true;
                    skipIntroBtn.animate().alpha(0f).setDuration(300).withEndAction(() -> {
                        if (skipIntroBtn != null) skipIntroBtn.setVisibility(View.GONE);
                    }).start();
                }
            }
        } else {
            if (skipIntroBtn != null && skipIntroBtn.getVisibility() == View.VISIBLE) {
                skipIntroBtn.animate().alpha(0f).setDuration(250).withEndAction(() -> {
                    if (skipIntroBtn != null) skipIntroBtn.setVisibility(View.GONE);
                }).start();
            }
        }

        // 2. Next episode countdown (strictly for Series in the last 40 seconds or >95% progress)
        if (isSeriesEpisode && dur > 60000L && !nextEpisodeDismissed && player.hasNextMediaItem()) {
            long remaining = dur - pos;
            if (remaining <= 40000L || ((double) pos / dur) > 0.95) {
                if (!isCountdownActive) {
                    startNextEpisodeCountdown();
                }
            }
        }
    }

    private void performSkipIntro() {
        if (player == null) return;
        introSkippedForCurrent = true;
        long current = player.getCurrentPosition();
        long target = current + 85000;
        long dur = player.getDuration();
        if (dur > 0 && target >= dur) {
            target = Math.max(0, dur - 5000);
        }
        player.seekTo(target);
        if (skipIntroBtn != null) {
            skipIntroBtn.setVisibility(View.GONE);
        }
    }

    private void startNextEpisodeCountdown() {
        if (isCountdownActive || player == null || !player.hasNextMediaItem()) return;
        isCountdownActive = true;
        nextEpisodeCountdownSeconds = 10;

        int nextIdx = player.getCurrentMediaItemIndex() + 1;
        String nextTitle = (nextIdx < pendingTitles.size()) ? pendingTitles.get(nextIdx) : "Épisode suivant";
        if (nextEpisodeTitleText != null) {
            nextEpisodeTitleText.setText(nextTitle);
        }
        if (nextCountdownText != null) {
            nextCountdownText.setText("ÉPISODE SUIVANT DANS 10s...");
        }

        if (nextEpisodeCard != null) {
            nextEpisodeCard.setVisibility(View.VISIBLE);
            nextEpisodeCard.setAlpha(0f);
            nextEpisodeCard.setTranslationY(dp(20));
            nextEpisodeCard.animate().alpha(1f).translationY(0f).setDuration(350).start();
            if (btnPlayNextNow != null) {
                btnPlayNextNow.requestFocus();
            }
        }

        mainHandler.removeCallbacks(countdownTickRunnable);
        mainHandler.postDelayed(countdownTickRunnable, 1000);
    }

    private void launchNextEpisode() {
        stopCountdown();
        if (nextEpisodeCard != null) {
            nextEpisodeCard.setVisibility(View.GONE);
        }
        // Mark current episode as 100% completed before advancing
        saveCurrentPlaybackPosition(true);
        if (player != null && player.hasNextMediaItem()) {
            player.seekToNextMediaItem();
            player.play();
        }
    }

    private void dismissNextEpisodeCountdown() {
        nextEpisodeDismissed = true;
        stopCountdown();
        if (nextEpisodeCard != null) {
            nextEpisodeCard.animate().alpha(0f).translationY(dp(20)).setDuration(250).withEndAction(() -> {
                if (nextEpisodeCard != null) nextEpisodeCard.setVisibility(View.GONE);
            }).start();
        }
    }

    private void stopCountdown() {
        isCountdownActive = false;
        mainHandler.removeCallbacks(countdownTickRunnable);
    }

    private MediaItem buildItem(String url, String title) {
        return new MediaItem.Builder()
                .setUri(url)
                .setMediaMetadata(new androidx.media3.common.MediaMetadata.Builder().setTitle(title).build())
                .build();
    }

    private void updateTitle() {
        if (player == null) return;
        MediaItem current = player.getCurrentMediaItem();
        CharSequence title = current != null ? current.mediaMetadata.title : null;
        titleView.setText(title != null ? title : "");

        int currentIdx = player.getCurrentMediaItemIndex() + 1;
        int total = player.getMediaItemCount();
        if (total > 0) {
            indexView.setText(currentIdx + " / " + total);
        } else {
            indexView.setText("");
        }
    }

    private void showOsd() {
        if (osdContainer == null) return;
        osdHandler.removeCallbacks(hideOsdRunnable);
        osdContainer.setVisibility(View.VISIBLE);
        osdContainer.animate().cancel();
        osdContainer.setAlpha(1f);
        if (bottomControlsHsv != null) {
            bottomControlsHsv.setVisibility(View.VISIBLE);
            bottomControlsHsv.animate().cancel();
            bottomControlsHsv.setAlpha(1f);
        }

        // Show rich semi-transparent EPG overlay for the currently active channel (Live TV mode)
        if (isLive && epgOverlayCard != null) {
            int currentIdx = (player != null) ? player.getCurrentMediaItemIndex() : pendingIndex;
            updateEpgOverlayForIndex(currentIdx);
        }

        if (pendingOsdTimeoutMs > 0) {
            osdHandler.postDelayed(hideOsdRunnable, pendingOsdTimeoutMs);
        }
    }

    private void updateEpgOverlayForIndex(int idx) {
        if (!isLive || epgOverlayCard == null) return;

        // 1. Check in-memory session cache
        if (dynamicEpgCache.containsKey(idx)) {
            applyEpgToViews(dynamicEpgCache.get(idx));
            return;
        }

        // 2. Check pending EPG lists passed from Web
        String title = (idx >= 0 && idx < pendingEpgTitles.size()) ? pendingEpgTitles.get(idx) : "";
        String desc = (idx >= 0 && idx < pendingEpgDescs.size()) ? pendingEpgDescs.get(idx) : "";
        String time = (idx >= 0 && idx < pendingEpgTimes.size()) ? pendingEpgTimes.get(idx) : "";
        String next = (idx >= 0 && idx < pendingEpgNextTitles.size()) ? pendingEpgNextTitles.get(idx) : "";

        // If this is the initial index and pendingCurrentProgramTitle was passed, fallback to it
        if (idx == pendingIndex && TextUtils.isEmpty(title) && !TextUtils.isEmpty(pendingCurrentProgramTitle)) {
            title = pendingCurrentProgramTitle;
            desc = pendingCurrentProgramDesc != null ? pendingCurrentProgramDesc : "";
            time = pendingCurrentProgramTime != null ? pendingCurrentProgramTime : "";
            next = pendingNextProgramTitle != null ? pendingNextProgramTitle : "";
        }

        if (!TextUtils.isEmpty(title)) {
            EpgItem item = new EpgItem(title, time, desc, next);
            dynamicEpgCache.put(idx, item);
            applyEpgToViews(item);
            return;
        }

        // 3. Fallback: fetch EPG directly from Xtream API in a background thread
        fetchEpgForIndexAsync(idx);
    }

    private void applyEpgToViews(EpgItem item) {
        if (epgOverlayCard == null) return;
        if (item == null || TextUtils.isEmpty(item.title)) {
            epgOverlayCard.setVisibility(View.GONE);
            return;
        }
        if (epgNowTitle != null) epgNowTitle.setText(item.title);
        if (epgNowTime != null) {
            epgNowTime.setText(item.time != null ? item.time : "");
            epgNowTime.setVisibility(!TextUtils.isEmpty(item.time) ? View.VISIBLE : View.GONE);
        }
        if (epgNowDesc != null) {
            epgNowDesc.setText(item.desc != null ? item.desc : "");
            epgNowDesc.setVisibility(!TextUtils.isEmpty(item.desc) ? View.VISIBLE : View.GONE);
        }
        if (epgNextTitle != null) {
            if (!TextUtils.isEmpty(item.next)) {
                epgNextTitle.setText("⏭  À suivre : " + item.next);
                epgNextTitle.setVisibility(View.VISIBLE);
            } else {
                epgNextTitle.setVisibility(View.GONE);
            }
        }
        epgOverlayCard.setVisibility(View.VISIBLE);
        epgOverlayCard.animate().cancel();
        epgOverlayCard.setAlpha(1f);
        epgOverlayCard.setTranslationY(0f);
    }

    private void fetchEpgForIndexAsync(int idx) {
        if (idx < 0 || idx >= pendingUrls.size()) return;
        String chName = (idx < pendingTitles.size()) ? pendingTitles.get(idx) : "En direct";

        // Display immediate placeholder while fetching over network
        applyEpgToViews(new EpgItem(chName, "", "Programme en direct", ""));

        String streamUrl = pendingUrls.get(idx);
        if (TextUtils.isEmpty(streamUrl)) return;

        epgFetchExecutor.execute(() -> {
            try {
                // Parse Xtream live stream URL format: http(s)://server:port/[live/]username/password/streamId[.ext]
                Pattern p = Pattern.compile("^(https?://[^/]+)(?:/live)?/([^/]+)/([^/]+)/(\\d+)(?:\\.[a-zA-Z0-9]+)?");
                Matcher m = p.matcher(streamUrl);
                if (!m.find()) return;

                String base = m.group(1);
                String user = m.group(2);
                String pass = m.group(3);
                String streamId = m.group(4);

                String apiUrl = base + "/player_api.php?username=" + URLEncoder.encode(user, "UTF-8")
                        + "&password=" + URLEncoder.encode(pass, "UTF-8")
                        + "&action=get_short_epg&stream_id=" + streamId + "&limit=4";

                URL url = new URL(apiUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(3000);
                conn.setReadTimeout(3000);
                conn.setRequestProperty("User-Agent", pendingUserAgent != null ? pendingUserAgent : "IPTVSmartersPro/3.1.5 (Linux; Android 12)");

                if (conn.getResponseCode() == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);
                    reader.close();

                    JSONObject json = new JSONObject(sb.toString());
                    JSONArray listings = json.optJSONArray("epg_listings");
                    if (listings != null && listings.length() > 0) {
                        EpgItem parsed = parseEpgJson(listings);
                        if (parsed != null) {
                            dynamicEpgCache.put(idx, parsed);
                            runOnUiThread(() -> {
                                if (player != null && player.getCurrentMediaItemIndex() == idx) {
                                    applyEpgToViews(parsed);
                                }
                            });
                        }
                    }
                }
            } catch (Exception ignored) {}
        });
    }

    private String decodeBase64IfNeeded(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        String trimmed = raw.trim();
        if (trimmed.length() >= 4 && trimmed.length() % 4 == 0 && trimmed.matches("^[A-Za-z0-9+/=]+$")) {
            try {
                byte[] decoded = android.util.Base64.decode(trimmed, android.util.Base64.DEFAULT);
                return new String(decoded, "UTF-8");
            } catch (Exception ignored) {}
        }
        return trimmed;
    }

    private EpgItem parseEpgJson(JSONArray listings) {
        try {
            if (listings == null || listings.length() == 0) return null;
            long nowSec = System.currentTimeMillis() / 1000;
            JSONObject currentObj = null;
            JSONObject nextObj = null;

            for (int i = 0; i < listings.length(); i++) {
                JSONObject item = listings.optJSONObject(i);
                if (item == null) continue;
                long start = parseTimestamp(item.optString("start_timestamp"), item.optString("start"));
                long stop = parseTimestamp(item.optString("stop_timestamp"), item.optString("stop", item.optString("end")));
                if (stop > nowSec && start <= nowSec) {
                    currentObj = item;
                    if (i + 1 < listings.length()) {
                        nextObj = listings.optJSONObject(i + 1);
                    }
                    break;
                }
            }
            if (currentObj == null) {
                currentObj = listings.optJSONObject(0);
                if (listings.length() > 1) nextObj = listings.optJSONObject(1);
            }
            if (currentObj == null) return null;

            String title = decodeBase64IfNeeded(currentObj.optString("title"));
            String desc = decodeBase64IfNeeded(currentObj.optString("description"));
            long startSec = parseTimestamp(currentObj.optString("start_timestamp"), currentObj.optString("start"));
            long stopSec = parseTimestamp(currentObj.optString("stop_timestamp"), currentObj.optString("stop", currentObj.optString("end")));

            SimpleDateFormat sdf = new SimpleDateFormat("HH:mm", Locale.getDefault());
            String timeStr = "";
            if (startSec > 0 && stopSec > 0) {
                timeStr = sdf.format(new Date(startSec * 1000)) + " - " + sdf.format(new Date(stopSec * 1000));
            }

            String nextTitle = "";
            if (nextObj != null) {
                nextTitle = decodeBase64IfNeeded(nextObj.optString("title"));
            }

            return new EpgItem(title.isEmpty() ? "Programme en cours" : title, timeStr, desc, nextTitle);
        } catch (Exception ignored) {
            return null;
        }
    }

    private long parseTimestamp(String rawTs, String dateStr) {
        try {
            if (!TextUtils.isEmpty(rawTs)) {
                long val = Long.parseLong(rawTs.trim());
                return val > 10000000000L ? (val / 1000) : val;
            }
            if (!TextUtils.isEmpty(dateStr)) {
                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
                Date d = sdf.parse(dateStr.trim());
                if (d != null) return d.getTime() / 1000;
            }
        } catch (Exception ignored) {}
        return 0L;
    }

    private void hideOsdImmediately() {
        osdHandler.removeCallbacks(hideOsdRunnable);
        if (osdContainer != null) {
            osdContainer.animate().cancel();
            osdContainer.setAlpha(0f);
            osdContainer.setVisibility(View.GONE);
        }
        if (bottomControlsHsv != null) {
            bottomControlsHsv.animate().cancel();
            bottomControlsHsv.setAlpha(0f);
            bottomControlsHsv.setVisibility(View.GONE);
        }
        if (epgOverlayCard != null) {
            epgOverlayCard.animate().cancel();
            epgOverlayCard.setAlpha(0f);
            epgOverlayCard.setVisibility(View.GONE);
        }
    }

    private boolean isOsdVisible() {
        return osdContainer != null && osdContainer.getVisibility() == View.VISIBLE && osdContainer.getAlpha() > 0.3f;
    }

    private boolean isControllerVisible() {
        return playerView != null && playerView.isControllerFullyVisible();
    }

    private void toggleOsd() {
        if (!isLive && playerView != null) {
            if (isControllerVisible() || isOsdVisible()) {
                playerView.hideController();
                hideOsdImmediately();
            } else {
                playerView.showController();
                showOsd();
            }
            return;
        }
        if (osdContainer == null) return;
        if (isOsdVisible()) {
            hideOsdImmediately();
        } else {
            showOsd();
        }
    }

    private void handlePlayerError(PlaybackException error) {
        int index = player.getCurrentMediaItemIndex();
        MediaItem current = player.getCurrentMediaItem();

        if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
            player.seekToDefaultPosition();
            player.prepare();
            return;
        }

        // 1. If this is a Replay / Catchup stream (!isLive and multiple fallback URLs were provided),
        // automatically advance to the next fallback URL format!
        if (!isLive && pendingSeriesId == null && player.getMediaItemCount() > 1 && index < player.getMediaItemCount() - 1) {
            boolean isReplayFallbackList = false;
            if (current != null && current.mediaMetadata != null && current.mediaMetadata.title != null) {
                String t = current.mediaMetadata.title.toString();
                if (t.startsWith("[Replay]")) {
                    isReplayFallbackList = true;
                }
            }
            if (isReplayFallbackList) {
                player.seekToDefaultPosition(index + 1);
                player.prepare();
                player.play();
                return;
            }
        }

        // 2. Many Xtream panels only serve live streams as raw MPEG-TS: retry with .ts (or .m3u8)
        if (current != null && current.localConfiguration != null) {
            String uri = current.localConfiguration.uri.toString();
            if (uri.endsWith(".m3u8") && !triedTsFallback.contains(index)) {
                triedTsFallback.add(index);
                String tsUri = uri.substring(0, uri.length() - 5) + ".ts";
                MediaItem replacement = new MediaItem.Builder()
                        .setUri(tsUri)
                        .setMediaMetadata(current.mediaMetadata)
                        .build();
                player.replaceMediaItem(index, replacement);
                player.prepare();
                player.play();
                return;
            } else if (uri.endsWith(".ts") && !triedTsFallback.contains(index)) {
                triedTsFallback.add(index);
                String m3u8Uri = uri.substring(0, uri.length() - 3) + ".m3u8";
                MediaItem replacement = new MediaItem.Builder()
                        .setUri(m3u8Uri)
                        .setMediaMetadata(current.mediaMetadata)
                        .build();
                player.replaceMediaItem(index, replacement);
                player.prepare();
                player.play();
                return;
            }
        }

        String details = error.getErrorCodeName();
        Throwable cause = error.getCause();
        if (cause instanceof HttpDataSource.InvalidResponseCodeException) {
            int code = ((HttpDataSource.InvalidResponseCodeException) cause).responseCode;
            details = "HTTP " + code;
            if (code == 401 || code == 403) {
                details += " (accès refusé par le serveur : abonnement expiré ou nombre de connexions atteint)";
            } else if (code == 404) {
                details += " (flux ou archive replay introuvable sur le serveur)";
            } else if (code == 884 || code == 509 || code == 429) {
                details += " (trop de connexions simultanées)";
            }
        } else if (cause != null && cause.getMessage() != null) {
            details += " - " + cause.getMessage();
        }
        errorView.setText("Impossible de lire ce flux\n" + details + "\n\nAppuyez sur OK pour réessayer ou Retour pour quitter");
        errorView.setVisibility(View.VISIBLE);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (player != null && event.getAction() == KeyEvent.ACTION_DOWN) {
            int key = event.getKeyCode();

            // 0. If error screen is displayed, OK retries and Back exits
            if (errorView != null && errorView.getVisibility() == View.VISIBLE) {
                if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                    errorView.setVisibility(View.GONE);
                    player.seekToDefaultPosition(0);
                    player.prepare();
                    player.play();
                    return true;
                }
                if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_ESCAPE) {
                    finish();
                    return true;
                }
            }

            // 1. When Next Episode overlay is visible:
            if (isCountdownActive && nextEpisodeCard != null && nextEpisodeCard.getVisibility() == View.VISIBLE) {
                if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_ESCAPE) {
                    dismissNextEpisodeCountdown();
                    return true;
                }
                if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                    if (btnCancelNext != null && btnCancelNext.isFocused()) {
                        dismissNextEpisodeCountdown();
                    } else {
                        launchNextEpisode();
                    }
                    return true;
                }
                if (key == KeyEvent.KEYCODE_DPAD_RIGHT) {
                    if (btnPlayNextNow != null && btnPlayNextNow.isFocused() && btnCancelNext != null) {
                        btnCancelNext.requestFocus();
                        return true;
                    }
                }
                if (key == KeyEvent.KEYCODE_DPAD_LEFT) {
                    if (btnCancelNext != null && btnCancelNext.isFocused() && btnPlayNextNow != null) {
                        btnPlayNextNow.requestFocus();
                        return true;
                    }
                }
            }

            // 2. When Skip Intro is visible:
            if (skipIntroBtn != null && skipIntroBtn.getVisibility() == View.VISIBLE) {
                if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || key == KeyEvent.KEYCODE_BUTTON_R1 || key == KeyEvent.KEYCODE_PROG_RED) {
                    performSkipIntro();
                    return true;
                }
                if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_ESCAPE) {
                    introAutoHiddenForCurrent = true;
                    skipIntroBtn.setVisibility(View.GONE);
                    return true;
                }
                if (key == KeyEvent.KEYCODE_DPAD_RIGHT && !skipIntroBtn.isFocused() && !isControllerVisible()) {
                    skipIntroBtn.requestFocus();
                    return true;
                }
                if (skipIntroBtn.isFocused() && (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                    performSkipIntro();
                    return true;
                }
            }

            // 3. Back key handling: hides controls/OSD if visible, else closes player
            if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_ESCAPE) {
                if (isControllerVisible()) {
                    if (playerView != null) playerView.hideController();
                    hideOsdImmediately();
                    return true;
                }
                if (isOsdVisible()) {
                    hideOsdImmediately();
                    return true;
                }
                finish();
                return true;
            }

            // 4. LIVE TV ZAPPING & REMOTE CONTROLS
            // D-Pad UP: ALWAYS zap to next channel (Chaîne +)
            // D-Pad DOWN: ALWAYS zap to previous channel (Chaîne -)
            // OK / Center: Toggle OSD & EPG overlay banner
            if (isLive) {
                boolean isBottomButtonFocused = (btnPlayPause != null && btnPlayPause.isFocused()) ||
                        (btnAudioTrack != null && btnAudioTrack.isFocused()) ||
                        (btnSubtitles != null && btnSubtitles.isFocused()) ||
                        (btnAspectRatio != null && btnAspectRatio.isFocused()) ||
                        (btnPrevChannel != null && btnPrevChannel.isFocused()) ||
                        (btnNextChannel != null && btnNextChannel.isFocused());

                // D-Pad UP or Channel UP -> Chaîne + (zapNextChannel)
                if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_CHANNEL_UP || key == KeyEvent.KEYCODE_PAGE_UP) {
                    zapNextChannel();
                    return true;
                }

                // D-Pad DOWN or Channel DOWN -> Chaîne - (zapPreviousChannel)
                if (key == KeyEvent.KEYCODE_DPAD_DOWN || key == KeyEvent.KEYCODE_CHANNEL_DOWN || key == KeyEvent.KEYCODE_PAGE_DOWN) {
                    zapPreviousChannel();
                    return true;
                }

                // Center / OK / Enter
                if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                    if (isBottomButtonFocused) {
                        return super.dispatchKeyEvent(event);
                    }
                    toggleOsd();
                    return true;
                }

                // Left / Right: if bottom controls are focused, navigate between them; otherwise allow Left/Right zapping or OSD
                if (isBottomButtonFocused && (key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT)) {
                    showOsd();
                    return super.dispatchKeyEvent(event);
                }
            }

            // 5. VOD / SERIES / REPLAY NAVIGATION
            if (!isLive) {
                if (isControllerVisible()) {
                    showOsd();
                    return super.dispatchKeyEvent(event);
                }

                if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN ||
                        key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER ||
                        key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                    if (playerView != null) playerView.showController();
                    showOsd();
                    return true;
                }

                if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || key == KeyEvent.KEYCODE_DPAD_RIGHT) {
                    long currentPos = player.getCurrentPosition();
                    player.seekTo(currentPos + 10000);
                    showOsd();
                    if (playerView != null) playerView.showController();
                    return true;
                }

                if (key == KeyEvent.KEYCODE_MEDIA_REWIND || key == KeyEvent.KEYCODE_DPAD_LEFT) {
                    long currentPos = player.getCurrentPosition();
                    player.seekTo(Math.max(0, currentPos - 10000));
                    showOsd();
                    if (playerView != null) playerView.showController();
                    return true;
                }
            }

            // 8. Toggle Pause/Play on dedicated Media buttons
            if (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || key == KeyEvent.KEYCODE_MEDIA_PLAY || key == KeyEvent.KEYCODE_MEDIA_PAUSE) {
                if (player.isPlaying()) {
                    player.pause();
                } else {
                    player.play();
                }
                showOsd();
                return true;
            }

            // 9. Back button (when controls are already hidden) saves position and returns to TV Guide
            if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_ESCAPE) {
                saveCurrentPlaybackPosition(false);
                finish();
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void hideSystemUi() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
                new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (gestureDetector != null && gestureDetector.onTouchEvent(event)) {
            return true;
        }
        return super.onTouchEvent(event);
    }

    private void toggleScreenOrientation() {
        int currentOrientation = getResources().getConfiguration().orientation;
        if (currentOrientation == Configuration.ORIENTATION_LANDSCAPE) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            showZapFeedback("📱 Mode Portrait", "Orientation verticale");
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            showZapFeedback("📺 Mode Paysage", "Orientation plein écran");
        }
        showOsd();
    }

    private void zapNextChannel() {
        zapChannel(1);
    }

    private void zapPreviousChannel() {
        zapChannel(-1);
    }

    private void zapChannel(int direction) {
        if (player == null) return;
        int total = player.getMediaItemCount();
        if (total <= 1) {
            String chName = (titleView != null && !TextUtils.isEmpty(titleView.getText()))
                    ? titleView.getText().toString() : "";
            showZapFeedback("Chaîne unique", chName.isEmpty() ? "Aucune autre chaîne" : chName);
            showOsd();
            return;
        }
        lastZapDirection = direction;
        int currentIdx = player.getCurrentMediaItemIndex();
        int targetIdx = (currentIdx + direction + total) % total;

        boolean swapped = trySwapToPrefetched(targetIdx);
        if (!swapped) {
            releasePrefetchPlayer();
            player.seekToDefaultPosition(targetIdx);
            player.prepare();
            player.play();
        }
        updateTitle();
        showOsd();
        if (isLive && epgOverlayCard != null) {
            updateEpgOverlayForIndex(targetIdx);
        }
        String channelName = (targetIdx < pendingTitles.size()) ? pendingTitles.get(targetIdx) : "";
        showZapFeedback(direction > 0 ? "▲ Chaîne suivante" : "▼ Chaîne précédente", channelName);

        // Pre-buffer the next likely channel (same direction) once the new one is on screen
        scheduleZapPrefetch(swapped ? 400 : 1200);
    }

    // ---------------------------------------------------------------------------------------------
    // Zap prefetch (live only): hidden second ExoPlayer pre-buffers the adjacent channel
    // ---------------------------------------------------------------------------------------------
    private void scheduleZapPrefetch(long delayMs) {
        if (!isLive || isReplayCascade || singleStreamMode) return;
        mainHandler.removeCallbacks(prefetchRunnable);
        mainHandler.postDelayed(prefetchRunnable, delayMs);
    }

    private void releasePrefetchPlayer() {
        mainHandler.removeCallbacks(prefetchRunnable);
        if (prefetchPlayer != null) {
            try {
                prefetchPlayer.setVolume(0f);
                prefetchPlayer.stop();
                prefetchPlayer.clearMediaItems();
                prefetchPlayer.release();
            } catch (Exception ignored) {}
            prefetchPlayer = null;
        }
        prefetchTargetIdx = -1;
    }

    private void startPrefetch() {
        if (player == null || !isLive || isReplayCascade || isFinishing() || singleStreamMode) return;
        int total = player.getMediaItemCount();
        if (total <= 1) return;
        int targetIdx = (player.getCurrentMediaItemIndex() + lastZapDirection + total) % total;
        if (prefetchPlayer != null && prefetchTargetIdx == targetIdx) return; // already warm

        releasePrefetchPlayer();
        try {
            DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                    .setUserAgent(pendingUserAgent)
                    .setAllowCrossProtocolRedirects(true)
                    .setConnectTimeoutMs(6000)
                    .setReadTimeoutMs(8000);
            // Small buffer: we only want the connection open + first segments, not a deep buffer
            DefaultLoadControl lc = new DefaultLoadControl.Builder()
                    .setBufferDurationsMs(1500, 4000, 500, 1000)
                    .build();
            final ExoPlayer pre = new ExoPlayer.Builder(this)
                    .setLoadControl(lc)
                    .setMediaSourceFactory(new DefaultMediaSourceFactory(httpFactory)
                            .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(1)))
                    .build();

            List<MediaItem> items = new ArrayList<>();
            for (int i = 0; i < pendingUrls.size(); i++) {
                String title = i < pendingTitles.size() ? pendingTitles.get(i) : "";
                items.add(buildItem(pendingUrls.get(i), title));
            }
            pre.setMediaItems(items, targetIdx, C.TIME_UNSET);
            // Explicitly disable AUDIO track decoding on prefetch so it NEVER outputs sound or holds audio sinks
            pre.setTrackSelectionParameters(
                    pre.getTrackSelectionParameters()
                            .buildUpon()
                            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, true)
                            .build()
            );
            pre.setVolume(0f);
            pre.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int state) {
                    if (state == Player.STATE_READY && pre == prefetchPlayer) {
                        prefetchPreparedAtMs = android.os.SystemClock.elapsedRealtime();
                    }
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    // Broken stream: drop it silently, the normal zap path will handle (and report) it
                    if (pre == prefetchPlayer) {
                        releasePrefetchPlayer();
                    }
                }
            });
            pre.setPlayWhenReady(false); // buffer only, never plays audio
            pre.prepare();
            prefetchPlayer = pre;
            prefetchTargetIdx = targetIdx;
            prefetchPreparedAtMs = 0L;
        } catch (Exception e) {
            releasePrefetchPlayer();
        }
    }

    /** Swaps the visible player for the already-buffered prefetch player. Returns false if not usable. */
    private boolean trySwapToPrefetched(int targetIdx) {
        if (prefetchPlayer == null || prefetchTargetIdx != targetIdx || playerListener == null) return false;
        if (prefetchPlayer.getPlaybackState() != Player.STATE_READY) return false;
        long age = android.os.SystemClock.elapsedRealtime() - prefetchPreparedAtMs;
        if (prefetchPreparedAtMs == 0L || age > PREFETCH_MAX_AGE_MS) return false; // stale live data

        final ExoPlayer old = player;
        final ExoPlayer next = prefetchPlayer;
        prefetchPlayer = null;
        prefetchTargetIdx = -1;
        mainHandler.removeCallbacks(prefetchRunnable);

        try {
            // Mute and stop old player immediately so its audio never overlaps
            if (old != null) {
                try {
                    old.removeListener(playerListener);
                    old.setVolume(0f);
                    old.stop();
                } catch (Exception ignored) {}
            }
            // Re-enable audio on the promoted player
            next.setTrackSelectionParameters(
                    next.getTrackSelectionParameters()
                            .buildUpon()
                            .setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, false)
                            .build()
            );
            next.setVolume(1f);
            next.addListener(playerListener);
            player = next;
            playerView.setPlayer(next);
            next.setPlayWhenReady(true);
            if (errorView != null) errorView.setVisibility(View.GONE);
            applyLanguagePreferences();
            // Release the previous player immediately
            if (old != null) {
                try {
                    old.clearMediaItems();
                    old.release();
                } catch (Exception ignored) {}
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }


    private void togglePlayPause() {
        if (player == null) return;
        if (player.isPlaying()) {
            player.pause();
            if (btnPlayPause != null) {
                btnPlayPause.setText("▶  Lecture");
            }
            showZapFeedback("⏸ Pause", "Lecture suspendue");
        } else {
            player.play();
            if (btnPlayPause != null) {
                btnPlayPause.setText("⏸  Pause");
            }
            showZapFeedback("▶ Lecture", "Reprise de la lecture");
        }
    }

    private void seekRelative(long deltaMs) {
        if (player == null) return;
        long pos = player.getCurrentPosition();
        long target = Math.max(0, pos + deltaMs);
        long dur = player.getDuration();
        if (dur > 0 && target > dur) target = dur;
        player.seekTo(target);
        showOsd();
        String label = deltaMs > 0 ? "⏩ +" + (deltaMs / 1000) + "s" : "⏪ " + (deltaMs / 1000) + "s";
        showZapFeedback(label, "");
    }

    private void toggleAspectRatio() {
        currentResizeModeIndex = (currentResizeModeIndex + 1) % RESIZE_MODES.length;
        int mode = RESIZE_MODES[currentResizeModeIndex];
        String name = RESIZE_MODE_NAMES[currentResizeModeIndex];
        if (playerView != null) {
            playerView.setResizeMode(mode);
        }
        showZapFeedback("📐 Format d'image", name);
    }

    private void showAudioTrackDialog() {
        if (player == null) return;
        Tracks tracks = player.getCurrentTracks();
        List<String> trackNames = new ArrayList<>();
        List<Tracks.Group> audioGroups = new ArrayList<>();
        List<Integer> trackIndices = new ArrayList<>();
        int selectedIndex = -1;

        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() == C.TRACK_TYPE_AUDIO) {
                for (int i = 0; i < group.length; i++) {
                    Format format = group.getTrackFormat(i);
                    audioGroups.add(group);
                    trackIndices.add(i);

                    String lang = format.language != null ? format.language.toUpperCase() : "Inconnu";
                    String label = format.label != null && !format.label.isEmpty() ? format.label : "Piste " + (trackNames.size() + 1);
                    String channels = format.channelCount > 0 ? " (" + format.channelCount + " ch)" : "";
                    trackNames.add(label + " [" + lang + "]" + channels);

                    if (group.isTrackSelected(i)) {
                        selectedIndex = trackNames.size() - 1;
                    }
                }
            }
        }

        if (trackNames.isEmpty()) {
            Toast.makeText(this, "Aucune piste audio alternative", Toast.LENGTH_SHORT).show();
            return;
        }

        CharSequence[] items = trackNames.toArray(new CharSequence[0]);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Piste audio")
                .setSingleChoiceItems(items, selectedIndex, (dialog, which) -> {
                    Tracks.Group chosenGroup = audioGroups.get(which);
                    int trackIdx = trackIndices.get(which);
                    player.setTrackSelectionParameters(
                            player.getTrackSelectionParameters()
                                    .buildUpon()
                                    .setOverrideForType(new TrackSelectionOverride(
                                            chosenGroup.getMediaTrackGroup(), Collections.singletonList(trackIdx)))
                                    .build()
                    );
                    showZapFeedback("🔊 Piste audio", items[which].toString());
                    dialog.dismiss();
                })
                .setNegativeButton("Annuler", null)
                .show();
    }

    private void showSubtitlesDialog() {
        if (player == null) return;
        Tracks tracks = player.getCurrentTracks();
        List<String> trackNames = new ArrayList<>();
        List<Tracks.Group> textGroups = new ArrayList<>();
        List<Integer> trackIndices = new ArrayList<>();

        trackNames.add("Désactivé (Aucun)");
        textGroups.add(null);
        trackIndices.add(-1);

        int selectedIndex = 0;
        boolean isDisabled = player.getTrackSelectionParameters().disabledTrackTypes.contains(C.TRACK_TYPE_TEXT);

        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() == C.TRACK_TYPE_TEXT) {
                for (int i = 0; i < group.length; i++) {
                    Format format = group.getTrackFormat(i);
                    textGroups.add(group);
                    trackIndices.add(i);

                    String lang = format.language != null ? format.language.toUpperCase() : "Inconnu";
                    String label = format.label != null && !format.label.isEmpty() ? format.label : "Sous-titre " + trackNames.size();
                    trackNames.add(label + " [" + lang + "]");

                    if (!isDisabled && group.isTrackSelected(i)) {
                        selectedIndex = trackNames.size() - 1;
                    }
                }
            }
        }

        CharSequence[] items = trackNames.toArray(new CharSequence[0]);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Sous-titres")
                .setSingleChoiceItems(items, selectedIndex, (dialog, which) -> {
                    if (which == 0) {
                        player.setTrackSelectionParameters(
                                player.getTrackSelectionParameters()
                                        .buildUpon()
                                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                                        .build()
                        );
                        showZapFeedback("💬 Sous-titres", "Désactivés");
                    } else {
                        Tracks.Group chosenGroup = textGroups.get(which);
                        int trackIdx = trackIndices.get(which);
                        player.setTrackSelectionParameters(
                                player.getTrackSelectionParameters()
                                        .buildUpon()
                                        .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                                        .setOverrideForType(new TrackSelectionOverride(
                                                chosenGroup.getMediaTrackGroup(), Collections.singletonList(trackIdx)))
                                        .build()
                        );
                        showZapFeedback("💬 Sous-titres", items[which].toString());
                    }
                    dialog.dismiss();
                })
                .setNegativeButton("Annuler", null)
                .show();
    }

    private void showZapFeedback(String title, String subtitle) {
        if (zapFeedbackCard == null) return;
        zapHandler.removeCallbacks(hideZapRunnable);
        zapFeedbackTitle.setText(title);
        zapFeedbackSub.setText(subtitle != null ? subtitle : "");
        zapFeedbackCard.setVisibility(View.VISIBLE);
        zapFeedbackCard.setAlpha(1f);
        zapFeedbackCard.setScaleX(1f);
        zapFeedbackCard.setScaleY(1f);
        zapHandler.postDelayed(hideZapRunnable, 1800);
    }

    @Override
    protected void onStop() {
        saveCurrentPlaybackPosition(false);
        super.onStop();
        mainHandler.removeCallbacks(progressRunnable);
        stopCountdown();
        releasePrefetchPlayer();
        if (player != null) {
            player.pause();
        }
    }

    @Override
    protected void onDestroy() {
        saveCurrentPlaybackPosition(false);
        isPlayerActivityActive = false;
        super.onDestroy();
        mainHandler.removeCallbacks(progressRunnable);
        stopCountdown();
        osdHandler.removeCallbacks(hideOsdRunnable);
        zapHandler.removeCallbacks(hideZapRunnable);
        releasePrefetchPlayer();
        try {
            epgFetchExecutor.shutdownNow();
        } catch (Exception ignored) {}
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
