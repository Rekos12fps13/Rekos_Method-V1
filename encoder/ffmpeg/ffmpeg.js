(function (g) {

const wasmCache = new Map();

const loadWasmBinary = (url) => {
  if (!wasmCache.has(url)) {
    const p = (async () => {
      const resp = await fetch(url);
      if (resp.ok === false) throw Error(`Gagal memuat ${url} (${resp.status})`);
      return resp.arrayBuffer();
    })();
    p.catch(() => wasmCache.delete(url));
    wasmCache.set(url, p);
  }
  return wasmCache.get(url);
};

const parseArgs = (Core, args) => {
  const argsPtr = Core._malloc(args.length * 4);
  const argPtrs = args.map((arg) => {
    const ptr = Core._malloc(arg.length + 1);
    for (let i = 0; i < arg.length; i++) Core.HEAPU8[ptr + i] = arg.charCodeAt(i);
    Core.HEAPU8[ptr + arg.length] = 0;
    return ptr;
  });
  argPtrs.forEach((ptr, i) => { Core.HEAP32[(argsPtr >> 2) + i] = ptr; });
  return [args.length, argsPtr];
};

const RE_DURATION = /^\s*Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const RE_STATS    = /^\s*(?:frame|size|Lsize)=/;
const RE_TIME     = /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/;
const RE_SIZE     = /size=\s*(\d+)\s*kB/i;
const hms = (h, m, s) => parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s);

const makeLineDevice = (onLine) => {
  const decoder = new TextDecoder('utf-8');
  let bytes = [];
  const flush = () => {
    if (!bytes.length) return;
    const msg = decoder.decode(new Uint8Array(bytes));
    bytes = [];
    if (msg.trim().length) onLine(msg);
  };
  const put = (b) => {
    if (b === null || b === undefined || b === 10 || b === 13) { flush(); return; }
    b &= 0xff;
    if (b !== 0) bytes.push(b);
  };
  put.flush = flush;
  return put;
};

// createFFmpeg
const defaultArgs = ['-nostdin', '-y'];

const createFFmpeg = (_options = {}) => {
  const {
    log: optLog       = false,
    logger: optLogger = () => {},
    progress: optProg = () => {},
    corePath:   _corePath,
    wasmPath:   _wasmPath,
  } = _options;

  let Core = null, ffmpeg = null, argv0 = [], flushLines = () => {};
  let runResolve = null, runReject = null, running = false;
  let customLogger = optLogger, logging = optLog, progress = optProg;

  // state progress (di-reset tiap run)
  let duration = 0, ratio = 0, lastSent = -1, inputSize = 0;

  const log = (type, message) => {
    customLogger({ type, message });
    if (logging) console.log(`[ffmpeg][${type}] ${message}`);
  };

  const detectCompletion = (message) => {
    if (message === 'FFMPEG_END' && runResolve) {
      runResolve(); runResolve = null; runReject = null; running = false;
    }
  };

  const report = (r, extra = {}) => {
    if (typeof r !== 'number' || !Number.isFinite(r)) return;
    r = Math.min(Math.max(r, 0), 1);
    if (r <= lastSent) return;
    lastSent = r; ratio = r;
    progress({ ratio: r, ...extra });
  };

  const parseProgress = (message) => {
    if (typeof message !== 'string') return;

    if (!duration) {
      const d = RE_DURATION.exec(message);
      if (d) {
        const v = hms(d[1], d[2], d[3]);
        if (v > 0) { duration = v; report(0, { duration }); }
        return;
      }
    }

    if (RE_STATS.test(message)) {
      let r = NaN;
      const t = RE_TIME.exec(message);
      if (t && duration > 0) r = hms(t[1], t[2], t[3]) / duration;

      if (!Number.isFinite(r) && inputSize > 0) {
        const s = RE_SIZE.exec(message);
        if (s) r = (parseInt(s[1], 10) * 1024) / inputSize;
      }
      if (Number.isFinite(r)) report(Math.min(r, 0.99));
      return;
    }

    if (message.startsWith('video:')) report(1);
  };

  const parseMessage = ({ type, message }) => {
    log(type, message);
    parseProgress(message);
    detectCompletion(message);
  };

  const load = async () => {
    if (Core !== null) throw Error('ffmpeg.wasm sudah di-load.');

    if (typeof g.createFFmpegCore === 'undefined') {
      throw Error(
        'createFFmpegCore tidak ditemukan. ' +
        'Pastikan ffmpeg-core.js dimuat sebagai classic <script> sebelum module ini.'
      );
    }

    log('info', 'load ffmpeg-core 0.11.1 (single-thread)...');

    const corePath = _corePath;
    const wasmPath = _wasmPath ?? corePath.replace(/ffmpeg-core\.js$/, 'ffmpeg-core.wasm');

    const wasmBinary = await loadWasmBinary(wasmPath);

    const outDev = makeLineDevice((message) => parseMessage({ type: 'ffout', message }));
    const errDev = makeLineDevice((message) => parseMessage({ type: 'fferr', message }));
    flushLines = () => { outDev.flush(); errDev.flush(); };

    Core = await g.createFFmpegCore({
      mainScriptUrlOrBlob: corePath,
      wasmBinary,
      // device per-byte: flush baris di '\n' dan '\r'
      stdout: outDev,
      stderr: errDev,
      // fallback kalau core tidak memakai device di atas
      printErr: (msg) => parseMessage({ type: 'fferr', message: msg }),
      print:    (msg) => parseMessage({ type: 'ffout', message: msg }),
      stdin: () => null,
    });

    // build single-thread meng-export 'main', build multi-thread 'proxy_main'
    const entry = typeof Core._proxy_main === 'function' ? 'proxy_main' : 'main';
    ffmpeg = Core.cwrap(entry, 'number', ['number', 'number']);
    // 'main' butuh argv[0] = nama program; 'proxy_main'
    argv0 = entry === 'main' ? ['./ffmpeg'] : [];
    log('info', 'ffmpeg-core Ready (single-thread)');
  };

  const isLoaded = () => Core !== null;

  const setInputSize = (n) => { inputSize = Number(n) > 0 ? Number(n) : 0; };

  const run = (..._args) => {
    log('info', `run: ${_args.join(' ')}`);
    if (!Core)   throw Error('Belum di-load, panggil load() dulu.');
    if (running) throw Error('Proses');
    running = true;
    duration = 0; ratio = 0; lastSent = -1;
    return new Promise((resolve, reject) => {
      const args = [...argv0, ...defaultArgs, ..._args].filter((s) => s.length !== 0);
      runResolve = resolve; runReject = reject;
      try {
        const rc = ffmpeg(...parseArgs(Core, args));
        flushLines();
        if (runResolve) {
          const done = runResolve, fail = runReject;
          runResolve = null; runReject = null; running = false;
          if (rc === 0 || rc === undefined) done();
          else fail(new Error(`ffmpeg exit code ${rc}`));
        }
      } catch (e) {
        try { flushLines(); } catch (_) {}
        const done = runResolve;
        const fail = runReject;
        runResolve = null; runReject = null; running = false;
        if (e && e.name === 'ExitStatus') {
          if (e.status === 0) { if (done) done(); }
          else if (fail) fail(new Error(`ffmpeg exit code ${e.status}`));
        } else if (fail) {
          fail(e instanceof Error ? e : new Error(String(e)));
        }
      }
    });
  };

  const FS = (method, ...args) => {
    if (!Core) throw Error('Belum di-load, panggil load() dulu.');
    try {
      return Core.FS[method](...args);
    } catch (e) {
      if (method === 'readdir')  throw Error(`FS.readdir('${args[0]}') gagal`);
      if (method === 'readFile') throw Error(`FS.readFile('${args[0]}') gagal`);
      throw Error(`FS.${method} gagal: ${e.message}`);
    }
  };

  const exit = () => {
    if (!Core) throw Error('Belum di-load.');
    if (runReject) runReject('ffmpeg exited');
    running = false;
    try { Core.exit(1); } catch (_) {}
    Core = null; ffmpeg = null; runResolve = null; runReject = null;
  };

  const setProgress = (fn)  => { progress     = fn;  };
  const setLogger   = (fn)  => { customLogger = fn;  };
  const setLogging  = (val) => { logging      = val; };

  return { load, isLoaded, run, FS, exit, setProgress, setLogger, setLogging, setInputSize };
};

  g.createFFmpeg = createFFmpeg;
})(typeof globalThis !== 'undefined' ? globalThis : self);
