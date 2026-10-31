package fr.keo.tv;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private KeoDatabase db;
    private final XtreamClient xtreamClient = new XtreamClient();

    // UI elements
    private TextView tvStatusBadge;
    private TextView tvHeaderSyncInfo;
    private RecyclerView recyclerCategories;
    private RecyclerView recyclerChannels;

    private TextView tvDetailName;
    private TextView tvDetailGroup;
    private TextView tvDetailResolution;
    private TextView tvDetailEpg;
    private Button btnWatchFullscreen;
    private Button btnToggleFav;

    private CategoriesAdapter categoriesAdapter;
    private ChannelsAdapter channelsAdapter;

    private KeoDatabase.CategoryItem selectedCategory = null;
    private KeoDatabase.ChannelItem activeChannel = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        db = KeoDatabase.getInstance(this);

        initViews();
        setupAdapters();
        loadLocalData();

        // Check if playlist configured, otherwise prompt login
        KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl != null && pl.serverUrl != null && !pl.serverUrl.isEmpty()) {
            updateHeaderPlaylistInfo(pl);
        } else {
            showLoginDialog();
        }
    }

    private void initViews() {
        tvStatusBadge = findViewById(R.id.tv_status_badge);
        tvHeaderSyncInfo = findViewById(R.id.tv_header_sync_info);
        recyclerCategories = findViewById(R.id.recycler_categories);
        recyclerChannels = findViewById(R.id.recycler_channels);

        tvDetailName = findViewById(R.id.tv_detail_name);
        tvDetailGroup = findViewById(R.id.tv_detail_group);
        tvDetailResolution = findViewById(R.id.tv_detail_resolution);
        tvDetailEpg = findViewById(R.id.tv_detail_epg);
        btnWatchFullscreen = findViewById(R.id.btn_watch_fullscreen);
        btnToggleFav = findViewById(R.id.btn_toggle_fav);

        findViewById(R.id.btn_header_sync).setOnClickListener(v -> triggerSync());
        findViewById(R.id.btn_header_diagnostic).setOnClickListener(v -> showDiagnosticDialog());
        findViewById(R.id.btn_header_login).setOnClickListener(v -> showLoginDialog());

        btnWatchFullscreen.setOnClickListener(v -> launchPlayerFullscreen());
        btnToggleFav.setOnClickListener(v -> {
            if (activeChannel != null) {
                db.toggleFavorite(activeChannel.id);
                activeChannel.isFav = !activeChannel.isFav;
                btnToggleFav.setText(activeChannel.isFav ? "★ Retirer des favoris" : "⭐ Ajouter aux favoris");
                channelsAdapter.notifyDataSetChanged();
            }
        });
    }

    private void setupAdapters() {
        recyclerCategories.setLayoutManager(new LinearLayoutManager(this));
        categoriesAdapter = new CategoriesAdapter();
        recyclerCategories.setAdapter(categoriesAdapter);

        recyclerChannels.setLayoutManager(new LinearLayoutManager(this));
        channelsAdapter = new ChannelsAdapter();
        recyclerChannels.setAdapter(channelsAdapter);
    }

    private void loadLocalData() {
        List<KeoDatabase.CategoryItem> cats = db.getCategories("live");
        categoriesAdapter.setItems(cats);

        if (!cats.isEmpty()) {
            selectCategory(cats.get(0));
        } else {
            tvDetailName.setText("Aucune chaîne en mémoire. Cliquez sur 'Synchroniser'");
        }
    }

    private void selectCategory(KeoDatabase.CategoryItem cat) {
        selectedCategory = cat;
        List<KeoDatabase.ChannelItem> channels = db.getChannelsByGroup(cat.id);
        channelsAdapter.setItems(channels);

        if (!channels.isEmpty()) {
            selectChannel(channels.get(0));
        } else {
            tvDetailName.setText("Aucune chaîne dans ce bouquet");
            tvDetailGroup.setText(cat.name);
            tvDetailEpg.setText("-");
        }
    }

    private void selectChannel(KeoDatabase.ChannelItem ch) {
        activeChannel = ch;
        tvDetailName.setText(ch.name);
        tvDetailGroup.setText(selectedCategory != null ? selectedCategory.name : "Direct TV");
        tvDetailResolution.setText(ch.resolution != null ? ch.resolution : "HD");
        tvDetailEpg.setText("Direct TV (" + ch.resolution + ")");
        btnToggleFav.setText(ch.isFav ? "★ Retirer des favoris" : "⭐ Ajouter aux favoris");
    }

    private void launchPlayerFullscreen() {
        if (activeChannel == null || activeChannel.streamUrl == null || activeChannel.streamUrl.isEmpty()) {
            Toast.makeText(this, "Sélectionnez d'abord une chaîne", Toast.LENGTH_SHORT).show();
            return;
        }

        List<KeoDatabase.ChannelItem> currentList = channelsAdapter.getItems();
        List<String> urls = new ArrayList<>();
        List<String> titles = new ArrayList<>();
        int startIndex = 0;

        for (int i = 0; i < currentList.size(); i++) {
            KeoDatabase.ChannelItem c = currentList.get(i);
            urls.add(c.streamUrl);
            titles.add(c.name);
            if (c.id.equals(activeChannel.id)) {
                startIndex = i;
            }
        }

        PlayerActivity.pendingUrls = urls;
        PlayerActivity.pendingTitles = titles;
        PlayerActivity.pendingIndex = startIndex;
        PlayerActivity.pendingIsLive = true;

        Intent intent = new Intent(this, PlayerActivity.class);
        startActivity(intent);
    }

    private void triggerSync() {
        KeoDatabase.PlaylistItem pl = db.getActivePlaylist();
        if (pl == null || pl.serverUrl == null || pl.serverUrl.isEmpty()) {
            showLoginDialog();
            return;
        }

        tvStatusBadge.setText("⏳ Synchro...");
        tvStatusBadge.setBackgroundColor(0xFF854D0E); // amber

        xtreamClient.syncPlaylist(pl.serverUrl, pl.username, pl.password, db, new XtreamClient.SyncCallback() {
            @Override
            public void onProgress(String message) {
                tvStatusBadge.setText("⏳ " + message);
            }

            @Override
            public void onSuccess(int bouquetCount, int channelCount) {
                tvStatusBadge.setText("✅ Prêt");
                tvStatusBadge.setBackgroundColor(0xFF132E27); // green
                Toast.makeText(MainActivity.this, "Synchronisation réussie : " + channelCount + " chaînes", Toast.LENGTH_LONG).show();
                updateHeaderPlaylistInfo(db.getActivePlaylist());
                loadLocalData();
            }

            @Override
            public void onError(String error) {
                tvStatusBadge.setText("⚠️ Erreur");
                tvStatusBadge.setBackgroundColor(0xFF7F1D1D); // red
                Toast.makeText(MainActivity.this, "Erreur synchro : " + error, Toast.LENGTH_LONG).show();
            }
        });
    }

    private void updateHeaderPlaylistInfo(KeoDatabase.PlaylistItem pl) {
        if (pl == null) return;
        tvHeaderSyncInfo.setText(pl.name + " (" + pl.serverUrl + ") | Exp: " + pl.expDate + " | Synchro: " + pl.lastSyncAt);
    }

    private void showDiagnosticDialog() {
        int liveCount = db.getChannelCount("live");
        int catCount = db.getCategoryCount();
        KeoDatabase.PlaylistItem pl = db.getActivePlaylist();

        Runtime rt = Runtime.getRuntime();
        long usedMb = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
        long maxMb = rt.maxMemory() / (1024 * 1024);

        String message = "📊 DIAGNOSTIC & SANTÉ DU SYSTÈME KEOTV\n\n"
                + "• Version : Build 146 (100% Natif Android)\n"
                + "• Moteur : SQLite WAL Natif (Zéro WebView / Zéro Dexie)\n"
                + "• Chaînes TV en mémoire : " + liveCount + "\n"
                + "• Bouquets TV : " + catCount + "\n"
                + "• Playlist : " + (pl != null ? pl.name : "Aucune") + "\n"
                + "• Serveur : " + (pl != null ? pl.serverUrl : "Non configuré") + "\n"
                + "• Fin d'abonnement : " + (pl != null ? pl.expDate : "N/A") + "\n"
                + "• Dernière synchronisation : " + (pl != null ? pl.lastSyncAt : "Jamais") + "\n"
                + "• RAM utilisée par l'app : " + usedMb + " Mo / " + maxMb + " Mo";

        new AlertDialog.Builder(this)
                .setTitle("Diagnostic KeoTV")
                .setMessage(message)
                .setPositiveButton("OK", null)
                .setNeutralButton("Purger et Re-synchroniser", (dialog, which) -> {
                    db.onUpgrade(db.getWritableDatabase(), 1, 1);
                    triggerSync();
                })
                .show();
    }

    private void showLoginDialog() {
        KeoDatabase.PlaylistItem existing = db.getActivePlaylist();

        android.widget.LinearLayout layout = new android.widget.LinearLayout(this);
        layout.setOrientation(android.widget.LinearLayout.VERTICAL);
        layout.setPadding(32, 24, 32, 24);

        final EditText etServer = new EditText(this);
        etServer.setHint("Serveur (ex: http://mon-serveur.com:8080)");
        if (existing != null && existing.serverUrl != null) etServer.setText(existing.serverUrl);
        layout.addView(etServer);

        final EditText etUser = new EditText(this);
        etUser.setHint("Nom d'utilisateur");
        if (existing != null && existing.username != null) etUser.setText(existing.username);
        layout.addView(etUser);

        final EditText etPass = new EditText(this);
        etPass.setHint("Mot de passe");
        if (existing != null && existing.password != null) etPass.setText(existing.password);
        layout.addView(etPass);

        new AlertDialog.Builder(this)
                .setTitle("Configuration du Compte IPTV Xtream")
                .setView(layout)
                .setPositiveButton("Enregistrer & Synchroniser", (dialog, which) -> {
                    String server = etServer.getText().toString().trim();
                    String user = etUser.getText().toString().trim();
                    String pass = etPass.getText().toString().trim();

                    if (server.isEmpty() || user.isEmpty() || pass.isEmpty()) {
                        Toast.makeText(MainActivity.this, "Tous les champs sont requis", Toast.LENGTH_SHORT).show();
                        return;
                    }

                    KeoDatabase.PlaylistItem pl = new KeoDatabase.PlaylistItem();
                    pl.id = "active_xtream";
                    pl.name = "Abonnement Xtream";
                    pl.type = "xtream";
                    pl.serverUrl = server;
                    pl.username = user;
                    pl.password = pass;
                    db.savePlaylist(pl);

                    triggerSync();
                })
                .setNegativeButton("Annuler", null)
                .show();
    }

    // --- RECYCLER VIEW ADAPTERS WITH CLEAN D-PAD FOCUS ---

    private class CategoriesAdapter extends RecyclerView.Adapter<CategoriesAdapter.ViewHolder> {
        private final List<KeoDatabase.CategoryItem> items = new ArrayList<>();
        private int selectedPos = 0;

        public void setItems(List<KeoDatabase.CategoryItem> newItems) {
            items.clear();
            items.addAll(newItems);
            selectedPos = 0;
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_category, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            KeoDatabase.CategoryItem item = items.get(position);
            holder.tvName.setText(item.name);
            holder.tvCount.setText(String.valueOf(item.count));
            holder.itemView.setSelected(selectedPos == position);

            holder.itemView.setOnClickListener(v -> {
                selectedPos = holder.getBindingAdapterPosition();
                notifyDataSetChanged();
                selectCategory(item);
            });

            holder.itemView.setOnFocusChangeListener((v, hasFocus) -> {
                if (hasFocus) {
                    selectedPos = holder.getBindingAdapterPosition();
                    notifyDataSetChanged();
                    selectCategory(item);
                }
            });
        }

        @Override
        public int getItemCount() {
            return items.size();
        }

        class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvName, tvCount;
            ViewHolder(View v) {
                super(v);
                tvName = v.findViewById(R.id.tv_category_name);
                tvCount = v.findViewById(R.id.tv_category_count);
            }
        }
    }

    private class ChannelsAdapter extends RecyclerView.Adapter<ChannelsAdapter.ViewHolder> {
        private final List<KeoDatabase.ChannelItem> items = new ArrayList<>();
        private int selectedPos = 0;

        public void setItems(List<KeoDatabase.ChannelItem> newItems) {
            items.clear();
            items.addAll(newItems);
            selectedPos = 0;
            notifyDataSetChanged();
        }

        public List<KeoDatabase.ChannelItem> getItems() {
            return items;
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_channel, parent, false);
            return new ViewHolder(v);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            KeoDatabase.ChannelItem item = items.get(position);
            holder.tvNum.setText(String.valueOf(position + 1));
            holder.tvName.setText(item.name);
            holder.tvRes.setText(item.resolution != null ? item.resolution : "HD");
            holder.itemView.setSelected(selectedPos == position);

            holder.itemView.setOnClickListener(v -> {
                selectedPos = holder.getBindingAdapterPosition();
                notifyDataSetChanged();
                selectChannel(item);
                launchPlayerFullscreen();
            });

            holder.itemView.setOnFocusChangeListener((v, hasFocus) -> {
                if (hasFocus) {
                    selectedPos = holder.getBindingAdapterPosition();
                    notifyDataSetChanged();
                    selectChannel(item);
                }
            });
        }

        @Override
        public int getItemCount() {
            return items.size();
        }

        class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvNum, tvName, tvEpg, tvRes;
            ViewHolder(View v) {
                super(v);
                tvNum = v.findViewById(R.id.tv_channel_num);
                tvName = v.findViewById(R.id.tv_channel_name);
                tvEpg = v.findViewById(R.id.tv_channel_epg);
                tvRes = v.findViewById(R.id.tv_channel_res);
            }
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (recyclerChannels.hasFocus()) {
                recyclerCategories.requestFocus();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
