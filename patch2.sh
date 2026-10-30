cat << 'PATCH' > page2.patch
--- app/page.tsx
+++ app/page.tsx
@@ -3063,10 +3063,13 @@
       // 2. Restore user favorites
       if (account.favorites && account.favorites.length > 0) {
         await db.channels.toCollection().modify({ is_favorite: false });
-        for (const favId of account.favorites) {
-          await db.channels.update(favId, { is_favorite: true });
-          await saveFavoriteChannelId(favId, true);
-        }
+        await db.transaction('rw', db.channels, async () => {
+          const promises = account.favorites.map(favId => db.channels.update(favId, { is_favorite: true }).catch(() => {}));
+          await Promise.all(promises);
+        });
+        // Update the set of favorites in one go in settings
+        await setSetting('favorite_channel_ids', account.favorites);
+
         if (selectedCategory) {
           await loadCategoryChannels(selectedCategory, channelSort);
         }
@@ -3131,10 +3134,13 @@

     if (data.favorites && data.favorites.length > 0) {
       await db.channels.toCollection().modify({ is_favorite: false });
-      for (const favId of data.favorites) {
-        await db.channels.update(favId, { is_favorite: true });
-        await saveFavoriteChannelId(favId, true);
-      }
+      await db.transaction('rw', db.channels, async () => {
+        const promises = data.favorites.map(favId => db.channels.update(favId, { is_favorite: true }).catch(() => {}));
+        await Promise.all(promises);
+      });
+      // Update the set of favorites in one go in settings
+      await setSetting('favorite_channel_ids', data.favorites);
+
       if (selectedCategory) {
         await loadCategoryChannels(selectedCategory, channelSort);
       }
PATCH
patch -p0 < page2.patch
