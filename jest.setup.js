require('fake-indexeddb/auto');
const structuredClone = require('@ungap/structured-clone').default;
global.structuredClone = structuredClone;
