const { Dexie } = require('dexie');
const { performance } = require('perf_hooks');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');

async function run() {
  const db = new Dexie('TestDB', { indexedDB: indexedDB, IDBKeyRange: IDBKeyRange });
  db.version(1).stores({
    channels: 'id, group_id, num, custom_order, name'
  });

  await db.open();

  // populate 50000 channels
  const channels = [];
  for (let i = 0; i < 50000; i++) {
    channels.push({ id: `ch_${i}`, group_id: 'g1', num: i, custom_order: i, name: `Channel ${i}` });
  }
  await db.channels.bulkPut(channels);

  const favIds = [];
  for (let i = 0; i < 5000; i++) {
    favIds.push(`ch_${i * 10}`);
  }

  // Baseline: N+1
  const start1 = performance.now();
  for (const fId of favIds) {
    try {
      await db.channels.update(fId, { is_favorite: true });
    } catch (e) {}
  }
  const end1 = performance.now();
  console.log(`Baseline (N+1 loop): ${end1 - start1} ms`);

  // Optimized: transaction without Promise.all (sequential updates within single transaction)
  const start2 = performance.now();
  await db.transaction('rw', db.channels, async () => {
    for (const fId of favIds) {
      await db.channels.update(fId, { is_favorite: true });
    }
  });
  const end2 = performance.now();
  console.log(`Optimized (transaction sequential): ${end2 - start2} ms`);

  // Optimized: transaction with Promise.all
  const start3 = performance.now();
  await db.transaction('rw', db.channels, async () => {
    const promises = [];
    for (const fId of favIds) {
      promises.push(db.channels.update(fId, { is_favorite: true }).catch(() => {}));
    }
    await Promise.all(promises);
  });
  const end3 = performance.now();
  console.log(`Optimized (transaction Promise.all): ${end3 - start3} ms`);

  // Clean up
  await db.delete();
}

run().catch(console.error);
