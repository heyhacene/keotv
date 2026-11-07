package fr.keo.tv;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
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
import android.graphics.drawable.ClipDrawable;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.LayerDrawable;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
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
import androidx.media3.common.MimeTypes;
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
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory;
import androidx.media3.extractor.ts.TsExtractor;
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
    private boolean replayPlaybackEstablished = false;
    private long lastGoodReplayPos = 0L;
    private int replayMidStreamRetries = 0;
    private int replayPrematureEndRetries = 0;

    public static String getReplayUrlType(String url) {
        if (url == null) return "unknown";
        if (url.contains("/streaming/timeshift.php")) return "streaming_php";
        if (url.contains("/timeshift.php")) return "root_php";
        if (url.contains(".m3u8?utc=")) return "flussonic";
        if (url.matches(".*/timeshift/.*/\\d{9,11}/.*\\.m3u8.*")) return "epoch_m3u8";
        if (url.matches(".*/timeshift/.*/\\d{9,11}/.*\\.ts.*")) return "epoch_ts";
        if (url.contains(".m3u8")) return "timeshift_m3u8";
        if (url.contains("-") && !url.contains(":")) return "timeshift_ts_dash";
        return "timeshift_ts";
    }

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

    // Center Controls (Play/Pause, Rewind, Forward in middle of screen)
    private LinearLayout centerControlsCard;
    private TextView btnCenterRew;
    private TextView btnCenterPlayPause;
    private TextView btnCenterFwd;

    // Bottom Container: Timecode scrubber row + options row below it
    private LinearLayout bottomControlsContainer;
    private LinearLayout timeScrubberLayout;
    private TextView tvCurrentTime;
    private SeekBar timeSeekBar;
    private TextView tvTotalTime;
    private boolean isUserSeeking = false;

    // Bottom Options Bar (Options ONLY: Audio, Subtitles, Format, etc. - no duplicate transport buttons)
    private HorizontalScrollView bottomOptionsHsv;
    private LinearLayout bottomOptions;
    private TextView btnAudioTrack;
    private TextView btnSubtitles;
    private TextView btnAspectRatio;
    private TextView btnNextEpisode;
    private TextView btnRotate;

    // Center Feedback Toast Card for Zapping & Options
    private LinearLayout zapFeedbackCard;
    private TextView zapFeedbackTitle;
    private TextView zapFeedbackSub;
    private final Handler zapHandler = new Handler(Looper.getMainLooper());

    private ProgressBar loadingProgressBar;

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
            // When paused or seeking, keep controls visible
            if (player != null && !player.isPlaying()) return;
            if (isUserSeeking) return;

            if (osdContainer != null) {
                osdContainer.animate()
                        .alpha(0f)
                        .setDuration(300)
                        .withEndAction(() -> {
                            if (osdContainer != null) osdContainer.setVisibility(View.GONE);
                        });
            }
            if (centerControlsCard != null) {
                centerControlsCard.animate()
                        .alpha(0f)
                        .scaleX(0.92f)
                        .scaleY(0.92f)
                        .setDuration(300)
                        .withEndAction(() -> {
                            if (centerControlsCard != null) centerControlsCard.setVisibility(View.GONE);
                        });
            }
            if (bottomControlsContainer != null) {
                bottomControlsContainer.animate()
                        .alpha(0f)
                        .setDuration(300)
                        .withEndAction(() -> {
                            if (bottomControlsContainer != null) bottomControlsContainer.setVisibility(View.GONE);
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
                if (isReplayCascade) {
                    long p = player.getCurrentPosition();
                    if (p > 0) {
                        lastGoodReplayPos = p;
                    }
                }
                checkPlaybackProgress();
                updateTimelineProgress();
            }
            mainHandler.postDelayed(this, 1000);
        }
    };

    private void updateTimelineProgress() {
        if (player == null || isLive || isUserSeeking || timeSeekBar == null) return;
        long pos = player.getCurrentPosition();
        long dur = player.getDuration();
        if (dur > 0 && dur != C.TIME_UNSET) {
            timeSeekBar.setMax((int) (dur / 1000));
            timeSeekBar.setProgress((int) (pos / 1000));
            if (tvCurrentTime != null) tvCurrentTime.setText(formatTimeMs(pos));
            if (tvTotalTime != null) tvTotalTime.setText(formatTimeMs(dur));
        }
    }

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
        playerView.setUseController(false);
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

        // --- 1. CENTER PLAYBACK CONTROLS (Rewind, Play/Pause, Forward in middle of screen) ---
        centerControlsCard = new LinearLayout(this);
        centerControlsCard.setOrientation(LinearLayout.HORIZONTAL);
        centerControlsCard.setGravity(Gravity.CENTER);
        centerControlsCard.setPadding(dp(18), dp(12), dp(18), dp(12));
        centerControlsCard.setVisibility(View.GONE);

        GradientDrawable centerBg = new GradientDrawable();
        centerBg.setColor(Color.parseColor("#26090D16"));
        centerBg.setCornerRadius(dp(38));
        centerBg.setStroke(dp(1), Color.parseColor("#2638BDF8"));
        centerControlsCard.setBackground(centerBg);

        // Center Rewind button
        btnCenterRew = new TextView(this);
        btnCenterRew.setText(isLive ? "⏮ Chaîne -" : "⏪ -10s");
        btnCenterRew.setTextColor(Color.WHITE);
        btnCenterRew.setTextSize(13f);
        btnCenterRew.setTypeface(Typeface.DEFAULT_BOLD);
        btnCenterRew.setGravity(Gravity.CENTER);
        btnCenterRew.setPadding(dp(16), dp(12), dp(16), dp(12));
        btnCenterRew.setFocusable(true);
        btnCenterRew.setFocusableInTouchMode(true);
        GradientDrawable rewBg = new GradientDrawable();
        rewBg.setColor(Color.parseColor("#141E293B"));
        rewBg.setCornerRadius(dp(24));
        rewBg.setStroke(dp(1), Color.parseColor("#22334155"));
        btnCenterRew.setBackground(rewBg);
        btnCenterRew.setOnClickListener(v -> {
            showOsd();
            if (isLive) {
                zapPreviousChannel();
            } else {
                seekRelative(-10000);
            }
        });
        btnCenterRew.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btnCenterRew.getBackground();
            if (hasFocus) {
                d.setColor(Color.parseColor("#CC0284C7"));
                d.setStroke(dp(2), Color.WHITE);
                btnCenterRew.setScaleX(1.08f);
                btnCenterRew.setScaleY(1.08f);
            } else {
                d.setColor(Color.parseColor("#141E293B"));
                d.setStroke(dp(1), Color.parseColor("#22334155"));
                btnCenterRew.setScaleX(1.0f);
                btnCenterRew.setScaleY(1.0f);
            }
        });
        centerControlsCard.addView(btnCenterRew);

        // Center Play / Pause button (large prominent circle)
        btnCenterPlayPause = new TextView(this);
        btnCenterPlayPause.setText(player != null && player.isPlaying() ? "⏸" : "▶");
        btnCenterPlayPause.setTextColor(Color.WHITE);
        btnCenterPlayPause.setTextSize(28f);
        btnCenterPlayPause.setTypeface(Typeface.DEFAULT_BOLD);
        btnCenterPlayPause.setGravity(Gravity.CENTER);
        btnCenterPlayPause.setFocusable(true);
        btnCenterPlayPause.setFocusableInTouchMode(true);
        LinearLayout.LayoutParams playLp = new LinearLayout.LayoutParams(dp(70), dp(70));
        playLp.setMarginStart(dp(16));
        playLp.setMarginEnd(dp(16));
        btnCenterPlayPause.setLayoutParams(playLp);

        GradientDrawable centerPlayBg = new GradientDrawable();
        centerPlayBg.setColor(Color.parseColor("#660284C7"));
        centerPlayBg.setCornerRadius(dp(35));
        centerPlayBg.setStroke(dp(2), Color.parseColor("#38BDF8"));
        btnCenterPlayPause.setBackground(centerPlayBg);
        btnCenterPlayPause.setOnClickListener(v -> togglePlayPause());
        btnCenterPlayPause.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btnCenterPlayPause.getBackground();
            if (hasFocus) {
                d.setColor(Color.parseColor("#CC0284C7"));
                d.setStroke(dp(3), Color.WHITE);
                btnCenterPlayPause.setScaleX(1.12f);
                btnCenterPlayPause.setScaleY(1.12f);
            } else {
                d.setColor(Color.parseColor("#660284C7"));
                d.setStroke(dp(2), Color.parseColor("#38BDF8"));
                btnCenterPlayPause.setScaleX(1.0f);
                btnCenterPlayPause.setScaleY(1.0f);
            }
        });
        centerControlsCard.addView(btnCenterPlayPause);

        // Center Forward button
        btnCenterFwd = new TextView(this);
        btnCenterFwd.setText(isLive ? "⏭ Chaîne +" : "⏩ +10s");
        btnCenterFwd.setTextColor(Color.WHITE);
        btnCenterFwd.setTextSize(13f);
        btnCenterFwd.setTypeface(Typeface.DEFAULT_BOLD);
        btnCenterFwd.setGravity(Gravity.CENTER);
        btnCenterFwd.setPadding(dp(16), dp(12), dp(16), dp(12));
        btnCenterFwd.setFocusable(true);
        btnCenterFwd.setFocusableInTouchMode(true);
        GradientDrawable fwdBg = new GradientDrawable();
        fwdBg.setColor(Color.parseColor("#141E293B"));
        fwdBg.setCornerRadius(dp(24));
        fwdBg.setStroke(dp(1), Color.parseColor("#22334155"));
        btnCenterFwd.setBackground(fwdBg);
        btnCenterFwd.setOnClickListener(v -> {
            showOsd();
            if (isLive) {
                zapNextChannel();
            } else {
                seekRelative(10000);
            }
        });
        btnCenterFwd.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btnCenterFwd.getBackground();
            if (hasFocus) {
                d.setColor(Color.parseColor("#CC0284C7"));
                d.setStroke(dp(2), Color.WHITE);
                btnCenterFwd.setScaleX(1.08f);
                btnCenterFwd.setScaleY(1.08f);
            } else {
                d.setColor(Color.parseColor("#141E293B"));
                d.setStroke(dp(1), Color.parseColor("#22334155"));
                btnCenterFwd.setScaleX(1.0f);
                btnCenterFwd.setScaleY(1.0f);
            }
        });
        centerControlsCard.addView(btnCenterFwd);

        btnCenterPlayPause.setOnKeyListener((v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                    if (btnCenterRew != null) {
                        btnCenterRew.requestFocus();
                        return true;
                    }
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                    if (btnCenterFwd != null) {
                        btnCenterFwd.requestFocus();
                        return true;
                    }
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                    if (!isLive && timeSeekBar != null) {
                        timeSeekBar.requestFocus();
                        return true;
                    } else if (btnAudioTrack != null) {
                        btnAudioTrack.requestFocus();
                        return true;
                    }
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                    if (btnExit != null) {
                        btnExit.requestFocus();
                        return true;
                    }
                }
            }
            return false;
        });

        FrameLayout.LayoutParams centerParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        if (!isLive) {
            // For VOD/Series/Replay: position playback controls lower down to leave center of film clear
            centerParams.topMargin = dp(115);
        }
        root.addView(centerControlsCard, centerParams);

        // --- 2. BOTTOM CONTAINER (Timeline Scrubber + Options ONLY, no duplicate play/rewind buttons) ---
        bottomControlsContainer = new LinearLayout(this);
        bottomControlsContainer.setOrientation(LinearLayout.VERTICAL);
        bottomControlsContainer.setGravity(Gravity.CENTER_HORIZONTAL);
        bottomControlsContainer.setPadding(dp(24), dp(12), dp(24), dp(18));

        GradientDrawable bottomBg = new GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                new int[]{Color.parseColor("#80090D16"), Color.parseColor("#26090D16"), Color.TRANSPARENT}
        );
        bottomControlsContainer.setBackground(bottomBg);

        // Row 1: Timecode Scrubber (strictly for VOD / Series / Replay)
        if (!isLive) {
            timeScrubberLayout = new LinearLayout(this);
            timeScrubberLayout.setOrientation(LinearLayout.HORIZONTAL);
            timeScrubberLayout.setGravity(Gravity.CENTER_VERTICAL);
            timeScrubberLayout.setPadding(dp(8), dp(4), dp(8), dp(6));

            tvCurrentTime = new TextView(this);
            tvCurrentTime.setText("00:00:00");
            tvCurrentTime.setTextColor(Color.parseColor("#38BDF8"));
            tvCurrentTime.setTextSize(13f);
            tvCurrentTime.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
            timeScrubberLayout.addView(tvCurrentTime);

            timeSeekBar = new SeekBar(this);
            timeSeekBar.setFocusable(true);
            timeSeekBar.setFocusableInTouchMode(true);
            timeSeekBar.setPadding(dp(14), 0, dp(14), 0);

            // Styling SeekBar: Cyan progress and slate background track
            GradientDrawable progressTrack = new GradientDrawable();
            progressTrack.setColor(Color.parseColor("#38BDF8"));
            progressTrack.setCornerRadius(dp(4));
            ClipDrawable clipProgress = new ClipDrawable(progressTrack, Gravity.START, ClipDrawable.HORIZONTAL);

            GradientDrawable bgTrack = new GradientDrawable();
            bgTrack.setColor(Color.parseColor("#334155"));
            bgTrack.setCornerRadius(dp(4));

            LayerDrawable layers = new LayerDrawable(new android.graphics.drawable.Drawable[]{bgTrack, clipProgress});
            layers.setId(0, android.R.id.background);
            layers.setId(1, android.R.id.progress);
            timeSeekBar.setProgressDrawable(layers);

            GradientDrawable thumbNormal = new GradientDrawable();
            thumbNormal.setShape(GradientDrawable.OVAL);
            thumbNormal.setColor(Color.parseColor("#38BDF8"));
            thumbNormal.setStroke(dp(2), Color.WHITE);
            thumbNormal.setSize(dp(18), dp(18));
            timeSeekBar.setThumb(thumbNormal);
            timeSeekBar.setSplitTrack(false);

            timeSeekBar.setOnFocusChangeListener((v, hasFocus) -> {
                GradientDrawable t = new GradientDrawable();
                t.setShape(GradientDrawable.OVAL);
                if (hasFocus) {
                    t.setColor(Color.parseColor("#0284C7"));
                    t.setStroke(dp(3), Color.WHITE);
                    t.setSize(dp(22), dp(22));
                } else {
                    t.setColor(Color.parseColor("#38BDF8"));
                    t.setStroke(dp(2), Color.WHITE);
                    t.setSize(dp(18), dp(18));
                }
                timeSeekBar.setThumb(t);
            });

            timeSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override
                public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                    if (fromUser) {
                        long targetMs = progress * 1000L;
                        if (tvCurrentTime != null) {
                            tvCurrentTime.setText(formatTimeMs(targetMs));
                        }
                    }
                }

                @Override
                public void onStartTrackingTouch(SeekBar seekBar) {
                    isUserSeeking = true;
                    osdHandler.removeCallbacks(hideOsdRunnable);
                }

                @Override
                public void onStopTrackingTouch(SeekBar seekBar) {
                    isUserSeeking = false;
                    if (player != null) {
                        long target = seekBar.getProgress() * 1000L;
                        player.seekTo(target);
                        if (isReplayCascade) {
                            lastGoodReplayPos = target;
                        }
                    }
                    if (player != null && player.isPlaying() && pendingOsdTimeoutMs > 0) {
                        osdHandler.postDelayed(hideOsdRunnable, pendingOsdTimeoutMs);
                    }
                }
            });

            timeSeekBar.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                        seekRelative(-10000);
                        updateTimelineProgress();
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        seekRelative(10000);
                        updateTimelineProgress();
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                        if (btnCenterPlayPause != null) {
                            btnCenterPlayPause.requestFocus();
                            return true;
                        }
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                        if (btnAudioTrack != null) {
                            btnAudioTrack.requestFocus();
                            return true;
                        }
                    }
                }
                return false;
            });

            LinearLayout.LayoutParams seekParams = new LinearLayout.LayoutParams(0, dp(32), 1.0f);
            seekParams.setMarginStart(dp(10));
            seekParams.setMarginEnd(dp(10));
            timeScrubberLayout.addView(timeSeekBar, seekParams);

            tvTotalTime = new TextView(this);
            tvTotalTime.setText("00:00:00");
            tvTotalTime.setTextColor(Color.parseColor("#94A3B8"));
            tvTotalTime.setTextSize(13f);
            tvTotalTime.setTypeface(Typeface.MONOSPACE);
            timeScrubberLayout.addView(tvTotalTime);

            bottomControlsContainer.addView(timeScrubberLayout, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        }

        // Row 2: Options ONLY (Audio, Subtitles, Aspect Ratio, Next Episode, Orientation)
        bottomOptionsHsv = new HorizontalScrollView(this);
        bottomOptionsHsv.setHorizontalScrollBarEnabled(false);
        bottomOptionsHsv.setFillViewport(true);

        bottomOptions = new LinearLayout(this);
        bottomOptions.setOrientation(LinearLayout.HORIZONTAL);
        bottomOptions.setGravity(Gravity.CENTER);
        bottomOptions.setPadding(dp(8), dp(4), dp(8), dp(4));

        btnAudioTrack = createOsdButton("🔊  Piste Audio", v -> showAudioTrackDialog());
        btnAudioTrack.setOnKeyListener((v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                if (!isLive && timeSeekBar != null) {
                    timeSeekBar.requestFocus();
                    return true;
                } else if (btnCenterPlayPause != null) {
                    btnCenterPlayPause.requestFocus();
                    return true;
                }
            }
            return false;
        });
        bottomOptions.addView(btnAudioTrack);

        btnSubtitles = createOsdButton("💬  Sous-titres", v -> showSubtitlesDialog());
        LinearLayout.LayoutParams subParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subParams.setMarginStart(dp(12));
        btnSubtitles.setLayoutParams(subParams);
        btnSubtitles.setOnKeyListener((v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                if (!isLive && timeSeekBar != null) {
                    timeSeekBar.requestFocus();
                    return true;
                } else if (btnCenterPlayPause != null) {
                    btnCenterPlayPause.requestFocus();
                    return true;
                }
            }
            return false;
        });
        bottomOptions.addView(btnSubtitles);

        btnAspectRatio = createOsdButton("📐  Format", v -> toggleAspectRatio());
        LinearLayout.LayoutParams aspParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        aspParams.setMarginStart(dp(12));
        btnAspectRatio.setLayoutParams(aspParams);
        btnAspectRatio.setOnKeyListener((v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                if (!isLive && timeSeekBar != null) {
                    timeSeekBar.requestFocus();
                    return true;
                } else if (btnCenterPlayPause != null) {
                    btnCenterPlayPause.requestFocus();
                    return true;
                }
            }
            return false;
        });
        bottomOptions.addView(btnAspectRatio);

        if (!isLive && pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
            btnNextEpisode = createOsdButton("⏭  Épisode Suivant", v -> launchNextEpisode());
            LinearLayout.LayoutParams neParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            neParams.setMarginStart(dp(12));
            btnNextEpisode.setLayoutParams(neParams);
            bottomOptions.addView(btnNextEpisode);
        }

        if (!isTv) {
            btnRotate = createOsdButton("🔄  Rotation", v -> toggleScreenOrientation());
            LinearLayout.LayoutParams rotParams = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            rotParams.setMarginStart(dp(12));
            btnRotate.setLayoutParams(rotParams);
            bottomOptions.addView(btnRotate);
        }

        bottomOptionsHsv.addView(bottomOptions);
        bottomControlsContainer.addView(bottomOptionsHsv, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(bottomControlsContainer, bottomParams);

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

        // Center Buffering Spinner (Cyan glow)
        loadingProgressBar = new ProgressBar(this);
        loadingProgressBar.setIndeterminate(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            loadingProgressBar.setIndeterminateTintList(ColorStateList.valueOf(0xFF38BDF8));
        }
        FrameLayout.LayoutParams pbParams = new FrameLayout.LayoutParams(
                dp(56), dp(56), Gravity.CENTER);
        root.addView(loadingProgressBar, pbParams);

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

                // Swipe vertical: changement de chaîne STRICTEMENT en Live TV (jamais en Replay ni VOD)
                if (isLive && !isReplayCascade && Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > dp(35)) {
                    if (diffY < 0) {
                        zapNextChannel();
                    } else {
                        zapPreviousChannel();
                    }
                    return true;
                }

                // Swipe horizontal pour VOD et Replay: avance/retour rapide 10s
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

        if (isReplayCascade) {
            replayPlaybackEstablished = false;
            lastGoodReplayPos = 0L;
            replayMidStreamRetries = 0;
            replayPrematureEndRetries = 0;
            if (badgeView != null) {
                badgeView.setText("REPLAY TV");
            }
        }

        DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent(pendingUserAgent)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(isReplayCascade ? 3500 : 8000)
                .setReadTimeoutMs(isReplayCascade ? 5000 : 10000);

        int minBufferMs = isReplayCascade ? 20000 : 2500;
        int maxBufferMs = isReplayCascade ? 60000 : 15000;
        int bufferForPlaybackMs = isReplayCascade ? 800 : 500;
        int bufferForPlaybackAfterRebufferMs = isReplayCascade ? 2500 : 1200;

        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                        minBufferMs,
                        maxBufferMs,
                        bufferForPlaybackMs,
                        bufferForPlaybackAfterRebufferMs
                )
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();

        DefaultExtractorsFactory extractorsFactory = new DefaultExtractorsFactory()
                .setTsExtractorFlags(
                        DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES |
                        DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS |
                        DefaultTsPayloadReaderFactory.FLAG_IGNORE_SPLICE_INFO
                )
                .setTsExtractorMode(TsExtractor.MODE_SINGLE_PMT);

        DefaultMediaSourceFactory mediaSourceFactory = new DefaultMediaSourceFactory(httpFactory, extractorsFactory)
                .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(3));

        player = new ExoPlayer.Builder(this)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(mediaSourceFactory)
                .build();
        player.setWakeMode(C.WAKE_MODE_NETWORK);
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
                if (isReplayCascade) {
                    replayPlaybackEstablished = false;
                    lastGoodReplayPos = 0L;
                    replayMidStreamRetries = 0;
                }
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
                updatePlayPauseButtonIcon();
                if (isPlaying) {
                    if (pendingOsdTimeoutMs > 0) {
                        osdHandler.removeCallbacks(hideOsdRunnable);
                        osdHandler.postDelayed(hideOsdRunnable, pendingOsdTimeoutMs);
                    }
                } else {
                    osdHandler.removeCallbacks(hideOsdRunnable);
                }
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_BUFFERING) {
                    if (loadingProgressBar != null) loadingProgressBar.setVisibility(View.VISIBLE);
                } else if (playbackState == Player.STATE_READY) {
                    if (loadingProgressBar != null) loadingProgressBar.setVisibility(View.GONE);
                    errorView.setVisibility(View.GONE);
                    if (isReplayCascade) {
                        replayPlaybackEstablished = true;
                        replayMidStreamRetries = 0;
                        replayPrematureEndRetries = 0;
                        int curIdx = player != null ? player.getCurrentMediaItemIndex() : -1;
                        if (curIdx >= 0 && curIdx < pendingUrls.size()) {
                            String winUrl = pendingUrls.get(curIdx);
                            String winType = getReplayUrlType(winUrl);
                            getSharedPreferences("keotv_player", Context.MODE_PRIVATE)
                                    .edit()
                                    .putString("working_replay_type", winType)
                                    .apply();
                        }
                    }
                } else if (playbackState == Player.STATE_ENDED) {
                    if (loadingProgressBar != null) loadingProgressBar.setVisibility(View.GONE);
                    if (isReplayCascade) {
                        long pos = player != null ? player.getCurrentPosition() : 0L;
                        long dur = player != null ? player.getDuration() : 0L;
                        // If playback ended prematurely far before the end of the program (e.g. server closed socket mid-stream)
                        if (dur > 60000L && pos > 0 && pos < (dur - 45000L) && replayPrematureEndRetries < 4) {
                            replayPrematureEndRetries++;
                            showZapFeedback("Replay", "Reprise de la lecture...");
                            long resumePos = Math.max(0L, pos - 2000L);
                            int curIdx = player != null ? player.getCurrentMediaItemIndex() : 0;
                            player.seekTo(curIdx, resumePos);
                            player.prepare();
                            player.play();
                            return;
                        }
                        showZapFeedback("Replay", "Fin du replay");
                        return;
                    }
                    // Mark current item as completed (100%)
                    saveCurrentPlaybackPosition(true);
                    // Auto-advance to next episode strictly for Series
                    if (!isLive && !isReplayCascade && pendingSeriesId != null && !pendingSeriesId.isEmpty() && player != null && player.hasNextMediaItem() && !nextEpisodeDismissed) {
                        launchNextEpisode();
                    }
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                if (loadingProgressBar != null) loadingProgressBar.setVisibility(View.GONE);
                handlePlayerError(error);
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                updateTrackButtonLabels(tracks);
                applyExactTrackOverridesIfSaved(tracks);
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

    private String getCurrentPlayingUrl() {
        if (player == null) return "";
        try {
            int idx = player.getCurrentMediaItemIndex();
            if (idx >= 0 && idx < pendingUrls.size()) {
                return pendingUrls.get(idx);
            }
        } catch (Exception ignored) {}
        return "";
    }

    private void applyLanguagePreferences() {
        if (player == null) return;
        SharedPreferences prefs = getSharedPreferences("keotv_series_prefs", Context.MODE_PRIVATE);

        String audioPref = pendingPreferredAudio;
        String subPref = pendingPreferredSubtitle;

        // Series persistence: applies across ALL episodes of the series!
        if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
            if (audioPref != null && !audioPref.isEmpty()) {
                prefs.edit().putString("audio_" + pendingSeriesId, audioPref).apply();
            } else {
                audioPref = prefs.getString("audio_" + pendingSeriesId, prefs.getString("global_series_audio", null));
            }

            if (subPref != null && !subPref.isEmpty()) {
                prefs.edit().putString("sub_" + pendingSeriesId, subPref).apply();
            } else {
                subPref = prefs.getString("sub_" + pendingSeriesId, prefs.getString("global_series_sub", null));
            }
        } else if (!isLive) {
            // VOD Movie persistence: saved per movie URL / stream
            String curUrl = getCurrentPlayingUrl();
            if (audioPref != null && !audioPref.isEmpty()) {
                if (!curUrl.isEmpty()) prefs.edit().putString("vod_audio_" + curUrl, audioPref).apply();
            } else if (!curUrl.isEmpty()) {
                audioPref = prefs.getString("vod_audio_" + curUrl, prefs.getString("global_vod_audio", null));
            }

            if (subPref != null && !subPref.isEmpty()) {
                if (!curUrl.isEmpty()) prefs.edit().putString("vod_sub_" + curUrl, subPref).apply();
            } else if (!curUrl.isEmpty()) {
                subPref = prefs.getString("vod_sub_" + curUrl, prefs.getString("global_vod_sub", null));
            }
        }

        TrackSelectionParameters.Builder builder = player.getTrackSelectionParameters().buildUpon();

        if (audioPref != null && !audioPref.isEmpty()) {
            String lower = audioPref.trim().toLowerCase();
            if (lower.contains("vf") || lower.contains("fr")) {
                builder.setPreferredAudioLanguages("fra", "fre", "fr");
            } else if (lower.contains("vo") || lower.contains("en") || lower.contains("eng")) {
                builder.setPreferredAudioLanguages("eng", "en", "original", "und");
            } else {
                builder.setPreferredAudioLanguages(lower);
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
            } else {
                builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
                builder.setPreferredTextLanguages(lower);
            }
        }

        player.setTrackSelectionParameters(builder.build());
    }

    private void applyExactTrackOverridesIfSaved(Tracks tracks) {
        if (player == null || tracks == null || isLive) return;
        SharedPreferences prefs = getSharedPreferences("keotv_series_prefs", Context.MODE_PRIVATE);

        String audioPref = null;
        String subPref = null;

        if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
            audioPref = prefs.getString("audio_" + pendingSeriesId, prefs.getString("global_series_audio", null));
            subPref = prefs.getString("sub_" + pendingSeriesId, prefs.getString("global_series_sub", null));
        } else {
            String curUrl = getCurrentPlayingUrl();
            if (!curUrl.isEmpty()) {
                audioPref = prefs.getString("vod_audio_" + curUrl, prefs.getString("global_vod_audio", null));
                subPref = prefs.getString("vod_sub_" + curUrl, prefs.getString("global_vod_sub", null));
            }
        }

        TrackSelectionParameters.Builder builder = player.getTrackSelectionParameters().buildUpon();
        boolean changed = false;

        // Apply audio override if an exact matching track is found and not currently selected
        if (audioPref != null && !audioPref.isEmpty()) {
            String lower = audioPref.toLowerCase();
            for (Tracks.Group group : tracks.getGroups()) {
                if (group.getType() == C.TRACK_TYPE_AUDIO) {
                    for (int i = 0; i < group.length; i++) {
                        Format f = group.getTrackFormat(i);
                        String lang = f.language != null ? f.language.toLowerCase() : "";
                        String label = f.label != null ? f.label.toLowerCase() : "";
                        boolean matches = (!lang.isEmpty() && (lang.contains(lower) || lower.contains(lang))) ||
                                          (!label.isEmpty() && (label.contains(lower) || lower.contains(label)));
                        if ((lower.contains("vo") || lower.contains("en")) && (lang.contains("en") || lang.contains("eng") || label.contains("eng") || label.contains("english"))) {
                            matches = true;
                        } else if ((lower.contains("vf") || lower.contains("fr")) && (lang.contains("fr") || lang.contains("fre") || lang.contains("fra") || label.contains("french") || label.contains("francais"))) {
                            matches = true;
                        }
                        if (matches && !group.isTrackSelected(i)) {
                            builder.setOverrideForType(new TrackSelectionOverride(group.getMediaTrackGroup(), Collections.singletonList(i)));
                            changed = true;
                            break;
                        }
                    }
                }
            }
        }

        // Apply subtitles override
        if (subPref != null && !subPref.isEmpty()) {
            String lower = subPref.toLowerCase();
            if (lower.equals("off") || lower.equals("none") || lower.equals("sans")) {
                if (!player.getTrackSelectionParameters().disabledTrackTypes.contains(C.TRACK_TYPE_TEXT)) {
                    builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true);
                    changed = true;
                }
            } else {
                builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false);
                for (Tracks.Group group : tracks.getGroups()) {
                    if (group.getType() == C.TRACK_TYPE_TEXT) {
                        for (int i = 0; i < group.length; i++) {
                            Format f = group.getTrackFormat(i);
                            String lang = f.language != null ? f.language.toLowerCase() : "";
                            String label = f.label != null ? f.label.toLowerCase() : "";
                            boolean matches = (!lang.isEmpty() && (lang.contains(lower) || lower.contains(lang))) ||
                                              (!label.isEmpty() && (label.contains(lower) || lower.contains(label)));
                            if (lower.contains("fr") && (lang.contains("fr") || lang.contains("fra") || lang.contains("fre") || label.contains("french") || label.contains("francais"))) {
                                matches = true;
                            } else if (lower.contains("en") && (lang.contains("en") || lang.contains("eng") || label.contains("english"))) {
                                matches = true;
                            }
                            if (matches && !group.isTrackSelected(i)) {
                                builder.setOverrideForType(new TrackSelectionOverride(group.getMediaTrackGroup(), Collections.singletonList(i)));
                                changed = true;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (changed) {
            player.setTrackSelectionParameters(builder.build());
        }
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
        MediaItem.Builder builder = new MediaItem.Builder()
                .setUri(url)
                .setMediaMetadata(new androidx.media3.common.MediaMetadata.Builder().setTitle(title).build());
        if (url != null) {
            String lower = url.toLowerCase();
            if (lower.contains(".m3u8")) {
                builder.setMimeType(MimeTypes.APPLICATION_M3U8);
            } else if (lower.contains(".mpd")) {
                builder.setMimeType(MimeTypes.APPLICATION_MPD);
            } else if (lower.endsWith(".ts") || lower.contains(".ts?")) {
                builder.setMimeType(MimeTypes.VIDEO_MP2T);
            }
            // Do not force VIDEO_MP2T on timeshift.php or extensionless endpoints
            // so ExoPlayer automatically sniffs Content-Type header / stream format
        }
        return builder.build();
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

        if (centerControlsCard != null) {
            centerControlsCard.setVisibility(View.VISIBLE);
            centerControlsCard.animate().cancel();
            centerControlsCard.setAlpha(1f);
            centerControlsCard.setScaleX(1f);
            centerControlsCard.setScaleY(1f);
        }

        if (bottomControlsContainer != null) {
            bottomControlsContainer.setVisibility(View.VISIBLE);
            bottomControlsContainer.animate().cancel();
            bottomControlsContainer.setAlpha(1f);
        }

        updatePlayPauseButtonIcon();
        updateTimelineProgress();

        // Show rich semi-transparent EPG overlay for the currently active channel (Live TV mode)
        if (isLive && epgOverlayCard != null) {
            int currentIdx = (player != null) ? player.getCurrentMediaItemIndex() : pendingIndex;
            updateEpgOverlayForIndex(currentIdx);
        }

        if (pendingOsdTimeoutMs > 0 && player != null && player.isPlaying()) {
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
        if (centerControlsCard != null) {
            centerControlsCard.animate().cancel();
            centerControlsCard.setAlpha(0f);
            centerControlsCard.setVisibility(View.GONE);
        }
        if (bottomControlsContainer != null) {
            bottomControlsContainer.animate().cancel();
            bottomControlsContainer.setAlpha(0f);
            bottomControlsContainer.setVisibility(View.GONE);
        }
        if (epgOverlayCard != null) {
            epgOverlayCard.animate().cancel();
            epgOverlayCard.setAlpha(0f);
            epgOverlayCard.setVisibility(View.GONE);
        }
    }

    private boolean isOsdVisible() {
        return (centerControlsCard != null && centerControlsCard.getVisibility() == View.VISIBLE && centerControlsCard.getAlpha() > 0.3f)
                || (osdContainer != null && osdContainer.getVisibility() == View.VISIBLE && osdContainer.getAlpha() > 0.3f)
                || (bottomControlsContainer != null && bottomControlsContainer.getVisibility() == View.VISIBLE && bottomControlsContainer.getAlpha() > 0.3f);
    }

    private boolean isControllerVisible() {
        return isOsdVisible();
    }

    private void toggleOsd() {
        if (isOsdVisible()) {
            hideOsdImmediately();
        } else {
            showOsd();
            if (btnCenterPlayPause != null) {
                btnCenterPlayPause.requestFocus();
            }
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

        // 1. If this is a Replay / Catchup stream (!isLive and multiple fallback URLs were provided)
        if (isReplayCascade) {
            // A. If replay playback was already established and we were streaming mid-program:
            // DO NOT cascade to the next format URL! Reconnect in-place on the working URL.
            if (replayPlaybackEstablished && lastGoodReplayPos > 3000L) {
                if (replayMidStreamRetries < 4) {
                    replayMidStreamRetries++;
                    showZapFeedback("Replay", "Reconnexion en cours... (" + replayMidStreamRetries + "/4)");
                    long resumePos = Math.max(0L, lastGoodReplayPos - 2000L);
                    player.seekTo(index, resumePos);
                    player.prepare();
                    player.play();
                    return;
                }
            }

            // B. If initial startup probe failed (or mid-stream retries exhausted), try the next URL format:
            if (index < player.getMediaItemCount() - 1) {
                replayPlaybackEstablished = false;
                lastGoodReplayPos = 0L;
                replayMidStreamRetries = 0;
                showZapFeedback("Replay", "Connexion au replay (" + (index + 2) + "/" + player.getMediaItemCount() + ")...");
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

            // 3. Back key handling: hides controls/OSD if visible, else saves position & closes player
            if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_ESCAPE) {
                if (isOsdVisible()) {
                    hideOsdImmediately();
                    return true;
                }
                saveCurrentPlaybackPosition(false);
                finish();
                return true;
            }

            // 4. OK / CENTER BUTTON (1st click = Pause & Show Controls; 2nd click = Resume Playback & Hide Controls)
            if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                if (!isOsdVisible()) {
                    // Click 1: Pause video, display center controls + bottom scrubber + options, focus center Play button
                    if (player.isPlaying()) {
                        player.pause();
                    }
                    showOsd();
                    if (btnCenterPlayPause != null) {
                        btnCenterPlayPause.requestFocus();
                    }
                    return true;
                } else {
                    // Controls are currently visible:
                    // Check if an options button is focused (Audio, Subtitles, Format, Next episode, Exit)
                    boolean isOptionFocused = (btnAudioTrack != null && btnAudioTrack.isFocused()) ||
                            (btnSubtitles != null && btnSubtitles.isFocused()) ||
                            (btnAspectRatio != null && btnAspectRatio.isFocused()) ||
                            (btnNextEpisode != null && btnNextEpisode.isFocused()) ||
                            (btnRotate != null && btnRotate.isFocused()) ||
                            (btnExit != null && btnExit.isFocused());
                    if (isOptionFocused) {
                        return super.dispatchKeyEvent(event);
                    }

                    // If center Rewind or Forward is focused:
                    if (btnCenterRew != null && btnCenterRew.isFocused()) {
                        if (isLive) zapPreviousChannel(); else seekRelative(-10000);
                        return true;
                    }
                    if (btnCenterFwd != null && btnCenterFwd.isFocused()) {
                        if (isLive) zapNextChannel(); else seekRelative(10000);
                        return true;
                    }

                    // Click 2 (on Center Play button, SeekBar, or default): Resume playback & hide controls!
                    if (!player.isPlaying()) {
                        player.play();
                    }
                    hideOsdImmediately();
                    return true;
                }
            }

            // 5. LIVE TV D-PAD NAVIGATION (Up/Down always zap channels seamlessly, STRICTLY when live)
            if (isLive && !isReplayCascade && !singleStreamMode) {
                if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_CHANNEL_UP || key == KeyEvent.KEYCODE_PAGE_UP) {
                    zapNextChannel();
                    return true;
                }
                if (key == KeyEvent.KEYCODE_DPAD_DOWN || key == KeyEvent.KEYCODE_CHANNEL_DOWN || key == KeyEvent.KEYCODE_PAGE_DOWN) {
                    zapPreviousChannel();
                    return true;
                }
            }

            // 6. VOD / SERIES / REPLAY NAVIGATION (Never zap channels!)
            if (!isLive || isReplayCascade || singleStreamMode) {
                if (key == KeyEvent.KEYCODE_CHANNEL_UP || key == KeyEvent.KEYCODE_CHANNEL_DOWN ||
                        key == KeyEvent.KEYCODE_PAGE_UP || key == KeyEvent.KEYCODE_PAGE_DOWN) {
                    return true; // Strictly consume & ignore channel zapping keys
                }
                if (!isOsdVisible()) {
                    if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || key == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        seekRelative(10000);
                        showOsd();
                        return true;
                    }
                    if (key == KeyEvent.KEYCODE_MEDIA_REWIND || key == KeyEvent.KEYCODE_DPAD_LEFT) {
                        seekRelative(-10000);
                        showOsd();
                        return true;
                    }
                    if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN) {
                        showOsd();
                        if (btnCenterPlayPause != null) btnCenterPlayPause.requestFocus();
                        return true;
                    }
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
        if (player == null || !isLive || isReplayCascade) return;
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
            DefaultExtractorsFactory preExtractorsFactory = new DefaultExtractorsFactory()
                    .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES | DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS)
                    .setTsExtractorMode(TsExtractor.MODE_SINGLE_PMT);
            final ExoPlayer pre = new ExoPlayer.Builder(this)
                    .setLoadControl(lc)
                    .setMediaSourceFactory(new DefaultMediaSourceFactory(httpFactory, preExtractorsFactory)
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

    private void updatePlayPauseButtonIcon() {
        if (btnCenterPlayPause != null) {
            boolean playing = player != null && player.isPlaying();
            btnCenterPlayPause.setText(playing ? "⏸" : "▶");
        }
    }

    private void togglePlayPause() {
        if (player == null) return;
        if (player.isPlaying()) {
            player.pause();
            updatePlayPauseButtonIcon();
            showOsd();
            showZapFeedback("⏸ Pause", "Lecture suspendue");
        } else {
            player.play();
            updatePlayPauseButtonIcon();
            hideOsdImmediately();
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
        if (isReplayCascade) {
            lastGoodReplayPos = target;
        }
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

    private void updateTrackButtonLabels(Tracks tracks) {
        if (tracks == null) return;
        try {
            String activeAudio = null;
            String activeSub = null;
            boolean subDisabled = player != null && player.getTrackSelectionParameters().disabledTrackTypes.contains(C.TRACK_TYPE_TEXT);

            for (Tracks.Group group : tracks.getGroups()) {
                if (group.getType() == C.TRACK_TYPE_AUDIO) {
                    for (int i = 0; i < group.length; i++) {
                        if (group.isTrackSelected(i)) {
                            Format f = group.getTrackFormat(i);
                            activeAudio = f.language != null ? f.language.toUpperCase() : (f.label != null && !f.label.isEmpty() ? f.label : "Piste " + (i + 1));
                            break;
                        }
                    }
                } else if (group.getType() == C.TRACK_TYPE_TEXT && !subDisabled) {
                    for (int i = 0; i < group.length; i++) {
                        if (group.isTrackSelected(i)) {
                            Format f = group.getTrackFormat(i);
                            activeSub = f.language != null ? f.language.toUpperCase() : (f.label != null && !f.label.isEmpty() ? f.label : "ST " + (i + 1));
                            break;
                        }
                    }
                }
            }

            final String fAudio = activeAudio;
            final String fSub = activeSub;
            final boolean fDisabled = subDisabled;
            runOnUiThread(() -> {
                if (btnAudioTrack != null) {
                    btnAudioTrack.setText(fAudio != null ? "🔊 Audio (" + fAudio + ")" : "🔊 Piste Audio");
                }
                if (btnSubtitles != null) {
                    if (fDisabled || fSub == null) {
                        btnSubtitles.setText("💬 ST (OFF)");
                    } else {
                        btnSubtitles.setText("💬 ST (" + fSub + ")");
                    }
                }
            });
        } catch (Exception ignored) {}
    }

    private interface TrackSelectCallback {
        void onSelected(int index);
    }

    private void showStyledTrackSelectionDialog(String title, String subtitle, List<String> items, int selectedIndex, TrackSelectCallback callback) {
        if (isFinishing() || isDestroyed()) return;

        AlertDialog.Builder builder = new AlertDialog.Builder(this);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(16), dp(20), dp(16));
        GradientDrawable rootBg = new GradientDrawable();
        rootBg.setColor(Color.parseColor("#0F172A"));
        rootBg.setCornerRadius(dp(16));
        rootBg.setStroke(dp(1), Color.parseColor("#334155"));
        root.setBackground(rootBg);

        // Header Title
        TextView tvTitle = new TextView(this);
        tvTitle.setText(title);
        tvTitle.setTextSize(17f);
        tvTitle.setTypeface(Typeface.DEFAULT_BOLD);
        tvTitle.setTextColor(Color.WHITE);
        root.addView(tvTitle);

        if (subtitle != null && !subtitle.isEmpty()) {
            TextView tvSub = new TextView(this);
            tvSub.setText(subtitle);
            tvSub.setTextSize(12f);
            tvSub.setTextColor(Color.parseColor("#94A3B8"));
            tvSub.setPadding(0, dp(4), 0, dp(12));
            root.addView(tvSub);
        }

        ScrollView sv = new ScrollView(this);
        LinearLayout itemsContainer = new LinearLayout(this);
        itemsContainer.setOrientation(LinearLayout.VERTICAL);
        itemsContainer.setPadding(0, dp(4), 0, dp(8));

        AlertDialog dialog = builder.setView(root).create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }

        for (int i = 0; i < items.size(); i++) {
            final int idx = i;
            final boolean isSelected = (i == selectedIndex);

            LinearLayout itemRow = new LinearLayout(this);
            itemRow.setOrientation(LinearLayout.HORIZONTAL);
            itemRow.setGravity(Gravity.CENTER_VERTICAL);
            itemRow.setPadding(dp(14), dp(12), dp(14), dp(12));
            itemRow.setFocusable(true);

            LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            rowLp.setMargins(0, dp(4), 0, dp(4));
            itemRow.setLayoutParams(rowLp);

            GradientDrawable rowBg = new GradientDrawable();
            rowBg.setCornerRadius(dp(10));
            if (isSelected) {
                rowBg.setColor(Color.parseColor("#330284C7"));
                rowBg.setStroke(dp(2), Color.parseColor("#38BDF8"));
            } else {
                rowBg.setColor(Color.parseColor("#1E293B"));
                rowBg.setStroke(dp(1), Color.parseColor("#334155"));
            }
            itemRow.setBackground(rowBg);

            TextView tvItemTitle = new TextView(this);
            tvItemTitle.setText(items.get(i));
            tvItemTitle.setTextSize(14f);
            tvItemTitle.setTypeface(isSelected ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            tvItemTitle.setTextColor(isSelected ? Color.WHITE : Color.parseColor("#CBD5E1"));
            LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
            itemRow.addView(tvItemTitle, titleLp);

            if (isSelected) {
                TextView tvBadge = new TextView(this);
                tvBadge.setText("✓ ACTIF");
                tvBadge.setTextSize(11f);
                tvBadge.setTypeface(Typeface.DEFAULT_BOLD);
                tvBadge.setTextColor(Color.parseColor("#38BDF8"));
                tvBadge.setPadding(dp(8), dp(3), dp(8), dp(3));
                GradientDrawable badgeBg = new GradientDrawable();
                badgeBg.setColor(Color.parseColor("#0C4A6E"));
                badgeBg.setCornerRadius(dp(12));
                badgeBg.setStroke(dp(1), Color.parseColor("#0284C7"));
                tvBadge.setBackground(badgeBg);
                itemRow.addView(tvBadge);
            }

            itemRow.setOnFocusChangeListener((v, hasFocus) -> {
                GradientDrawable d = (GradientDrawable) itemRow.getBackground();
                if (hasFocus) {
                    d.setColor(Color.parseColor("#FF0284C7"));
                    d.setStroke(dp(2), Color.WHITE);
                    itemRow.setScaleX(1.02f);
                    itemRow.setScaleY(1.02f);
                    tvItemTitle.setTextColor(Color.WHITE);
                } else {
                    if (isSelected) {
                        d.setColor(Color.parseColor("#330284C7"));
                        d.setStroke(dp(2), Color.parseColor("#38BDF8"));
                        tvItemTitle.setTextColor(Color.WHITE);
                    } else {
                        d.setColor(Color.parseColor("#1E293B"));
                        d.setStroke(dp(1), Color.parseColor("#334155"));
                        tvItemTitle.setTextColor(Color.parseColor("#CBD5E1"));
                    }
                    itemRow.setScaleX(1.0f);
                    itemRow.setScaleY(1.0f);
                }
            });

            itemRow.setOnClickListener(v -> {
                dialog.dismiss();
                callback.onSelected(idx);
            });

            itemRow.setOnKeyListener((v, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN && (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER)) {
                    itemRow.performClick();
                    return true;
                }
                return false;
            });

            itemsContainer.addView(itemRow);
        }

        sv.addView(itemsContainer);
        LinearLayout.LayoutParams svLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f);
        svLp.height = Math.min(items.size() * dp(56) + dp(20), dp(320));
        root.addView(sv, svLp);

        TextView btnClose = new TextView(this);
        btnClose.setText("Fermer");
        btnClose.setTextSize(13f);
        btnClose.setTypeface(Typeface.DEFAULT_BOLD);
        btnClose.setTextColor(Color.parseColor("#94A3B8"));
        btnClose.setGravity(Gravity.CENTER);
        btnClose.setPadding(dp(16), dp(10), dp(16), dp(10));
        btnClose.setFocusable(true);
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(Color.parseColor("#1E293B"));
        closeBg.setCornerRadius(dp(8));
        btnClose.setBackground(closeBg);
        btnClose.setOnClickListener(v -> dialog.dismiss());
        btnClose.setOnFocusChangeListener((v, hasFocus) -> {
            GradientDrawable d = (GradientDrawable) btnClose.getBackground();
            if (hasFocus) {
                d.setColor(Color.parseColor("#334155"));
                d.setStroke(dp(2), Color.WHITE);
                btnClose.setTextColor(Color.WHITE);
            } else {
                d.setColor(Color.parseColor("#1E293B"));
                d.setStroke(0, Color.TRANSPARENT);
                btnClose.setTextColor(Color.parseColor("#94A3B8"));
            }
        });
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        closeLp.topMargin = dp(8);
        root.addView(btnClose, closeLp);

        dialog.show();
        itemsContainer.post(() -> {
            if (selectedIndex >= 0 && selectedIndex < itemsContainer.getChildCount()) {
                itemsContainer.getChildAt(selectedIndex).requestFocus();
            } else if (itemsContainer.getChildCount() > 0) {
                itemsContainer.getChildAt(0).requestFocus();
            }
        });
    }

    private void showAudioTrackDialog() {
        if (player == null) return;
        Tracks tracks = player.getCurrentTracks();
        List<String> trackNames = new ArrayList<>();
        List<Tracks.Group> audioGroups = new ArrayList<>();
        List<Integer> trackIndices = new ArrayList<>();
        int selectedIndex = -1;

        SharedPreferences p = getSharedPreferences("keotv_series_prefs", Context.MODE_PRIVATE);
        String savedAudio = null;
        if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
            savedAudio = p.getString("audio_" + pendingSeriesId, p.getString("global_series_audio", null));
        } else if (!isLive) {
            String curUrl = getCurrentPlayingUrl();
            if (!curUrl.isEmpty()) savedAudio = p.getString("vod_audio_" + curUrl, p.getString("global_vod_audio", null));
        }

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
                    } else if (selectedIndex == -1 && savedAudio != null && !savedAudio.isEmpty()) {
                        String fLang = format.language != null ? format.language.toLowerCase() : "";
                        String fLabel = format.label != null ? format.label.toLowerCase() : "";
                        String sLower = savedAudio.toLowerCase();
                        if (fLang.equals(sLower) || fLabel.equals(sLower) || fLang.contains(sLower) || sLower.contains(fLang)) {
                            selectedIndex = trackNames.size() - 1;
                        }
                    }
                }
            }
        }

        if (savedAudio != null && !savedAudio.isEmpty()) {
            for (int k = 0; k < audioGroups.size(); k++) {
                Format format = audioGroups.get(k).getTrackFormat(trackIndices.get(k));
                String fLang = format.language != null ? format.language.toLowerCase() : "";
                String fLabel = format.label != null ? format.label.toLowerCase() : "";
                String sLower = savedAudio.toLowerCase();
                if (fLang.equals(sLower) || fLabel.equals(sLower) || (!fLang.isEmpty() && sLower.contains(fLang)) || (!fLabel.isEmpty() && sLower.contains(fLabel))) {
                    selectedIndex = k;
                    break;
                }
            }
        }

        if (trackNames.isEmpty()) {
            Toast.makeText(this, "Aucune piste audio alternative", Toast.LENGTH_SHORT).show();
            return;
        }

        if (selectedIndex == -1 && !trackNames.isEmpty()) {
            selectedIndex = 0;
        }

        showStyledTrackSelectionDialog("🔊 Pistes Audio", "Sélectionnez votre langue audio :", trackNames, selectedIndex, which -> {
            Tracks.Group chosenGroup = audioGroups.get(which);
            int trackIdx = trackIndices.get(which);
            Format format = chosenGroup.getTrackFormat(trackIdx);
            String lang = format.language != null ? format.language : "";
            String label = format.label != null ? format.label : "";
            String saveVal = !lang.isEmpty() ? lang : label;

            player.setTrackSelectionParameters(
                    player.getTrackSelectionParameters()
                            .buildUpon()
                            .setOverrideForType(new TrackSelectionOverride(
                                     chosenGroup.getMediaTrackGroup(), Collections.singletonList(trackIdx)))
                            .build()
            );

            // Persist preference for this series or movie
            if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
                p.edit().putString("audio_" + pendingSeriesId, saveVal)
                        .putString("global_series_audio", saveVal)
                        .apply();
            } else if (!isLive) {
                String curUrl = getCurrentPlayingUrl();
                if (!curUrl.isEmpty()) {
                    p.edit().putString("vod_audio_" + curUrl, saveVal).apply();
                }
                p.edit().putString("global_vod_audio", saveVal).apply();
            }

            updateTrackButtonLabels(player.getCurrentTracks());
            showZapFeedback("🔊 Piste audio", trackNames.get(which));
        });
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

        SharedPreferences p = getSharedPreferences("keotv_series_prefs", Context.MODE_PRIVATE);
        String savedSub = null;
        if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
            savedSub = p.getString("sub_" + pendingSeriesId, p.getString("global_series_sub", null));
        } else if (!isLive) {
            String curUrl = getCurrentPlayingUrl();
            if (!curUrl.isEmpty()) savedSub = p.getString("vod_sub_" + curUrl, p.getString("global_vod_sub", null));
        }

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

        if ("off".equalsIgnoreCase(savedSub) || "none".equalsIgnoreCase(savedSub)) {
            selectedIndex = 0;
        } else if (savedSub != null && !savedSub.isEmpty()) {
            for (int k = 1; k < textGroups.size(); k++) {
                if (textGroups.get(k) != null) {
                    Format format = textGroups.get(k).getTrackFormat(trackIndices.get(k));
                    String fLang = format.language != null ? format.language.toLowerCase() : "";
                    String fLabel = format.label != null ? format.label.toLowerCase() : "";
                    String sLower = savedSub.toLowerCase();
                    if (fLang.equals(sLower) || fLabel.equals(sLower) || (!fLang.isEmpty() && sLower.contains(fLang)) || (!fLabel.isEmpty() && sLower.contains(fLabel))) {
                        selectedIndex = k;
                        break;
                    }
                }
            }
        }

        showStyledTrackSelectionDialog("💬 Sous-titres", "Sélectionnez vos sous-titres :", trackNames, selectedIndex, which -> {
            String curUrl = getCurrentPlayingUrl();

            if (which == 0) {
                player.setTrackSelectionParameters(
                        player.getTrackSelectionParameters()
                                .buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                                .build()
                );
                if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
                    p.edit().putString("sub_" + pendingSeriesId, "off")
                            .putString("global_series_sub", "off")
                            .apply();
                } else if (!isLive) {
                    if (!curUrl.isEmpty()) {
                        p.edit().putString("vod_sub_" + curUrl, "off").apply();
                    }
                    p.edit().putString("global_vod_sub", "off").apply();
                }
                updateTrackButtonLabels(player.getCurrentTracks());
                showZapFeedback("💬 Sous-titres", "Désactivés");
            } else {
                Tracks.Group chosenGroup = textGroups.get(which);
                int trackIdx = trackIndices.get(which);
                Format format = chosenGroup.getTrackFormat(trackIdx);
                String lang = format.language != null ? format.language : "";
                String label = format.label != null ? format.label : "";
                String saveVal = !lang.isEmpty() ? lang : label;

                player.setTrackSelectionParameters(
                        player.getTrackSelectionParameters()
                                .buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                                .setOverrideForType(new TrackSelectionOverride(
                                        chosenGroup.getMediaTrackGroup(), Collections.singletonList(trackIdx)))
                                .build()
                );
                if (pendingSeriesId != null && !pendingSeriesId.isEmpty()) {
                    p.edit().putString("sub_" + pendingSeriesId, saveVal)
                            .putString("global_series_sub", saveVal)
                            .apply();
                } else if (!isLive) {
                    if (!curUrl.isEmpty()) {
                        p.edit().putString("vod_sub_" + curUrl, saveVal).apply();
                    }
                    p.edit().putString("global_vod_sub", saveVal).apply();
                }

                updateTrackButtonLabels(player.getCurrentTracks());
                showZapFeedback("💬 Sous-titres", trackNames.get(which));
            }
        });
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
