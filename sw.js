const CACHE_NAME = 'agenda-trabalho-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.png',
  './icon-192.png'
];

// Instalação do Service Worker e caching de recursos essenciais
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching arquivos estáticos...');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('Deletando cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia de Fetch: Cache First, Fallback para Network
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      // Se estiver no cache, retorna. Caso contrário, busca na rede.
      return cachedResponse || fetch(e.request).then(networkResponse => {
        // Opcional: Adiciona recursos novos buscados dinamicamente no cache
        return caches.open(CACHE_NAME).then(cache => {
          // Apenas cacheia requests do mesmo domínio e métodos GET
          if (e.request.url.startsWith(self.location.origin) && e.request.method === 'GET') {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        });
      });
    }).catch(() => {
      // Offline fallback se necessário (opcional)
    })
  );
});
