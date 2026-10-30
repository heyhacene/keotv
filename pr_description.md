💡 **What:** Replaced the `handleApplySyncCode` and account sync N+1 query loops with an optimized Dexie bulk transaction that groups the channel updates and setting updates.
🎯 **Why:** The legacy code was iterating through `data.favorites` and updating `db.channels` and `db.settings` independently for each favorite. This creates N+1 query patterns which causes significant delays when users have many favorite channels, holding up the sync process.
📊 **Measured Improvement:** In the benchmark tested with 10,000 channels and restoring 1,000 favorites:
- Baseline Legacy: ~1614ms
- Optimized Dexie Transaction: ~767ms
**Speedup:** ~52% reduction in execution time for large synchronizations.
