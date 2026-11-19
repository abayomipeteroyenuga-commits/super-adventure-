'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('./server');

let server,base;
test.before(async()=>{
 server=createServer();
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 const address=server.address();
 base='http://127.0.0.1:'+address.port;
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});

test('health endpoint reports the app as healthy',async()=>{
 const response=await fetch(base+'/health');
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,app:'Super Kingdom Adventure'});
 assert.equal(response.headers.get('cache-control'),'no-store');
});

test('root serves the game start screen',async()=>{
 const response=await fetch(base+'/');
 assert.equal(response.status,200);
 assert.match(response.headers.get('content-type'),/text\/html/);
 const html=await response.text();
 assert.match(html,/SUPER KINGDOM/);
 assert.match(html,/career\.js/);
 assert.match(html,/game\.js/);
});

test('game scripts and PWA assets are served with correct types',async()=>{
 for(const [route,type] of [
  ['/game.js',/javascript/],
  ['/career.js',/javascript/],
  ['/manifest.webmanifest',/manifest\+json/],
  ['/icon.svg',/image\/svg\+xml/],
  ['/sw.js',/javascript/]
 ]){
  const response=await fetch(base+route);
  assert.equal(response.status,200,route);
  assert.match(response.headers.get('content-type'),type,route);
 }
});

test('unlisted paths are not served',async()=>{
 const response=await fetch(base+'/server.js');
 assert.equal(response.status,404);
});

test('only GET and HEAD are accepted',async()=>{
 const response=await fetch(base+'/',{method:'POST'});
 assert.equal(response.status,405);
 assert.equal(response.headers.get('allow'),'GET, HEAD');
 const head=await fetch(base+'/health',{method:'HEAD'});
 assert.equal(head.status,200);
});
