package fr.keo.tv;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ImageLoader {
    private static final int MAX_CACHE_SIZE = Math.max(1024, (int) (Runtime.getRuntime().maxMemory() / 1024) / 8);
    private static final LruCache<String, Bitmap> memoryCache = new LruCache<String, Bitmap>(MAX_CACHE_SIZE) {
        @Override
        protected int sizeOf(String key, Bitmap bitmap) {
            return bitmap.getByteCount() / 1024;
        }
    };

    private static final ExecutorService executor = Executors.newFixedThreadPool(4);
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    public static void load(String urlStr, ImageView imageView) {
        load(urlStr, imageView, 0);
    }

    public static void load(android.content.Context context, String urlStr, ImageView imageView) {
        load(urlStr, imageView, 0);
    }

    public static void load(android.content.Context context, String urlStr, ImageView imageView, int placeholderRes) {
        load(urlStr, imageView, placeholderRes);
    }

    public static void load(final String urlStr, final ImageView imageView, final int placeholderRes) {
        if (imageView == null) return;
        if (urlStr == null || urlStr.trim().isEmpty()) {
            if (placeholderRes != 0) imageView.setImageResource(placeholderRes);
            return;
        }

        final String cleanUrl = urlStr.trim();
        Bitmap cached = memoryCache.get(cleanUrl);
        if (cached != null) {
            imageView.setImageBitmap(cached);
            return;
        }

        if (placeholderRes != 0) {
            imageView.setImageResource(placeholderRes);
        }

        imageView.setTag(cleanUrl);

        executor.execute(() -> {
            try {
                URL url = new URL(cleanUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(10000);
                conn.setRequestProperty("User-Agent", "IPTVSmartersPro/3.1.5 (Linux; Android 12)");
                conn.connect();

                if (conn.getResponseCode() == 200) {
                    InputStream in = conn.getInputStream();
                    final Bitmap bmp = BitmapFactory.decodeStream(in);
                    in.close();

                    if (bmp != null) {
                        memoryCache.put(cleanUrl, bmp);
                        mainHandler.post(() -> {
                            if (cleanUrl.equals(imageView.getTag())) {
                                imageView.setImageBitmap(bmp);
                            }
                        });
                    }
                }
            } catch (Exception ignored) {}
        });
    }
}
