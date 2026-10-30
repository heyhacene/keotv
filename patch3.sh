cat << 'PATCH' > page3.patch
--- app/page.tsx
+++ app/page.tsx
@@ -3066,7 +3066,7 @@
       if (account.favorites && account.favorites.length > 0) {
         await db.channels.toCollection().modify({ is_favorite: false });
         await db.transaction('rw', db.channels, async () => {
-          const promises = account.favorites.map(favId => db.channels.update(favId, { is_favorite: true }).catch(() => {}));
+          const promises = account.favorites.map((favId: string) => db.channels.update(favId, { is_favorite: true }).catch(() => {}));
           await Promise.all(promises);
         });
         // Update the set of favorites in one go in settings
@@ -3134,7 +3134,7 @@
     if (data.favorites && data.favorites.length > 0) {
       await db.channels.toCollection().modify({ is_favorite: false });
       await db.transaction('rw', db.channels, async () => {
-        const promises = data.favorites.map(favId => db.channels.update(favId, { is_favorite: true }).catch(() => {}));
+        const promises = data.favorites.map((favId: string) => db.channels.update(favId, { is_favorite: true }).catch(() => {}));
         await Promise.all(promises);
       });
       // Update the set of favorites in one go in settings
PATCH
patch -p0 < page3.patch
