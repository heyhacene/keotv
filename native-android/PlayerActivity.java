package fr.keo.tv;

import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
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
 * Full screen native player (ExoPlayer / Media3).
 * - Back button closes the player and returns to the KeoTV channel list.
 * - The whole category is loaded as a playlist: previous / next buttons (or channel up / down,
 *   D-pad up / down for live TV) zap between channels or episodes.
 * - Live .m3u8 URLs automatically fall back to the .ts variant if the HLS stream cannot be opened.
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
    private TextView titleView;
    private TextView errorView;
    private final Set<Integer> triedTsFallback = new HashSet<>();
    private boolean isLive = true;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();
        isLive = pendingIsLive;

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        playerView = new PlayerView(this);
        playerView.setShowNextButton(true);
        playerView.setShowPreviousButton(true);
        playerView.setControllerShowTimeoutMs(4000);
        root.addView(playerView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(16f);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setShadowLayer(6f, 0f, 0f, Color.BLACK);
        titleView.setPadding(40, 40, 40, 16);
        root.addView(titleView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        errorView = new TextView(this);
        errorView.setTextColor(Color.parseColor("#FF8A80"));
        errorView.setTextSize(15f);
        errorView.setGravity(Gravity.CENTER);
        errorView.setBackgroundColor(Color.parseColor("#CC000000"));
        errorView.setPadding(48, 32, 48, 32);
        errorView.setVisibility(android.view.View.GONE);
        errorView.setOnClickListener(v -> {
            errorView.setVisibility(android.view.View.GONE);
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
                errorView.setVisibility(android.view.View.GONE);
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_READY) {
                    errorView.setVisibility(android.view.View.GONE);
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
        errorView.setText("Impossible de lire ce flux\n" + details + "\n\nTouchez ici pour réessayer");
        errorView.setVisibility(android.view.View.VISIBLE);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (player != null && event.getAction() == KeyEvent.ACTION_DOWN) {
            int key = event.getKeyCode();
            boolean controllerHidden = !playerView.isControllerFullyVisible();
            if (key == KeyEvent.KEYCODE_CHANNEL_UP || (isLive && controllerHidden && key == KeyEvent.KEYCODE_DPAD_UP)) {
                player.seekToPreviousMediaItem();
                return true;
            }
            if (key == KeyEvent.KEYCODE_CHANNEL_DOWN || (isLive && controllerHidden && key == KeyEvent.KEYCODE_DPAD_DOWN)) {
                player.seekToNextMediaItem();
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
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
