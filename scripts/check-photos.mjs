import assert from 'node:assert/strict';
process.env.MIHU_TEST_MODE='1';await import('./local-backend.mjs');
const {choosePhotos}=await import('../lib/photo-rotation.ts');
assert.deepEqual(choosePhotos([]),[]);assert.deepEqual(choosePhotos(['a']),['a']);assert.deepEqual(choosePhotos(['a','b']),['a','b']);
for(let i=0;i<100;i++){const pair=choosePhotos(['a','b','c','d','e','f'],['a','b']);assert.equal(pair.length,2);assert.equal(new Set(pair).size,2);assert.ok(pair.every(x=>!['a','b'].includes(x)));const three=choosePhotos(['a','b','c'],['a','b']);assert.ok(three.includes('c'));assert.equal(new Set(three).size,2);}
assert.equal(new Set(choosePhotos(['a','a','b','c'])).size,2);
console.log('PASS Photo rotation: 0/1/2/3/6 images, distinct slots, previous pair replaced and duplicate IDs handled.');
