'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Math.max(1, Number(process.env.PORT) || 3000);
const ROUTES = new Map([
  ['/','index.html'],
  ['/index.html','index.html'],
  ['/game.js','game.js'],
  ['/career.js','career.js'],
  ['/manifest.webmanifest','manifest.webmanifest'],
  ['/icon.svg','icon.svg'],
  ['/sw.js','sw.js']
]);
const TYPES = {
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8',
  '.svg':'image/svg+xml; charset=utf-8'
};

function send(res,status,body,headers={}) {
  res.writeHead(status,{
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Cross-Origin-Resource-Policy':'same-origin',
    ...headers
  });
  if(body===null){res.end();return}
  res.end(body);
}

function createServer() {
  return http.createServer((req,res)=>{
    let pathname;
    try { pathname=new URL(req.url,'http://localhost').pathname; }
    catch { send(res,400,'Bad request'); return; }

    if(pathname==='/health') {
      send(res,200,JSON.stringify({ok:true,app:'Super Kingdom Adventure'}),{
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store'
      });
      return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD') {
      send(res,405,'Method not allowed',{'Allow':'GET, HEAD'});
      return;
    }
    const file=ROUTES.get(pathname);
    if(!file) { send(res,404,'Not found',{'Content-Type':'text/plain; charset=utf-8'}); return; }

    const absolute=path.join(ROOT,file);
    fs.readFile(absolute,(error,content)=>{
      if(error) {
        send(res,error.code==='ENOENT'?404:500,error.code==='ENOENT'?'Not found':'Server error',{
          'Content-Type':'text/plain; charset=utf-8',
          'Cache-Control':'no-store'
        });
        return;
      }
      const cacheControl=['index.html','game.js','career.js','sw.js'].includes(file)
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=3600';
      send(res,200,req.method==='HEAD'?null:content,{
        'Content-Type':TYPES[path.extname(file)]||'application/octet-stream',
        'Content-Length':content.length,
        'Cache-Control':cacheControl,
        ...(file==='sw.js'?{'Service-Worker-Allowed':'/'}:{})
      });
    });
  });
}

if(require.main===module) {
  const server=createServer();
  server.listen(PORT,'0.0.0.0',()=>process.stdout.write('Super Kingdom Adventure listening on 0.0.0.0:'+PORT+'\n'));
  const shutdown=()=>server.close(()=>process.exit(0));
  process.on('SIGTERM',shutdown);
  process.on('SIGINT',shutdown);
}

module.exports={createServer};
