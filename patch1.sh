cat << 'PATCH' > page1.patch
--- app/page.tsx
+++ app/page.tsx
@@ -1197,11 +1197,10 @@
         // Ensure saved favorite channel IDs are marked in db.channels
         const favIds = await getFavoriteChannelIds();
         if (favIds.size > 0) {
-          for (const fId of favIds) {
-            try {
-              await db.channels.update(fId, { is_favorite: true });
-            } catch {}
-          }
+          await db.transaction('rw', db.channels, async () => {
+            const promises = Array.from(favIds).map(fId => db.channels.update(fId, { is_favorite: true }).catch(() => {}));
+            await Promise.all(promises);
+          });
         }
         await updateFavoriteCounts();

PATCH
patch -p0 < page1.patch
