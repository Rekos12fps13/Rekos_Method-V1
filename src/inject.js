(function () {

  window.postMessage({ type: 'Rekos12fps_INJECT_READY' }, '*');

  window.addEventListener('message', function handler(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== 'Rekos12fps_INJECT_CODE') return;

    const code = event.data.code;
    const blob = new Blob([code], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const s = document.createElement('script');
    s.src = blobUrl;
    s.onload = function () { URL.revokeObjectURL(blobUrl); this.remove(); };
    s.onerror = function () { URL.revokeObjectURL(blobUrl); console.error('[Rekos12fps] Failed execute script.'); };
    (document.head || document.documentElement).appendChild(s);

    window.removeEventListener('message', handler);
  });

})();