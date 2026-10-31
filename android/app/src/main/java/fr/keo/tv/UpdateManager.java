package fr.keo.tv;

import android.app.Activity;
import android.app.ProgressDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.core.content.FileProvider;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class UpdateManager {

    private static final String TAG = "KeoUpdate";
    private static final String RELEASES_API = "https://api.github.com/repos/heyhacene/keotv/releases/latest";
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    private static boolean isActivitySafe(Context context) {
        if (context instanceof Activity) {
            Activity act = (Activity) context;
            return !act.isFinishing() && !act.isDestroyed();
        }
        return context != null;
    }

    public static void checkForUpdates(final Context context, final boolean manualCheck) {
        if (!isActivitySafe(context)) return;

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    int currentBuild = getAppVersionCode(context);

                    URL url = new URL(RELEASES_API);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("User-Agent", "KeoTV-AndroidTV");
                    conn.setRequestProperty("Accept", "application/vnd.github.v3+json");
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(10000);

                    if (conn.getResponseCode() != 200) {
                        if (manualCheck) {
                            postToast(context, "Impossible de vérifier les mises à jour (Serveur HTTP " + conn.getResponseCode() + ")");
                        }
                        return;
                    }

                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();
                    conn.disconnect();

                    JsonObject releaseObj = JsonParser.parseString(sb.toString()).getAsJsonObject();
                    String tagName = releaseObj.has("tag_name") ? releaseObj.get("tag_name").getAsString() : "";
                    String releaseName = releaseObj.has("name") ? releaseObj.get("name").getAsString() : "";

                    int remoteBuild = extractBuildNumber(tagName);
                    if (remoteBuild <= 0) {
                        remoteBuild = extractBuildNumber(releaseName);
                    }

                    String apkDownloadUrl = null;
                    if (releaseObj.has("assets") && releaseObj.get("assets").isJsonArray()) {
                        JsonArray assets = releaseObj.getAsJsonArray("assets");
                        for (JsonElement el : assets) {
                            if (!el.isJsonObject()) continue;
                            JsonObject asset = el.getAsJsonObject();
                            String name = asset.has("name") ? asset.get("name").getAsString() : "";
                            String downloadUrl = asset.has("browser_download_url") ? asset.get("browser_download_url").getAsString() : null;

                            if (downloadUrl != null && name.toLowerCase().endsWith(".apk")) {
                                apkDownloadUrl = downloadUrl;
                                if (name.startsWith("KeoTV-Build-")) {
                                    break;
                                }
                            }
                        }
                    }

                    final int finalRemoteBuild = remoteBuild;
                    final String finalApkUrl = apkDownloadUrl;

                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (!isActivitySafe(context)) return;

                            try {
                                if (finalRemoteBuild > currentBuild && finalApkUrl != null) {
                                    showUpdateAvailableDialog(context, currentBuild, finalRemoteBuild, finalApkUrl);
                                } else if (manualCheck) {
                                    new AlertDialog.Builder(context)
                                            .setTitle("KeoTV est à jour")
                                            .setMessage("Vous disposez déjà de la version la plus récente (Build " + currentBuild + ").")
                                            .setPositiveButton("OK", null)
                                            .show();
                                }
                            } catch (Throwable t) {
                                Log.e(TAG, "Error displaying update dialog", t);
                            }
                        }
                    });

                } catch (final Exception e) {
                    if (manualCheck) {
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                if (isActivitySafe(context)) {
                                    Toast.makeText(context, "Erreur vérification mise à jour : " + e.getMessage(), Toast.LENGTH_LONG).show();
                                }
                            }
                        });
                    }
                }
            }
        });
    }

    private static int extractBuildNumber(String text) {
        if (text == null) return -1;
        Pattern p = Pattern.compile("(?i)(?:build[._\\s-]+|build\\.)(\\d+)");
        Matcher m = p.matcher(text);
        if (m.find()) {
            try {
                return Integer.parseInt(m.group(1));
            } catch (Exception ignored) {}
        }
        return -1;
    }

    public static int getAppVersionCode(Context context) {
        try {
            PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return pInfo.versionCode;
        } catch (Exception e) {
            return 148;
        }
    }

    private static void showUpdateAvailableDialog(final Context context, final int currentBuild, final int newBuild, final String downloadUrl) {
        if (!isActivitySafe(context)) return;

        try {
            new AlertDialog.Builder(context)
                    .setTitle("🚀 Mise à jour KeoTV disponible")
                    .setMessage("Une nouvelle version native est prête (Build " + newBuild + " vs actuelle " + currentBuild + ").\n\nSouhaitez-vous la télécharger et l'installer directement sur votre Android TV ?")
                    .setPositiveButton("Installer maintenant", new DialogInterface.OnClickListener() {
                        @Override
                        public void onClick(DialogInterface dialog, int which) {
                            downloadAndInstallApk(context, downloadUrl, newBuild);
                        }
                    })
                    .setNegativeButton("Plus tard", null)
                    .show();
        } catch (Throwable t) {
            Log.e(TAG, "showUpdateAvailableDialog failed", t);
        }
    }

    private static void downloadAndInstallApk(final Context context, final String downloadUrl, final int newBuild) {
        if (!isActivitySafe(context)) return;

        final ProgressDialog progress = new ProgressDialog(context);
        progress.setTitle("Mise à jour KeoTV (Build " + newBuild + ")");
        progress.setMessage("Téléchargement du package en cours...");
        progress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        progress.setMax(100);
        progress.setProgress(0);
        progress.setCancelable(false);
        try {
            progress.show();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to show progress dialog", t);
        }

        executor.execute(new Runnable() {
            @Override
            public void run() {
                File outputFile = null;
                try {
                    // Internal cache is always available and safe
                    File cacheDir = context.getCacheDir();
                    outputFile = new File(cacheDir, "KeoTV-update.apk");
                    if (outputFile.exists()) {
                        outputFile.delete();
                    }

                    URL url = new URL(downloadUrl);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestProperty("User-Agent", "KeoTV-AndroidTV");
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);

                    int responseCode = conn.getResponseCode();
                    if (responseCode == HttpURLConnection.HTTP_MOVED_PERM || responseCode == HttpURLConnection.HTTP_MOVED_TEMP || responseCode == 307 || responseCode == 308) {
                        String newUrl = conn.getHeaderField("Location");
                        conn.disconnect();
                        url = new URL(newUrl);
                        conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestProperty("User-Agent", "KeoTV-AndroidTV");
                    }

                    int totalSize = conn.getContentLength();
                    InputStream in = new BufferedInputStream(conn.getInputStream());
                    FileOutputStream out = new FileOutputStream(outputFile);

                    byte[] buffer = new byte[16384];
                    int count;
                    long downloaded = 0;

                    while ((count = in.read(buffer)) != -1) {
                        out.write(buffer, 0, count);
                        downloaded += count;
                        if (totalSize > 0) {
                            final int percent = (int) ((downloaded * 100) / totalSize);
                            mainHandler.post(new Runnable() {
                                @Override
                                public void run() {
                                    if (progress.isShowing()) {
                                        progress.setProgress(percent);
                                    }
                                }
                            });
                        }
                    }

                    out.flush();
                    out.close();
                    in.close();
                    conn.disconnect();

                    final File finalApk = outputFile;
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                if (progress.isShowing()) progress.dismiss();
                            } catch (Throwable ignored) {}

                            if (isActivitySafe(context)) {
                                triggerPackageInstaller(context, finalApk);
                            }
                        }
                    });

                } catch (final Exception e) {
                    if (outputFile != null && outputFile.exists()) {
                        outputFile.delete();
                    }
                    mainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                if (progress.isShowing()) progress.dismiss();
                            } catch (Throwable ignored) {}

                            if (isActivitySafe(context)) {
                                Toast.makeText(context, "Erreur téléchargement mise à jour : " + e.getMessage(), Toast.LENGTH_LONG).show();
                            }
                        }
                    });
                }
            }
        });
    }

    private static void triggerPackageInstaller(final Context context, final File apkFile) {
        if (!isActivitySafe(context)) return;

        if (apkFile == null || !apkFile.exists() || apkFile.length() < 100000) {
            postToast(context, "Erreur : fichier de mise à jour invalide");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!context.getPackageManager().canRequestPackageInstalls()) {
                try {
                    new AlertDialog.Builder(context)
                            .setTitle("Autorisation requise")
                            .setMessage("Pour installer les mises à jour directes sur Android TV, veuillez autoriser KeoTV à 'Installer des applications inconnues'.")
                            .setPositiveButton("Ouvrir les paramètres", new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface dialog, int which) {
                                    try {
                                        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                                Uri.parse("package:" + context.getPackageName()));
                                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                        context.startActivity(intent);
                                    } catch (Exception e) {
                                        Intent intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                        context.startActivity(intent);
                                    }
                                }
                            })
                            .setNegativeButton("Annuler", null)
                            .show();
                } catch (Throwable t) {
                    Log.e(TAG, "Failed to show permission dialog", t);
                }
                return;
            }
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(context, "fr.keo.tv.fileprovider", apkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Exception e) {
            postToast(context, "Impossible de lancer l'installateur : " + e.getMessage());
        }
    }

    private static void postToast(final Context context, final String msg) {
        mainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (isActivitySafe(context)) {
                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show();
                }
            }
        });
    }
}
