(function (g) {
  'use strict';

  const MAX_INPUT_BYTES = 450 * 1024 * 1024;
  const THREADS = '1';

  function guessInputName(fileName) {
    const dot = fileName.lastIndexOf('.');
    const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : '.mp4';
    return 'input' + ext;
  }

  function buildRemuxArgs(inputName, outputName) {
    return ['-i', inputName, '-c', 'copy', '-threads', THREADS, '-movflags', '+faststart', outputName];
  }

  g.runEncodeJob = async function runEncodeJob(job, emit) {
    const ab       = job.ab;
    const fileName = job.fileName || 'input.mp4';

    let ffmpeg = null;
    let inputName = '';
    let outputName = '';

    try {
      if (!(ab instanceof ArrayBuffer)) throw new Error('ENCODE_START: Failed File');

      if (ab.byteLength > MAX_INPUT_BYTES) {
        throw new Error(
          `File terlalu besar (${(ab.byteLength / 1048576).toFixed(0)} MB). ` +
          `Maksimal ${(MAX_INPUT_BYTES / 1048576).toFixed(0)} MB untuk encoder single-thread.`
        );
      }

      emit({ type: 'ENCODE_STAGE', stage: 'loading' });

      const base = new URL('./core/', g.location.href).href;

      ffmpeg = g.createFFmpeg({
        log: false,
        corePath: base + 'ffmpeg-core.js',
        wasmPath: base + 'ffmpeg-core.wasm',
        logger: ({ type, message }) => emit({ type: 'ENCODE_LOG', message: `[${type}] ${message}` }),
        progress: ({ ratio }) => {
          if (typeof ratio === 'number' && ratio >= 0 && isFinite(ratio)) {
            emit({ type: 'ENCODE_PROGRESS', ratio: Math.min(ratio, 1) });
          }
        },
      });

      await ffmpeg.load();
      ffmpeg.setInputSize(ab.byteLength);

      inputName  = guessInputName(fileName);
      outputName = 'output.mp4';

      emit({ type: 'ENCODE_STAGE', stage: 'reading' });
      ffmpeg.FS('writeFile', inputName, new Uint8Array(ab));

      const args = buildRemuxArgs(inputName, outputName);

      emit({ type: 'ENCODE_LOG', message: `[remux] $ ffmpeg ${args.join(' ')}` });

      emit({ type: 'ENCODE_STAGE', stage: 'encoding' });
      await ffmpeg.run(...args);

      emit({ type: 'ENCODE_STAGE', stage: 'finalizing' });
      const data = ffmpeg.FS('readFile', outputName);

      if (!data || data.byteLength === 0) {
        throw new Error('corrupt file. Remux Failed.');
      }

      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      if (arrayBuffer.byteLength !== data.byteLength) {
        throw new Error(`corrupt file ${data.byteLength} byte, copy ${arrayBuffer.byteLength} byte.`);
      }

      try { ffmpeg.FS('unlink', outputName); } catch (_) {}
      try { ffmpeg.FS('unlink', inputName);  } catch (_) {}
      outputName = '';
      inputName  = '';

      const baseName = fileName.replace(/\.[^/.]+$/, '');
      emit({
        type: 'ENCODE_DONE',
        arrayBuffer,
        fileName: `${baseName}-SenzeEXT.mp4`,
        mimeType: 'video/mp4',
      }, [arrayBuffer]);

    } catch (err) {
      emit({ type: 'ENCODE_ERROR', message: (err && err.message) || String(err) });
    } finally {
      try { if (ffmpeg && ffmpeg.isLoaded()) ffmpeg.exit(); } catch (_) {}
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
