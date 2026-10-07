import assert from 'node:assert/strict';process.env.MIHU_TEST_MODE='1';await import('./local-backend.mjs');const {cropRect,moveCrop}=await import('../lib/crop-geometry.ts');
const start={zoom:1,x:50,y:50};assert.deepEqual(cropRect(1200,800,start),{left:200,top:0,side:800});
const zoom=moveCrop(start,1200,800,400,0,0,2);assert.equal(zoom.zoom,2);const r=cropRect(1200,800,zoom);assert.equal(r.left+r.side/2,600);assert.equal(r.top+r.side/2,400);
const drag=moveCrop(zoom,1200,800,400,50,0);assert.ok(cropRect(1200,800,drag).left<r.left);
for(const size of [[800,1200],[1200,800],[800,800]])for(const factor of [.001,1,100]){const v=moveCrop(zoom,...size,320,99999,-99999,factor);const rect=cropRect(...size,v);assert.ok(v.zoom>=1&&v.zoom<=5);assert.ok(rect.left>=0&&rect.top>=0);assert.ok(rect.left+rect.side<=size[0]+1e-6&&rect.top+rect.side<=size[1]+1e-6);}
console.log('PASS Crop: drag direction, zoom center, min/max zoom and bounds for portrait/landscape/square.');
