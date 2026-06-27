// Versão do cache — mantenha em sincronia com APP_VERSION em app.js. Suba a cada deploy.
const APP_VERSION = '1.1.0';
const CACHE_NAME = 'agenda-trabalho-v' + APP_VERSION;

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.png',
  './icon-192.png'
];

// Recursos servidos com network-first (sempre tenta a versão mais nova do deploy)
function isCoreAsset(url) {
  return url.pathname.endsWith('/') ||
         url.pathname.endsWith('/index.html') ||
         url.pathname.endsWith('/app.js') ||
         url.pathname.endsWith('/style.css');
}

// Instalação: pré-cacheia os recursos essenciais
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching arquivos estáticos...');
      return cache.addAll(ASSETS);
    })
    // NÃO chama skipWaiting aqui: o novo worker fica "waiting" até o usuário
    // tocar em "Nova versão disponível" (mensagem SKIP_WAITING vinda do app).
  );
});

// Mensagem do app para ativar imediatamente a nova versão
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Ativação: limpa caches antigos e assume o controle
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) {
          console.log('Deletando cache antigo:', key);
          return caches.delete(key);
        }
      })
    )).then(() => self.clients.claim())
  );
});

// Estratégia de Fetch
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isNavigation = req.mode === 'navigate';

  // Network-first para navegações e recursos centrais (HTML/JS/CSS) do mesmo domínio.
  if (isNavigation || (sameOrigin && isCoreAsset(url))) {
    e.respondWith(
      fetch(req)
        .then(networkResponse => {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return networkResponse;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first para o resto (ícones, manifest, fontes, etc.)
  e.respondWith(
    caches.match(req).then(cached => {
      return cached || fetch(req).then(networkResponse => {
        if (sameOrigin) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return networkResponse;
      });
    }).catch(() => undefined)
  );
});
