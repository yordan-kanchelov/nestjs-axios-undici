import { Transform, pipeline, Readable } from 'node:stream';
import type { AxiosProgressEvent } from '../interfaces/axios-compatible.interface';

// ---------------------------------------------------------------------------
// `maxRate`/`onUploadProgress`/`onDownloadProgress` (plan.md phase 2:
// "Progress callbacks ... maxRate"). Ported from axios' own
// `lib/helpers/speedometer.js`/`throttle.js`/`progressEventReducer.js`/
// `AxiosTransformStream.js` so the event shape and throttling cadence match;
// trimmed to what this library needs (no `_read`-hook backpressure dance).
//
// Every entry point here is only ever called once a caller actually sets
// `onUploadProgress`/`onDownloadProgress`/`maxRate` - see the call sites in
// `http.service.ts` (`executeRequest`) and `axios-response.adapter.ts`
// (`toAxiosLikeResponse`), each gated behind a single `||`/`!== undefined`
// check so a plain request never allocates a reducer, a meter stream, or even
// enters this module's code.
// ---------------------------------------------------------------------------

/** axios' `utils.toFiniteNumber`: a finite number, or `undefined`. */
export function toFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = +(value as any);
  return Number.isFinite(n) ? n : undefined;
}

/** Splits `maxRate` (a single bytes/sec figure, or `[upload, download]`) the way axios does. */
export function resolveMaxRates(maxRate: unknown): {
  upload?: number;
  download?: number;
} {
  if (maxRate === undefined) return {};
  if (Array.isArray(maxRate)) {
    return {
      upload: toFiniteNumber(maxRate[0]),
      download: toFiniteNumber(maxRate[1]),
    };
  }
  const n = toFiniteNumber(maxRate);
  return { upload: n, download: n };
}

/**
 * axios' `speedometer`: a rolling bytes/sec estimate over the last
 * `samplesCount` chunks, `undefined` until at least `min` ms of samples have
 * accumulated.
 */
function speedometer(
  samplesCount: number,
  min: number,
): (chunkLength: number) => number | undefined {
  const bytes = new Array<number>(samplesCount);
  const timestamps = new Array<number>(samplesCount);
  let head = 0;
  let tail = 0;
  let firstSampleTS: number | undefined;

  return function push(chunkLength: number): number | undefined {
    const now = Date.now();
    const startedAt = timestamps[tail];
    if (!firstSampleTS) firstSampleTS = now;

    bytes[head] = chunkLength;
    timestamps[head] = now;

    let i = tail;
    let bytesCount = 0;
    while (i !== head) {
      bytesCount += bytes[i++];
      i = i % samplesCount;
    }
    head = (head + 1) % samplesCount;
    if (head === tail) tail = (tail + 1) % samplesCount;

    if (now - firstSampleTS < min) return undefined;
    const passed = startedAt && now - startedAt;
    return passed ? Math.round((bytesCount * 1000) / passed) : undefined;
  };
}

/** axios' `throttle`: at most one call per `1000/freq` ms, with a trailing call for the last, coalesced set of args - plus `flush()` to force it immediately (used on stream end so the final event is never lost mid-window). */
function throttle(
  fn: (...args: any[]) => void,
  freq: number,
): { call: (...args: any[]) => void; flush: () => void } {
  let timestamp = 0;
  const threshold = 1000 / freq;
  let lastArgs: any[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const invoke = (args: any[], now = Date.now()): void => {
    timestamp = now;
    lastArgs = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };

  return {
    call: (...args: any[]) => {
      const now = Date.now();
      const passed = now - timestamp;
      if (passed >= threshold) {
        invoke(args, now);
      } else {
        lastArgs = args;
        if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            invoke(lastArgs!);
          }, threshold - passed);
        }
      }
    },
    flush: () => {
      if (lastArgs) invoke(lastArgs);
    },
  };
}

/**
 * axios' `progressEventReducer` + `progressEventDecorator`: throttles raw
 * `(loaded, total)` updates into the public `AxiosProgressEvent` shape
 * (`loaded`/`total`/`progress`/`bytes`/`rate`/`estimated`/`lengthComputable`,
 * plus `upload`/`download`), calling `listener` at most every `1000/freq` ms
 * (axios: `freq = 3`) - `flush()` forces the last, still-throttled update
 * through immediately, called once the underlying stream ends so a fast
 * transfer's final `loaded === total` event is never dropped mid-window.
 */
export function createProgressReporter(
  listener: (event: AxiosProgressEvent) => void,
  isDownload: boolean,
  freq = 3,
): { report: (loaded: number, total?: number) => void; flush: () => void } {
  let bytesNotified = 0;
  const rate = speedometer(50, 250);
  const throttled = throttle((loaded: number, total?: number) => {
    const clampedLoaded = Math.max(
      0,
      total != null ? Math.min(loaded, total) : loaded,
    );
    const progressBytes = Math.max(0, clampedLoaded - bytesNotified);
    const currentRate = rate(progressBytes);
    bytesNotified = Math.max(bytesNotified, clampedLoaded);

    const event = {
      loaded: clampedLoaded,
      total,
      progress: total ? clampedLoaded / total : undefined,
      bytes: progressBytes,
      rate: currentRate || undefined,
      estimated:
        currentRate && total
          ? (total - clampedLoaded) / currentRate
          : undefined,
      lengthComputable: total != null,
    } as AxiosProgressEvent;
    (event as any)[isDownload ? 'download' : 'upload'] = true;
    listener(event);
  }, freq);

  return {
    report: (loaded, total) => throttled.call(loaded, total),
    flush: throttled.flush,
  };
}

const METER_CHUNK_SIZE = 64 * 1024;
const METER_MIN_CHUNK_SIZE = 100;
const METER_TIME_WINDOW = 500;

/**
 * Counts bytes passing through and, when `maxRate` (bytes/sec) is set,
 * throttles throughput to roughly that many bytes/sec - a trimmed port of
 * axios' `AxiosTransformStream` (`lib/helpers/AxiosTransformStream.js`):
 * same windowed-chunk-splitting algorithm, minus its `_read`-hook
 * backpressure bookkeeping (a plain `Transform`'s own highWaterMark handling
 * is enough for this opt-in feature). Emits `'progress'` with the cumulative
 * byte count on every chunk it lets through; a caller with no
 * `onUploadProgress`/`onDownloadProgress` never attaches a `'progress'`
 * listener, so the event is simply unobserved (still emitted - cheap, no
 * `newListener` gating like axios' own class bothers with, since building
 * this stream at all already means one of `onProgress`/`maxRate` was set).
 */
class ByteMeterStream extends Transform {
  private readonly maxRate: number;
  private bytesSeen = 0;
  private windowStart = 0;
  private windowBytes = 0;

  constructor(maxRate?: number) {
    super({ readableHighWaterMark: METER_CHUNK_SIZE });
    this.maxRate = maxRate && maxRate > 0 ? maxRate : 0;
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (!this.maxRate) {
      this.bytesSeen += buf.length;
      this.emit('progress', this.bytesSeen);
      callback(null, buf);
      return;
    }
    this.sendThrottled(buf, callback);
  }

  private sendThrottled(
    chunk: Buffer,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    const divider = 1000 / METER_TIME_WINDOW;
    const bytesThreshold = this.maxRate / divider;
    const minChunkSize = Math.max(METER_MIN_CHUNK_SIZE, bytesThreshold * 0.01);

    const now = Date.now();
    let passed: number;
    if (
      !this.windowStart ||
      (passed = now - this.windowStart) >= METER_TIME_WINDOW
    ) {
      this.windowStart = now;
      const bytesLeftPrev = bytesThreshold - this.windowBytes;
      this.windowBytes = bytesLeftPrev < 0 ? -bytesLeftPrev : 0;
      passed = 0;
    }

    const bytesLeft = bytesThreshold - this.windowBytes;
    if (bytesLeft <= 0) {
      setTimeout(
        () => this.sendThrottled(chunk, callback),
        METER_TIME_WINDOW - passed,
      );
      return;
    }

    const maxChunkSize = Math.min(METER_CHUNK_SIZE, bytesLeft);
    let toSend = chunk;
    let remainder: Buffer | undefined;
    if (
      chunk.length > maxChunkSize &&
      chunk.length - maxChunkSize > minChunkSize
    ) {
      remainder = chunk.subarray(maxChunkSize);
      toSend = chunk.subarray(0, maxChunkSize);
    }

    this.windowBytes += toSend.length;
    this.bytesSeen += toSend.length;
    this.emit('progress', this.bytesSeen);
    this.push(toSend);

    if (remainder) {
      process.nextTick(() => this.sendThrottled(remainder!, callback));
    } else {
      callback();
    }
  }
}

export interface MeterOptions {
  onProgress?: (event: AxiosProgressEvent) => void;
  maxRate?: number;
  /** Known total size (from `Content-Length`, or the body's own byte length), when available. */
  total?: number;
}

function attachReporter(
  meter: ByteMeterStream,
  isDownload: boolean,
  options: MeterOptions,
): void {
  if (!options.onProgress) return;
  const reporter = createProgressReporter(options.onProgress, isDownload, 3);
  meter.on('progress', (loaded: number) =>
    reporter.report(loaded, options.total),
  );
  meter.on('end', reporter.flush);
  meter.on('error', reporter.flush);
}

/**
 * Wraps a request body in a `ByteMeterStream` for `onUploadProgress`/upload
 * `maxRate` - only called when at least one of those is actually set (see
 * `http.service.ts`'s `executeRequest`). A string/Buffer body is converted to
 * a `Readable` first, exactly like axios' own upload path
 * (`stream.Readable.from(data, { objectMode: false })`); an existing stream
 * (a `form-data` package body, or this library's own
 * `globalFormDataToStream` output) is metered directly.
 *
 * **Not supported**: a raw `FormData` from the `undici` package (as opposed
 * to Node's global `FormData`, always converted to a stream upstream, or the
 * `form-data` package, already a stream) - undici encodes it internally, with
 * nothing for this library to pipe through first. Returned unchanged
 * (documented in `docs/axios-supported-options.md`).
 */
export function meterUploadBody(body: unknown, options: MeterOptions): unknown {
  if (body === undefined || body === null) return body;
  let source: Readable;
  if (typeof (body as any).pipe === 'function') {
    source = body as Readable;
  } else if (Buffer.isBuffer(body)) {
    source = Readable.from(body, { objectMode: false });
  } else if (typeof body === 'string') {
    source = Readable.from(Buffer.from(body), { objectMode: false });
  } else {
    return body;
  }
  const meter = new ByteMeterStream(options.maxRate);
  attachReporter(meter, false, options);
  return pipeline(source, meter, () => undefined);
}

/**
 * Wraps a response body in a `ByteMeterStream` for `onDownloadProgress`/
 * download `maxRate` - only called when at least one of those is actually
 * set (see `axios-response.adapter.ts`'s `toAxiosLikeResponse`), for every
 * `responseType` including `'stream'` (the meter is transparent to
 * `.pipe()`/async iteration, which is all the decode paths and a caller
 * consuming a `stream` response ever need).
 */
export function meterDownloadBody(
  body: Readable,
  options: MeterOptions,
): Readable {
  const meter = new ByteMeterStream(options.maxRate);
  attachReporter(meter, true, options);
  return pipeline(body, meter, () => undefined);
}

/** Known upload body length: a string/Buffer's own byte length, or an already-set `Content-Length` header. Otherwise `undefined` (unknown length - `lengthComputable: false`, matching axios for a body without one). */
export function resolveUploadTotal(
  body: unknown,
  headers: Record<string, any> | undefined,
): number | undefined {
  if (typeof body === 'string') return Buffer.byteLength(body);
  if (Buffer.isBuffer(body)) return body.length;
  if (headers) {
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-length') {
        return toFiniteNumber(headers[key]);
      }
    }
  }
  return undefined;
}
