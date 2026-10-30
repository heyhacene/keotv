🧪 Add unit tests for detectResolution

🎯 **What:** The pure function `detectResolution` in `lib/iptv-service.ts` was missing test coverage.
📊 **Coverage:** The new test suite in `lib/__tests__/iptv-service.test.ts` covers the 4 main resolutions ('4K', 'FHD', 'HD', 'SD'), their alternative tags (UHD, 1080, 720, 576), case insensitivity, and edge cases like empty string, null, and undefined falling back to the default 'HD' resolution.
✨ **Result:** Increased test coverage for core video categorization logic, ensuring regressions are caught if we add new resolution aliases in the future.
