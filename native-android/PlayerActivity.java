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
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionParameters;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

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
                        .setDuration(350)
                        .withEndAction(new Runnable() {
                            @Override
                            public void run() {
                                if (osdContainer != null) {
                                    osdContainer.setVisibility(View.GONE);
                                }
                            }
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

        root.addView(osdContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

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
        cardParams.setMargins(0, 0, dp(32), dp(64));
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

        // Detect if this is a Replay / Catchup multi-format fallback cascade
        boolean isReplayCascade = !isLive && pendingSeriesId == null && pendingUrls.size() > 1
                && !pendingTitles.isEmpty() && pendingTitles.get(0) != null
                && pendingTitles.get(0).startsWith("[Replay]");

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
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_READY) {
                    errorView.setVisibility(View.GONE);
                } else if (playbackState == Player.STATE_ENDED) {
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
                skipIntroBtn.animate().alpha(1f).setDuration(300).start();
            }
        } else {
            if (skipIntroBtn != null && skipIntroBtn.getVisibility() == View.VISIBLE && !skipIntroBtn.isFocused()) {
                skipIntroBtn.animate().alpha(0f).setDuration(250).withEndAction(() -> {
                    if (skipIntroBtn != null) skipIntroBtn.setVisibility(View.GONE);
                }).start();
            }
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
        if (osdContainer == null) return;
        osdHandler.removeCallbacks(hideOsdRunnable);
        osdContainer.setVisibility(View.VISIBLE);
        osdContainer.animate().cancel();
        osdContainer.setAlpha(1f);
        osdHandler.postDelayed(hideOsdRunnable, 3800);
    }

    private void hideOsdImmediately() {
        osdHandler.removeCallbacks(hideOsdRunnable);
        if (osdContainer != null) {
            osdContainer.animate().cancel();
            osdContainer.setAlpha(0f);
            osdContainer.setVisibility(View.GONE);
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
                if (key == KeyEvent.KEYCODE_DPAD_RIGHT && !skipIntroBtn.isFocused() && !isControllerVisible()) {
                    skipIntroBtn.requestFocus();
                    return true;
                }
                if (skipIntroBtn.isFocused() && (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                    performSkipIntro();
                    return true;
                }
            }

            // 3. CRITICAL: When player controls (Controller or OSD) are visible:
            // - BACK button MUST hide the controls instead of exiting the player!
            // - DPAD buttons (UP / DOWN / LEFT / RIGHT) MUST ONLY control the player UI (or do nothing in OSD), NEVER change channel!
            boolean controlsVisible = isControllerVisible() || isOsdVisible();
            if (controlsVisible) {
                if (key == KeyEvent.KEYCODE_BACK || key == KeyEvent.KEYCODE_ESCAPE) {
                    if (playerView != null) {
                        playerView.hideController();
                    }
                    hideOsdImmediately();
                    return true;
                }

                // If the full transport controller (VOD / Series / Replay) is visible, let ExoPlayer's PlayerView handle all DPAD navigation!
                if (isControllerVisible()) {
                    showOsd(); // Keep top title bar synced while interacting with controls
                    return super.dispatchKeyEvent(event);
                }

                // If Live TV OSD banner is visible:
                // - OK / Center hides the OSD banner
                // - UP / DOWN do NOT zap channels while OSD is shown unless user uses dedicated CHANNEL_UP / CHANNEL_DOWN hardware keys!
                if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                    hideOsdImmediately();
                    return true;
                }
                if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN || key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT) {
                    if (!isLive && playerView != null) {
                        playerView.showController();
                        return super.dispatchKeyEvent(event);
                    }
                    // In Live TV when OSD is visible, keep OSD alive or let user dismiss with Back/OK without accidental channel change
                    showOsd();
                    return true;
                }
            }

            // 4. Dedicated Channel Up / Channel Down keys (always zap in Live TV)
            // Or DPAD_UP / DPAD_DOWN when controls are HIDDEN!
            if (isLive && (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_CHANNEL_UP || key == KeyEvent.KEYCODE_PAGE_UP)) {
                if (player.hasPreviousMediaItem()) {
                    player.seekToPreviousMediaItem();
                } else if (player.getMediaItemCount() > 0) {
                    player.seekToDefaultPosition(player.getMediaItemCount() - 1);
                }
                updateTitle();
                showOsd();
                return true;
            }

            if (isLive && (key == KeyEvent.KEYCODE_DPAD_DOWN || key == KeyEvent.KEYCODE_CHANNEL_DOWN || key == KeyEvent.KEYCODE_PAGE_DOWN)) {
                if (player.hasNextMediaItem()) {
                    player.seekToNextMediaItem();
                } else if (player.getMediaItemCount() > 0) {
                    player.seekToDefaultPosition(0);
                }
                updateTitle();
                showOsd();
                return true;
            }

            // 5. In VOD / Replay / Series when controls are hidden: pressing OK, UP, DOWN shows the player controls!
            if (!isLive && (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN || key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
                if (playerView != null) {
                    playerView.showController();
                }
                showOsd();
                return true;
            }

            // 6. Toggle OSD Info Banner in Live TV (OK / Enter / Center when hidden)
            if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                toggleOsd();
                return true;
            }

            // 7. Fast Forward / Rewind for VOD & Replay when controls are hidden
            if (!isLive) {
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

            // 9. Back button (when controls are already hidden) returns to TV Guide
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
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
