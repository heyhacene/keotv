package fr.keo.tv;

import android.app.Activity;
import android.content.Context;
import android.widget.ImageView;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.request.RequestOptions;

public class ImageLoader {

    public static void load(String urlStr, ImageView imageView) {
        if (imageView != null) {
            load(imageView.getContext(), urlStr, imageView, R.drawable.bg_poster_placeholder);
        }
    }

    public static void load(Context context, String urlStr, ImageView imageView) {
        load(context, urlStr, imageView, R.drawable.bg_poster_placeholder);
    }

    public static void load(String urlStr, ImageView imageView, int placeholderRes) {
        if (imageView != null) {
            load(imageView.getContext(), urlStr, imageView, placeholderRes);
        }
    }

    public static void load(Context context, String urlStr, ImageView imageView, int placeholderRes) {
        if (imageView == null) return;
        if (context == null) {
            context = imageView.getContext();
        }
        if (context == null) return;

        if (context instanceof Activity) {
            Activity a = (Activity) context;
            if (a.isDestroyed() || a.isFinishing()) return;
        }

        int placeholder = placeholderRes != 0 ? placeholderRes : R.drawable.bg_poster_placeholder;

        if (urlStr == null || urlStr.trim().isEmpty()) {
            try {
                imageView.setImageResource(placeholder);
            } catch (Throwable ignored) {}
            return;
        }

        String cleanUrl = urlStr.trim();
        if (cleanUrl.startsWith("//")) {
            cleanUrl = "https:" + cleanUrl;
        }
        if (cleanUrl.contains(" ")) {
            cleanUrl = cleanUrl.replace(" ", "%20");
        }

        try {
            RequestOptions options = new RequestOptions()
                    .placeholder(placeholder)
                    .error(placeholder)
                    .fitCenter()
                    .diskCacheStrategy(DiskCacheStrategy.ALL);

            Glide.with(context)
                    .load(cleanUrl)
                    .apply(options)
                    .into(imageView);
        } catch (Throwable t) {
            try {
                imageView.setImageResource(placeholder);
            } catch (Throwable ignored) {}
        }
    }

    public static void clear(ImageView imageView) {
        if (imageView == null) return;
        try {
            Context ctx = imageView.getContext();
            if (ctx instanceof Activity) {
                Activity a = (Activity) ctx;
                if (a.isDestroyed() || a.isFinishing()) return;
            }
            if (ctx != null) {
                Glide.with(ctx).clear(imageView);
            }
        } catch (Throwable ignored) {}
    }
}
