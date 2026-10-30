🎯 **What:** The testing gap addressed
Added missing tests for the error paths of `getSetting` in `lib/db.ts:41` when Dexie throws an exception. Also provided robust test coverage for other db.ts helpers like `setSetting`, `getFavoriteChannelIds`, and `saveFavoriteChannelId`.

📊 **Coverage:** What scenarios are now tested
- `getSetting` resolving with default when item doesn't exist
- `getSetting` resolving correctly when item exists
- `getSetting` returning default value and correctly handling errors when `db.settings.get` fails
- `setSetting` saving correctly and logging errors on DB failure
- `getFavoriteChannelIds` harvesting from DB and caching properly, and handling DB errors safely
- `saveFavoriteChannelId` correctly saving and deleting favorite properties and handling errors during set saving

✨ **Result:** The improvement in test coverage
Reaches 100% logic and statement coverage for `lib/db.test.ts`. Adds testing framework configuration to project (`jest` & `fake-indexeddb`). Tests effectively mock Dexie indexDB capabilities to execute paths explicitly.
