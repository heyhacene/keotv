package fr.keo.tv;

import android.content.Context;
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
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Full screen native player (ExoPlayer / Media3) optimized for Android TV & Mobile.
 * - Live TV: Clean screen with instant touch/remote OSD banner and complete playback controls:
 *     - Previous & Next channel zapping
 *     - Vertical swipe up / down to change channel on mobile
 *     - Play / Pause direct live stream
 *     - Audio tracks selector dialog
 *     - Subtitles selector dialog
 *     - Aspect ratio / format toggle (16:9 Fit, Full Fill, Zoom)
 *     - Fast tactile exit button
 * - VOD / Series: Skip intro pill (+85s), 10s auto-next countdown, +/-10s seeking.
 * - Per-series audio & subtitle preference persistence.
 * - Up / Down / Channel +/- arrows zap seamlessly between channels or episodes.
 * - Back button cleanly returns to the KeoTV TV guide.
 */
@UnstableApi
public class PlayerActivity extends AppCompatActivity {

    public static List<String> pendingUrls = new ArrayList<>();
    public static List<String> pendingTitles = new ArrayList<>();
    public static int pendingIndex = 0;
    public static String pendingUserAgent = "IPTVSmartersPro/3.1.5 (Linux; Android 12)";
    public static boolean pendingIsLive = true;
    public static String pendingSeriesId = null;
    public static String pendingPreferredAudio = null;
    public static String pendingPreferredSubtitle = null;

    private ExoPlayer player;
    private PlayerView playerView;
    private LinearLayout osdContainer;
    private TextView titleView;
    private TextView indexView;
    private TextView errorView;
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

    private final Set<Integer> triedTsFallback = new HashSet<>();
    private boolean isLive = true;

    // Skip intro & Next episode overlays
    private TextView skipIntroBtn;
    private LinearLayout nextEpisodeCard;
    private TextView nextCountdownText;
    private TextView nextEpisodeTitleText;
    private TextView btnPlayNextNow;
    private TextView btnCancelNext;

    private boolean introSkippedForCurrent = false;
    private boolean nextEpisodeDismissed = false;
    private int nextEpisodeCountdownSeconds = 10;
    private boolean isCountdownActive = false;

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
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
        isLive = pendingIsLive;

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
        TextView badge = new TextView(this);
        badge.setText(isLive ? "DIRECT TV" : "VOD");
        badge.setTextColor(Color.parseColor("#38BDF8"));
        badge.setTextSize(11f);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setPadding(dp(10), dp(4), dp(10), dp(4));
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.parseColor("#2638BDF8"));
        badgeBg.setCornerRadius(dp(8));
        badgeBg.setStroke(dp(1), Color.parseColor("#4D38BDF8"));
        badge.setBackground(badgeBg);
        osdContainer.addView(badge);

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

        // Tactile Close Button
        btnExit = createOsdButton("✕  Fermer", v -> finish());
        LinearLayout.LayoutParams exitParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        exitParams.setMarginStart(dp(14));
        btnExit.setLayoutParams(exitParams);
        osdContainer.addView(btnExit);

        root.addView(osdContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

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

        // Skip intro button (VOD / series, bottom right)
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
        skipParams.setMargins(0, 0, dp(32), dp(80));
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

        nextCountdownText = new TextView(this);
        nextCountdownText.setText("ÉPISODE SUIVANT DANS 10s...");
        nextCountdownText.setTextColor(Color.parseColor("#38BDF8"));
        nextCountdownText.setTextSize(12f);
        nextCountdownText.setTypeface(Typeface.DEFAULT_BOLD);
        nextEpisodeCard.addView(nextCountdownText);

        nextEpisodeTitleText = new TextView(this);
        nextEpisodeTitleText.setTextColor(Color.WHITE);
        nextEpisodeTitleText.setTextSize(16f);
        nextEpisodeTitleText.setTypeface(Typeface.DEFAULT_BOLD);
        nextEpisodeTitleText.setMaxLines(2);
        nextEpisodeTitleText.setEllipsize(TextUtils.TruncateAt.END);
        nextEpisodeTitleText.setPadding(0, dp(6), 0, dp(14));
        nextEpisodeCard.addView(nextEpisodeTitleText);

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

        // Gesture detector for single tap (toggle OSD) and vertical fling/swipe (change channels)
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

                // Swipe vertical : changement de chaîne
                if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > dp(35)) {
                    if (diffY < 0) {
                        // Swipe vers le haut -> Chaîne suivante
                        zapNextChannel();
                    } else {
                        // Swipe vers le bas -> Chaîne précédente
                        zapPreviousChannel();
                    }
                    return true;
                }

                // Swipe horizontal pour VOD : avance/retour rapide 10s
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

        playerView.setOnTouchListener((v, event) -> gestureDetector.onTouchEvent(event));

        DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent(pendingUserAgent)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(20000);

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(httpFactory))
                .build();
        playerView.setPlayer(player);

        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < pendingUrls.size(); i++) {
            String title = i < pendingTitles.size() ? pendingTitles.get(i) : "";
            items.add(buildItem(pendingUrls.get(i), title));
        }
        int start = Math.max(0, Math.min(pendingIndex, items.size() - 1));
        player.setMediaItems(items, start, C.TIME_UNSET);

        player.addListener(new Player.Listener() {
            @Override
            public void onMediaItemTransition(MediaItem mediaItem, int reason) {
                introSkippedForCurrent = false;
                nextEpisodeDismissed = false;
                stopCountdown();
                if (nextEpisodeCard != null) nextEpisodeCard.setVisibility(View.GONE);
                if (skipIntroBtn != null) skipIntroBtn.setVisibility(View.GONE);

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
                    if (!isLive && player != null && player.hasNextMediaItem() && !nextEpisodeDismissed) {
                        launchNextEpisode();
                    }
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                handlePlayerError(error);
            }
        });

        player.prepare();
        player.setPlayWhenReady(true);
        applyLanguagePreferences();
        updateTitle();
        showOsd();

        if (!isLive) {
            mainHandler.post(progressRunnable);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (gestureDetector != null && gestureDetector.onTouchEvent(event)) {
            return true;
        }
        return super.onTouchEvent(event);
    }

    private void zapNextChannel() {
        if (player == null) return;
        if (player.hasNextMediaItem()) {
            player.seekToNextMediaItem();
        } else if (player.getMediaItemCount() > 0) {
            player.seekToDefaultPosition(0);
        }
        updateTitle();
        showOsd();
        String channelName = (titleView != null && !TextUtils.isEmpty(titleView.getText()))
                ? titleView.getText().toString() : "";
        showZapFeedback("▲ Chaîne suivante", channelName);
    }

    private void zapPreviousChannel() {
        if (player == null) return;
        if (player.hasPreviousMediaItem()) {
            player.seekToPreviousMediaItem();
        } else if (player.getMediaItemCount() > 0) {
            player.seekToDefaultPosition(player.getMediaItemCount() - 1);
        }
        updateTitle();
        showOsd();
        String channelName = (titleView != null && !TextUtils.isEmpty(titleView.getText()))
                ? titleView.getText().toString() : "";
        showZapFeedback("▼ Chaîne précédente", channelName);
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

        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() == C.TRACK_TYPE_TEXT) {
                for (int i = 0; i < group.length; i++) {
                    Format format = group.getTrackFormat(i);
                    textGroups.add(group);
                    trackIndices.add(i);

                    String lang = format.language != null ? format.language.toUpperCase() : "Inconnu";
                    String label = format.label != null && !format.label.isEmpty() ? format.label : "Sous-titre " + trackNames.size();
                    trackNames.add(label + " [" + lang + "]");

                    if (group.isTrackSelected(i)) {
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

        // 1. Skip intro management (between 3s and 125s of episode)
        if (!introSkippedForCurrent && dur > 180000 && pos >= 3000 && pos <= 125000) {
            if (skipIntroBtn != null && skipIntroBtn.getVisibility() != View.VISIBLE) {
                skipIntroBtn.setVisibility(View.VISIBLE);
                skipIntroBtn.setAlpha(0f);
                skipIntroBtn.setTranslationY(dp(20));
                skipIntroBtn.animate().alpha(1f).translationY(0f).setDuration(300).start();
            }
        } else if (skipIntroBtn != null && skipIntroBtn.getVisibility() == View.VISIBLE && pos > 125000) {
            skipIntroBtn.setVisibility(View.GONE);
        }

        // 2. Next episode countdown (in the last 40 seconds or >95% progress)
        if (dur > 60000 && !nextEpisodeDismissed && player.hasNextMediaItem()) {
            long remaining = dur - pos;
            if (remaining <= 40000 || ((double) pos / dur) > 0.95) {
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
        osdHandler.removeCallbacks(hideOsdRunnable);
        if (osdContainer != null) {
            osdContainer.setVisibility(View.VISIBLE);
            osdContainer.animate().cancel();
            osdContainer.setAlpha(1f);
        }
        if (bottomControlsHsv != null) {
            bottomControlsHsv.setVisibility(View.VISIBLE);
            bottomControlsHsv.animate().cancel();
            bottomControlsHsv.setAlpha(1f);
        }
        osdHandler.postDelayed(hideOsdRunnable, 4000);
    }

    private void toggleOsd() {
        if (osdContainer != null && osdContainer.getVisibility() == View.VISIBLE && osdContainer.getAlpha() > 0.5f) {
            osdHandler.removeCallbacks(hideOsdRunnable);
            hideOsdRunnable.run();
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

        // Many Xtream panels only serve live streams as raw MPEG-TS: retry with .ts
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
                details += " (flux introuvable)";
            } else if (code == 884 || code == 509 || code == 429) {
                details += " (trop de connexions simultanées)";
            }
        } else if (cause != null && cause.getMessage() != null) {
            details += " - " + cause.getMessage();
        }
        errorView.setText("Impossible de lire ce flux\n" + details + "\n\nAppuyez sur OK pour réessayer");
        errorView.setVisibility(View.VISIBLE);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (player != null && event.getAction() == KeyEvent.ACTION_DOWN) {
            int key = event.getKeyCode();

            // When Next Episode overlay is visible:
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

            // When Skip Intro is visible:
            if (skipIntroBtn != null && skipIntroBtn.getVisibility() == View.VISIBLE) {
                if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || key == KeyEvent.KEYCODE_BUTTON_R1 || key == KeyEvent.KEYCODE_PROG_RED) {
                    performSkipIntro();
                    return true;
                }
                if (key == KeyEvent.KEYCODE_DPAD_RIGHT && !skipIntroBtn.isFocused()) {
                    skipIntroBtn.requestFocus();
                    return true;
                }
                if (skipIntroBtn.isFocused() && (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                    performSkipIntro();
                    return true;
                }
            }

            // Zapping to Previous Channel / Episode (Up, Channel Up, Page Up)
            if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_CHANNEL_UP || key == KeyEvent.KEYCODE_PAGE_UP) {
                zapPreviousChannel();
                return true;
            }

            // Zapping to Next Channel / Episode (Down, Channel Down, Page Down)
            if (key == KeyEvent.KEYCODE_DPAD_DOWN || key == KeyEvent.KEYCODE_CHANNEL_DOWN || key == KeyEvent.KEYCODE_PAGE_DOWN) {
                zapNextChannel();
                return true;
            }

            // Toggle OSD Info Banner (OK / Enter / Center)
            if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                toggleOsd();
                return true;
            }

            // Fast Forward / Rewind for VODs
            if (!isLive) {
                if (key == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || key == KeyEvent.KEYCODE_DPAD_RIGHT) {
                    seekRelative(10000);
                    return true;
                }
                if (key == KeyEvent.KEYCODE_MEDIA_REWIND || key == KeyEvent.KEYCODE_DPAD_LEFT) {
                    seekRelative(-10000);
                    return true;
                }
            }

            // Toggle Pause/Play on Media buttons
            if (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || key == KeyEvent.KEYCODE_MEDIA_PLAY || key == KeyEvent.KEYCODE_MEDIA_PAUSE) {
                togglePlayPause();
                return true;
            }

            // Back button returns to TV Guide
            if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_ESCAPE) {
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
    protected void onStop() {
        super.onStop();
        mainHandler.removeCallbacks(progressRunnable);
        stopCountdown();
        if (player != null) {
            player.pause();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        mainHandler.removeCallbacks(progressRunnable);
        stopCountdown();
        osdHandler.removeCallbacks(hideOsdRunnable);
        zapHandler.removeCallbacks(hideZapRunnable);
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
