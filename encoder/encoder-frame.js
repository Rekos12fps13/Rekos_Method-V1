function isTikTokOrigin(origin) {
  if (origin === 'https://tiktok.com') return true;
  return /^https:\/\/[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.tiktok\.com$/.test(origin);
}

function detectParentOrigin() {
  try {
    if (document.referrer) {
      const url = new URL(document.referrer);
      if (isTikTokOrigin(url.origin)) return url.origin;
    }
  } catch (_) {}
  return '*';
}

let _parentOrigin = detectParentOrigin();

function postToParent(msg, transfer = []) {
  window.parent.postMessage(msg, '*', transfer);
}

let _encodeQueue = Promise.resolve();

function enqueueEncode(task) {
  const run = () => task().catch((err) => {
    postToParent({ type: 'ENCODE_ERROR', message: err?.message ?? String(err) });
  });
  _encodeQueue = _encodeQueue.then(run, run);
  return _encodeQueue;
}

const WORKER_READY_TIMEOUT_MS = 8000;

function runJob(job) {
  return new Promise((resolve) => {
    let finished = false;
    let worker = null;
    let readyTimer = null;
    let jobSent = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(readyTimer);
      try { worker && worker.terminate(); } catch (_) {}
      worker = null;
      resolve();
    };

    const emit = (msg, transfer) => {
      postToParent(msg, transfer || []);
      if (msg.type === 'ENCODE_DONE' || msg.type === 'ENCODE_ERROR') finish();
    };

    const fallbackInFrame = (reason) => {
      if (finished) return;
      clearTimeout(readyTimer);
      try { worker && worker.terminate(); } catch (_) {}
      worker = null;
      postToParent({ type: 'ENCODE_LOG', message: `[frame] worker tidak tersedia (${reason}), encode di frame` });
      if (typeof globalThis.runEncodeJob !== 'function') {
        emit({ type: 'ENCODE_ERROR', message: `Encoder tidak bisa dimulai (${reason})` });
        return;
      }
      globalThis.runEncodeJob(job, emit);
    };

    try {
      worker = new Worker(new URL('./encoder-worker.js', import.meta.url));
    } catch (err) {
      fallbackInFrame(err?.message || 'Worker constructor gagal');
      return;
    }

    readyTimer = setTimeout(() => fallbackInFrame('timeout'), WORKER_READY_TIMEOUT_MS);

    worker.onmessage = (e) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'WORKER_READY') {
        if (jobSent) return;
        jobSent = true;
        clearTimeout(readyTimer);
        worker.postMessage(
          { type: 'ENCODE', ab: job.ab, fileName: job.fileName },
          [job.ab]
        );
        return;
      }
      emit(msg, msg.type === 'ENCODE_DONE' && msg.arrayBuffer ? [msg.arrayBuffer] : []);
    };

    worker.onerror = (e) => {
      const reason = e?.message || 'worker error';
      if (e && e.preventDefault) e.preventDefault();
      if (!jobSent) fallbackInFrame(reason);
      else emit({ type: 'ENCODE_ERROR', message: `Encoder crash: ${reason}` });
    };

    worker.onmessageerror = () => {
      if (jobSent) emit({ type: 'ENCODE_ERROR', message: 'Encoder message error' });
    };
  });
}

let _bootAcked = false;

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'BOOT_ACK') {
    _bootAcked = true;
  }
});

window.addEventListener('message', (event) => {
  if (!isTikTokOrigin(event.origin)) return;

  if (_parentOrigin === '*') _parentOrigin = event.origin;

  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'BOOT_ACK') return;

  if (msg.type === 'ENCODE_START') {
    const fileName = msg.fileName || 'input.mp4';

    if (msg.ab instanceof ArrayBuffer) {
      enqueueEncode(() => runJob({ ab: msg.ab, fileName }));
    } else if (msg.file instanceof File) {
      enqueueEncode(async () => runJob({ ab: await msg.file.arrayBuffer(), fileName: msg.file.name || fileName }));
    } else {
      postToParent({ type: 'ENCODE_ERROR', message: 'ENCODE_START: Failed File' });
    }
  }
});

queueMicrotask(() => {
  postToParent({ type: 'FRAME_BOOTED' });

  let attempts = 0;
  const MAX_ATTEMPTS = 20;
  const retryId = setInterval(() => {
    if (_bootAcked || attempts >= MAX_ATTEMPTS) {
      clearInterval(retryId);
      return;
    }
    postToParent({ type: 'FRAME_BOOTED' });
    attempts++;
  }, 100);
});
