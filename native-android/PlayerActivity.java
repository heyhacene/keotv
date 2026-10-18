package fr.keo.tv;

import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Full screen native player (ExoPlayer / Media3) optimized for Android TV remote controls.
 * - Live TV: Clean screen, no transport seekbars or pause buttons covering the stream.
 * - Up / Down / Channel +/- arrows zap seamlessly between channels.
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

    private ExoPlayer player;
    private PlayerView playerView;
    private LinearLayout osdContainer;
    private TextView titleView;
    private TextView indexView;
    private TextView errorView;
    private final Set<Integer> triedTsFallback = new HashSet<>();
    private boolean isLive = true;

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
            // Live TV: Do not show media controller seekbar/transport buttons
            playerView.setUseController(false);
        } else {
            // VOD: Auto-hiding transport controls for movies & series
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
        osdContainer.setPadding(48, 32, 48, 32);

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
        badge.setPadding(18, 6, 18, 6);
        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.parseColor("#2638BDF8"));
        badgeBg.setCornerRadius(12f);
        badgeBg.setStroke(2, Color.parseColor("#4D38BDF8"));
        badge.setBackground(badgeBg);
        osdContainer.addView(badge);

        // Title text
        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(18f);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setShadowLayer(8f, 0f, 0f, Color.BLACK);
        titleView.setPadding(20, 0, 20, 0);
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

        // Error message overlay
        errorView = new TextView(this);
        errorView.setTextColor(Color.parseColor("#FF8A80"));
        errorView.setTextSize(15f);
        errorView.setGravity(Gravity.CENTER);
        errorView.setBackgroundColor(Color.parseColor("#D9000000"));
        errorView.setPadding(48, 32, 48, 32);
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
        errParams.setMargins(48, 0, 48, 0);
        root.addView(errorView, errParams);

        setContentView(root);

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
                updateTitle();
                showOsd();
                errorView.setVisibility(View.GONE);
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_READY) {
                    errorView.setVisibility(View.GONE);
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                handlePlayerError(error);
            }
        });

        player.prepare();
        player.setPlayWhenReady(true);
        updateTitle();
        showOsd();
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
        osdHandler.postDelayed(hideOsdRunnable, 3500);
    }

    private void toggleOsd() {
        if (osdContainer == null) return;
        if (osdContainer.getVisibility() == View.VISIBLE && osdContainer.getAlpha() > 0.5f) {
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

            // Zapping to Previous Channel (Up, Channel Up, Page Up)
            if (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_CHANNEL_UP || key == KeyEvent.KEYCODE_PAGE_UP) {
                if (player.hasPreviousMediaItem()) {
                    player.seekToPreviousMediaItem();
                } else if (player.getMediaItemCount() > 0) {
                    player.seekToDefaultPosition(player.getMediaItemCount() - 1);
                }
                updateTitle();
                showOsd();
                return true;
            }

            // Zapping to Next Channel (Down, Channel Down, Page Down)
            if (key == KeyEvent.KEYCODE_DPAD_DOWN || key == KeyEvent.KEYCODE_CHANNEL_DOWN || key == KeyEvent.KEYCODE_PAGE_DOWN) {
                if (player.hasNextMediaItem()) {
                    player.seekToNextMediaItem();
                } else if (player.getMediaItemCount() > 0) {
                    player.seekToDefaultPosition(0);
                }
                updateTitle();
                showOsd();
                return true;
            }

            // Toggle OSD Info Banner (OK / Enter / Center)
            if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                toggleOsd();
                return true;
            }

            // Toggle Pause/Play on Media buttons
            if (key == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || key == KeyEvent.KEYCODE_MEDIA_PLAY || key == KeyEvent.KEYCODE_MEDIA_PAUSE) {
                if (player.isPlaying()) {
                    player.pause();
                } else {
                    player.play();
                }
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
        if (player != null) {
            player.pause();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        osdHandler.removeCallbacks(hideOsdRunnable);
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
