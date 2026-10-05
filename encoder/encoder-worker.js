importScripts('./core/ffmpeg-core.js', './ffmpeg/ffmpeg.js', './encode-job.js');

self.onmessage = (e) => {
  const data = e.data;
  if (data && data.type === 'ENCODE') {
    self.runEncodeJob(data, (msg, transfer) => self.postMessage(msg, transfer || []));
  }
};
self.postMessage({ type: 'WORKER_READY' });
