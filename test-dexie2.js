const { Dexie } = require('dexie');
const { performance } = require('perf_hooks');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');

async function run() {
  const db = new Dexie('TestDB2', { indexedDB: indexedDB, IDBKeyRange: IDBKeyRange });
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

  // Optimized: anyOf.modify
  const start4 = performance.now();
  await db.channels.where('id').anyOf(favIds).modify({ is_favorite: true });
  const end4 = performance.now();
  console.log(`Optimized (anyOf.modify): ${end4 - start4} ms`);

  await db.delete();
}

run().catch(console.error);
