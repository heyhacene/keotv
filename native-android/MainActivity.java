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

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            getSplashScreen().setOnExitAnimationListener(splashScreenView -> {
                splashScreenView.remove();
            });
        }

        // Force landscape orientation on Android TV devices
        UiModeManager uiModeManager = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        boolean isTv = (uiModeManager != null && uiModeManager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || getPackageManager().hasSystemFeature("android.software.leanback")
                || !getPackageManager().hasSystemFeature("android.hardware.touchscreen");

        if (isTv) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        }

        // Ensure WebView receives remote control D-Pad focus
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.requestFocus();
                }
            });
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.requestFocus();
                }
            });
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
