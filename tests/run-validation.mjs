import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

console.log('🔍 Lancement de la validation automatique du pipeline IPTV KeoTV...');

const source = fs.readFileSync('lib/iptv-service.ts', 'utf8');

// Transpilation TypeScript officielle via le compilateur TypeScript natif
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

// Exécution du code transpilé dans un contexte CommonJS isolé
const moduleObj = { exports: {} };
const fn = new Function('exports', 'module', 'require', transpiled);

const mockRequire = (id) => {
  if (id.includes('capacitor')) {
    return {
      Capacitor: { isNativePlatform: () => false },
      CapacitorHttp: { get: async () => ({ status: 200, data: [] }) },
    };
  }
  if (id.includes('db')) {
    return { db: {} };
  }
  return {};
};

fn(moduleObj.exports, moduleObj, mockRequire);

const {
  isSeparatorChannel,
  cleanSeparatorName,
  isAdultCategoryName,
  detectResolution,
  shouldExcludeChannelByPrefix,
} = moduleObj.exports;

// 1. Test des séparateurs
console.log('  -> Test 1 : Détection et élimination des faux canaux (séparateurs)...');
const separators = [
  '▼ |BR| VOD BRAZIL |BR| ▼',
  '▲ |FR| GENERALISTES |FR| ▲',
  '--- FRANCE DIRECT ---',
  '=== SPORTS HD ===',
  '*** VOD NOUVEAUTES ***',
  '### ENFANTS ###',
  '>>> CINEMA <<<',
  '------------------------',
  '========================',
  '▼ REPLAY 7 JOURS ▼',
  'Séparateur thématique bouquet',
];

for (const name of separators) {
  const isSep = isSeparatorChannel({ name, stream_url: 'http://test.com/stream.m3u8' });
  assert.equal(isSep, true, `Le séparateur "${name}" n'a pas été détecté comme séparateur !`);
}

// 2. Test des vraies chaînes
console.log('  -> Test 2 : Préservation des vraies chaînes de télévision...');
const realChannels = [
  'TF1 HD',
  'France 2 FHD',
  'Canal+ UHD 4K',
  'M6 1080p',
  'beIN SPORTS 1 HD',
  'RMC Sport 1',
  'Eurosport 1',
  'National Geographic Wild',
  'Disney Channel',
];

for (const name of realChannels) {
  const isSep = isSeparatorChannel({ name, stream_url: 'http://server.iptv/live/user/pass/123.m3u8' });
  assert.equal(isSep, false, `La vraie chaîne "${name}" a été prise par erreur pour un séparateur !`);
}

// 3. Test des URLs factices
console.log('  -> Test 3 : Détection des canaux sans flux (URL factice)...');
assert.equal(isSeparatorChannel({ name: 'Chaine Test', stream_url: '#' }), true);
assert.equal(isSeparatorChannel({ name: 'Chaine Test', stream_url: '' }), true);
assert.equal(isSeparatorChannel({ name: 'Chaine Test', stream_url: 'http://localhost/dummy' }), true);
assert.equal(isSeparatorChannel({ name: 'Chaine Test', stream_url: 'http://127.0.0.1/dummy' }), true);

// 4. Test du nettoyage des titres
console.log('  -> Test 4 : Nettoyage des titres décoratifs...');
assert.equal(cleanSeparatorName('▼ |BR| VOD BRAZIL |BR| ▼'), 'VOD BRAZIL');
assert.equal(cleanSeparatorName('--- FRANCE DIRECT ---'), 'FRANCE DIRECT');
assert.equal(cleanSeparatorName('=== SPORT ==='), 'SPORT');

// 5. Test des résolutions
console.log('  -> Test 5 : Détection des résolutions vidéo...');
assert.equal(detectResolution('Canal+ 4K UHD'), '4K');
assert.equal(detectResolution('TF1 FHD 1080p'), 'FHD');
assert.equal(detectResolution('M6 HD 720p'), 'HD');
assert.equal(detectResolution('RTL SD'), 'SD');

// 6. Test du contrôle parental
console.log('  -> Test 6 : Détection des contenus adultes pour verrouillage parental...');
assert.equal(isAdultCategoryName('Adulte +18'), true);
assert.equal(isAdultCategoryName('XXX Adult Movies'), true);
assert.equal(isAdultCategoryName('France Divertissement'), false);
assert.equal(isAdultCategoryName('Cinéma Box Office'), false);

// 7. Test de l'exclusion par préfixes
console.log('  -> Test 7 : Filtrage configurable par préfixes...');
assert.equal(shouldExcludeChannelByPrefix('SP: Football Live', ['SP:']), true);
assert.equal(shouldExcludeChannelByPrefix('TF1 HD', ['SP:']), false);

// 8. Test de vérification de l'intégrité de la base de données (Dexie unique)
console.log('  -> Test 8 : Vérification de la source de données unique (Dexie)...');
const dbSource = fs.readFileSync('lib/db.ts', 'utf8');
assert.equal(dbSource.includes('NativeDatabase.bulkInsertChannels'), false, 'Présence résiduelle de double écriture SQLite native dans db.ts');
assert.equal(dbSource.includes('class KeoTVDatabase extends Dexie'), true, 'La base Dexie KeoTVDatabase doit être la source unique');

console.log('🎉 TOUS LES TESTS DE VALIDATION IPTV ONT RÉUSSI AVEC SUCCÈS !');
