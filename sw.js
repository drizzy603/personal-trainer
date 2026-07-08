var CACHE = 'kt-v27';
// './index.html' must be precached alongside './' — the manifest's start_url
// is ./index.html and the offline fallback matches by exact URL, so a fresh
// install can't launch offline without it.
var FILES = ['./', './index.html', './sw.js', './manifest.json', './app-icon-1024.png', './app-icon-192.png', './privacy.html',
  './assets/fonts/inter-var-latin.woff2', './assets/fonts/inter-var-latin-ext.woff2',
  './assets/fonts/jbm-var-latin.woff2', './assets/fonts/jbm-var-latin-ext.woff2'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if(e.request.method!=='GET') return;
  var url = e.request.url;
  // Network-first for HTML navigation requests so updates are seen immediately
  if(e.request.mode==='navigate' || url.endsWith('.html') || url.endsWith('/')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        if(res&&res.status===200) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c){c.put(e.request,clone);});
        }
        return res;
      }).catch(function(){
        return caches.match(e.request);
      })
    );
    return;
  }
  // Cache-first for everything else
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var network = fetch(e.request).then(function(res) {
        if(res&&res.status===200) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c){c.put(e.request,clone);});
        }
        return res;
      }).catch(function(){return cached;});
      return cached || network;
    })
  );
});
