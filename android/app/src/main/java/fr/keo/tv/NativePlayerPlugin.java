package fr.keo.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Outline;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.widget.FrameLayout;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;

/**
 * Capacitor plugin that manages:
 * 1. The full-screen native ExoPlayer (Media3) PlayerActivity.
 * 2. The embedded TiviMate-style 16:9 mini preview ExoPlayer rendered directly inside MainActivity's
 *    root FrameLayout at exact CSS coordinates (hardware-decoded MPEG-TS / HLS / MP4 without CORS).
 */
@UnstableApi
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    private ExoPlayer previewPlayer;
    private PlayerView previewView;
    private String currentPreviewUrl = null;
    private boolean triedTsFallbackForPreview = false;
    private String previewUserAgent = "IPTVSmartersPro/3.1.5 (Linux; Android 12)";

    private int dpToPx(Activity activity, double cssPx) {
        float density = activity.getResources().getDisplayMetrics().density;
        return Math.max(0, (int) Math.round(cssPx * density));
    }

    private void ensurePreviewView(Activity activity) {
        if (previewView != null) return;

        previewView = new PlayerView(activity);
        previewView.setUseController(false);
        previewView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        previewView.setBackgroundColor(Color.BLACK);
        previewView.setFocusable(false);
        previewView.setFocusableInTouchMode(false);
        previewView.setClickable(false);

        final int radiusPx = dpToPx(activity, 12);
        previewView.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), radiusPx);
            }
        });
        previewView.setClipToOutline(true);
        previewView.setVisibility(View.GONE);

        ViewGroup root = activity.findViewById(android.R.id.content);
        if (root != null) {
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(1, 1);
            root.addView(previewView, params);
        }
    }

    private void ensurePreviewPlayer(Activity activity, String userAgent) {
        if (previewPlayer != null) return;

        DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent(userAgent != null ? userAgent : previewUserAgent)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(5000)
                .setReadTimeoutMs(8000);

        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                        1800,  // minBufferMs
                        10000, // maxBufferMs
                        450,   // bufferForPlaybackMs (instant mini preview start!)
                        1000   // bufferForPlaybackAfterRebufferMs
                )
                .build();

        DefaultMediaSourceFactory mediaSourceFactory = new DefaultMediaSourceFactory(httpFactory)
                .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(1));

        previewPlayer = new ExoPlayer.Builder(activity)
                .setLoadControl(loadControl)
                .setMediaSourceFactory(mediaSourceFactory)
                .build();

        previewPlayer.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                if (previewPlayer == null || currentPreviewUrl == null) return;
                if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                    previewPlayer.seekToDefaultPosition();
                    previewPlayer.prepare();
                    previewPlayer.play();
                    return;
                }
                if (!triedTsFallbackForPreview) {
                    triedTsFallbackForPreview = true;
                    String altUrl = null;
                    if (currentPreviewUrl.endsWith(".m3u8")) {
                        altUrl = currentPreviewUrl.substring(0, currentPreviewUrl.length() - 5) + ".ts";
                    } else if (currentPreviewUrl.endsWith(".ts")) {
                        altUrl = currentPreviewUrl.substring(0, currentPreviewUrl.length() - 3) + ".m3u8";
                    }
                    if (altUrl != null) {
                        currentPreviewUrl = altUrl;
                        previewPlayer.setMediaItem(MediaItem.fromUri(altUrl));
                        previewPlayer.prepare();
                        previewPlayer.play();
                    }
                }
            }
        });

        if (previewView != null) {
            previewView.setPlayer(previewPlayer);
        }
    }

    private void stopPreviewInternal() {
        currentPreviewUrl = null;
        triedTsFallbackForPreview = false;
        if (previewPlayer != null) {
            try {
                previewPlayer.stop();
                previewPlayer.clearMediaItems();
                previewPlayer.release();
            } catch (Exception ignored) {}
            previewPlayer = null;
        }
        if (previewView != null) {
            previewView.setPlayer(null);
            previewView.setVisibility(View.GONE);
        }
    }

    @PluginMethod
    public void playPreview(PluginCall call) {
        final String url = call.getString("url", "");
        final double x = call.getDouble("x", 0.0);
        final double y = call.getDouble("y", 0.0);
        final double width = call.getDouble("width", 0.0);
        final double height = call.getDouble("height", 0.0);
        final boolean muted = Boolean.TRUE.equals(call.getBoolean("muted", false));
        final String ua = call.getString("userAgent", "IPTVSmartersPro/3.1.5 (Linux; Android 12)");

        final Activity activity = getActivity();
        if (activity == null || url == null || url.isEmpty() || width <= 10 || height <= 10) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                previewUserAgent = ua;
                ensurePreviewView(activity);
                ensurePreviewPlayer(activity, ua);

                int leftPx = dpToPx(activity, x);
                int topPx = dpToPx(activity, y);
                int widthPx = dpToPx(activity, width);
                int heightPx = dpToPx(activity, height);

                FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) previewView.getLayoutParams();
                if (lp == null) {
                    lp = new FrameLayout.LayoutParams(widthPx, heightPx);
                } else {
                    lp.width = widthPx;
                    lp.height = heightPx;
                }
                lp.leftMargin = leftPx;
                lp.topMargin = topPx;
                previewView.setLayoutParams(lp);
                previewView.setVisibility(View.VISIBLE);
                previewView.bringToFront();

                previewPlayer.setVolume(muted ? 0f : 1f);

                if (!url.equals(currentPreviewUrl) || previewPlayer.getPlaybackState() == Player.STATE_IDLE) {
                    currentPreviewUrl = url;
                    triedTsFallbackForPreview = false;
                    previewPlayer.setMediaItem(MediaItem.fromUri(url));
                    previewPlayer.prepare();
                    previewPlayer.setPlayWhenReady(true);
                } else if (!previewPlayer.isPlaying()) {
                    previewPlayer.play();
                }
            } catch (Exception ignored) {}
        });

        call.resolve();
    }

    @PluginMethod
    public void updatePreviewRect(PluginCall call) {
        final double x = call.getDouble("x", 0.0);
        final double y = call.getDouble("y", 0.0);
        final double width = call.getDouble("width", 0.0);
        final double height = call.getDouble("height", 0.0);
        final boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", true));
        final Boolean mutedOpt = call.getBoolean("muted");

        final Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            if (previewView == null) return;
            if (!visible || width <= 10 || height <= 10) {
                previewView.setVisibility(View.GONE);
                if (previewPlayer != null && previewPlayer.isPlaying()) {
                    previewPlayer.pause();
                }
                return;
            }

            int leftPx = dpToPx(activity, x);
            int topPx = dpToPx(activity, y);
            int widthPx = dpToPx(activity, width);
            int heightPx = dpToPx(activity, height);

            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) previewView.getLayoutParams();
            if (lp != null) {
                lp.width = widthPx;
                lp.height = heightPx;
                lp.leftMargin = leftPx;
                lp.topMargin = topPx;
                previewView.setLayoutParams(lp);
            }
            if (previewPlayer != null && mutedOpt != null) {
                previewPlayer.setVolume(mutedOpt ? 0f : 1f);
            }
            if (currentPreviewUrl != null) {
                previewView.setVisibility(View.VISIBLE);
                if (previewPlayer != null && !previewPlayer.isPlaying()) {
                    previewPlayer.play();
                }
            }
        });

        call.resolve();
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        final Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(this::stopPreviewInternal);
        }
        call.resolve();
    }

    @PluginMethod
    public void play(PluginCall call) {
        JSArray urls = call.getArray("urls");
        JSArray titles = call.getArray("titles");
        if (urls == null || urls.length() == 0) {
            call.reject("Aucune URL de flux à lire.");
            return;
        }

        ArrayList<String> urlList = new ArrayList<>();
        ArrayList<String> titleList = new ArrayList<>();
        try {
            for (int i = 0; i < urls.length(); i++) {
                urlList.add(urls.getString(i));
                titleList.add(titles != null && i < titles.length() ? titles.getString(i) : "");
            }
        } catch (JSONException e) {
            call.reject("Liste de flux invalide.");
            return;
        }

        // Release embedded preview player before launching full-screen PlayerActivity so we never open 2 connections!
        final Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(this::stopPreviewInternal);
        }

        // Static hand-over: large channel lists would overflow the Binder transaction limit as Intent extras.
        PlayerActivity.pendingUrls = urlList;
        PlayerActivity.pendingTitles = titleList;
        PlayerActivity.pendingIndex = Math.max(0, Math.min(call.getInt("index", 0), urlList.size() - 1));
        PlayerActivity.pendingUserAgent = call.getString("userAgent", "IPTVSmartersPro/3.1.5 (Linux; Android 12)");
        PlayerActivity.pendingIsLive = call.getBoolean("isLive", true);
        PlayerActivity.pendingSeriesId = call.getString("seriesId", null);
        PlayerActivity.pendingPreferredAudio = call.getString("preferredAudio", null);
        PlayerActivity.pendingPreferredSubtitle = call.getString("preferredSubtitle", null);

        Intent intent = new Intent(getContext(), PlayerActivity.class);
        getActivity().startActivity(intent);
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        final Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                if (previewPlayer != null && previewPlayer.isPlaying()) {
                    previewPlayer.pause();
                }
            });
        }
    }

    @Override
    protected void handleOnDestroy() {
        final Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(this::stopPreviewInternal);
        }
        super.handleOnDestroy();
    }
}
