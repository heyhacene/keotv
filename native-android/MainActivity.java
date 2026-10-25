package fr.keo.tv;

import android.app.UiModeManager;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);

        // Set window background to dark TV surface (#080c14) immediately to prevent any white or default splash flash
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0xFF080C14));

        // Soft keyboard: display as an overlay (adjustPan) instead of crushing/resizing the TV layout in half
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            getSplashScreen().setOnExitAnimationListener(splashScreenView -> {
                splashScreenView.remove();
            });
        }

        // Orientation management:
        // - Force landscape orientation on Android TV devices
        // - Allow sensor-based automatic rotation on mobile smartphones and tablets
        UiModeManager uiModeManager = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        final boolean isTv = (uiModeManager != null && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || getPackageManager().hasSystemFeature("android.software.leanback")
                || !getPackageManager().hasSystemFeature("android.hardware.touchscreen");

        if (isTv) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
        }

        // Tag WebView user agent AND inject window.__KEOTV_IS_TV__ so frontend immediately knows device type
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            try {
                String defaultUa = webView.getSettings().getUserAgentString();
                if (isTv) {
                    if (!defaultUa.contains("KeoTV-AndroidTV")) {
                        webView.getSettings().setUserAgentString(defaultUa + " KeoTV-AndroidTV");
                    }
                } else {
                    if (!defaultUa.contains("KeoTV-Mobile")) {
                        webView.getSettings().setUserAgentString(defaultUa + " KeoTV-Mobile");
                    }
                }
            } catch (Exception ignored) {}

            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            syncToWebView(webView, isTv);
        }
    }

    private void syncToWebView(final WebView webView, final boolean isTv) {
        if (webView == null) return;
        final String positionsJson = getSharedPreferences(PlayerActivity.PREFS_POSITIONS, MODE_PRIVATE)
                .getString(PlayerActivity.KEY_POSITIONS_JSON, "{}");
        final String escapedJson = org.json.JSONObject.quote(positionsJson);
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.requestFocus();
                try {
                    String script = "window.__KEOTV_IS_TV__ = " + (isTv ? "true" : "false") + ";"
                            + "try { var rawPos = " + escapedJson + "; window.__KEOTV_PLAYBACK_POSITIONS__ = JSON.parse(rawPos); localStorage.setItem('keotv_playback_positions', rawPos); window.dispatchEvent(new Event('keotv-positions-updated')); } catch(e) {}"
                            + "window.dispatchEvent(new Event('resize'));";
                    webView.evaluateJavascript(script, null);
                } catch (Exception ignored) {}
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            UiModeManager uiModeManager = (UiModeManager) getSystemService(UI_MODE_SERVICE);
            final boolean isTv = (uiModeManager != null && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                    || getPackageManager().hasSystemFeature("android.software.leanback")
                    || !getPackageManager().hasSystemFeature("android.hardware.touchscreen");
            syncToWebView(webView, isTv);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Ensure DPAD, Enter, and Media keys are directed to the WebView
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_DPAD_UP ||
                keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
                keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
                keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                keyCode == KeyEvent.KEYCODE_ENTER ||
                keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv != null && !wv.hasFocus()) {
                    wv.requestFocus();
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
