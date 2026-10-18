package fr.keo.tv;

import android.content.Intent;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;

/**
 * Capacitor plugin that opens the native ExoPlayer (Media3) full screen player.
 * Streams are played natively (no CORS, custom User-Agent, MPEG-TS / HLS / MP4 / MKV support).
 */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

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

        // Static hand-over: large channel lists would overflow the Binder transaction limit as Intent extras.
        PlayerActivity.pendingUrls = urlList;
        PlayerActivity.pendingTitles = titleList;
        PlayerActivity.pendingIndex = Math.max(0, Math.min(call.getInt("index", 0), urlList.size() - 1));
        PlayerActivity.pendingUserAgent = call.getString("userAgent", "IPTVSmartersPro/3.1.5 (Linux; Android 12)");
        PlayerActivity.pendingIsLive = call.getBoolean("isLive", true);

        Intent intent = new Intent(getContext(), PlayerActivity.class);
        getActivity().startActivity(intent);
        call.resolve();
    }
}
