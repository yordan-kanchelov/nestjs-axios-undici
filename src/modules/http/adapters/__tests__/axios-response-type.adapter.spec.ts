import { Readable } from 'node:stream';
import { gzipSync, zstdCompressSync } from 'node:zlib';
import {
  isZstdSupported,
  parseJsonOrText,
  parseTextMaybeJson,
  readBodyAsResponseType,
  readDefaultBody,
  readText,
  SUPPORTED_CONTENT_ENCODINGS,
} from '../axios-response-type.adapter';

/** A fake `Dispatcher.ResponseData['body']` backed by a real, pipeable `Readable` - enough for both the fast (`.arrayBuffer()`/`.text()`) and streaming (`.pipe()`) decode paths. */
function bodyFromBuffer(buf: Buffer): any {
  const stream = Readable.from([buf]) as any;
  stream.arrayBuffer = async () =>
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  stream.text = async () => buf.toString('utf8');
  stream.bodyUsed = false;
  return stream;
}

/** A fake compressed body backed by a real `Readable`, so a test can assert it was `.destroy()`ed once a limit aborts the read early. */
function bodyFromCompressedBuffer(buf: Buffer): any {
  const body = Readable.from([buf]) as any;
  body.bodyUsed = false;
  return body;
}

describe('axios-response-type adapter: gzip + maxContentLength', () => {
  it('decompresses normally when no maxContentLength is set (fast path, unaffected)', async () => {
    const raw = Buffer.from('x'.repeat(5000));
    const body = bodyFromBuffer(gzipSync(raw));

    const result = await readBodyAsResponseType(
      body,
      'arraybuffer',
      undefined,
      {
        contentEncoding: 'gzip',
      },
    );

    expect(Buffer.from(result).toString()).toBe(raw.toString());
  });

  it('decompresses normally when the decompressed size is within maxContentLength (streaming path)', async () => {
    const raw = Buffer.from('x'.repeat(5000));
    const body = bodyFromBuffer(gzipSync(raw));

    const result = await readBodyAsResponseType(body, 'arraybuffer', 10_000, {
      contentEncoding: 'gzip',
    });

    expect(Buffer.from(result).toString()).toBe(raw.toString());
  });

  it('rejects with ERR_BAD_RESPONSE when the DECOMPRESSED size exceeds maxContentLength, not the compressed size', async () => {
    // 100KB of a single repeated byte compresses to well under 1KB, but
    // decompresses past a 1000-byte limit.
    const raw = Buffer.alloc(100_000, 'x');
    const compressed = gzipSync(raw);
    expect(compressed.length).toBeLessThan(1000);
    const body = bodyFromBuffer(compressed);

    await expect(
      readBodyAsResponseType(body, 'arraybuffer', 1000, {
        contentEncoding: 'gzip',
      }),
    ).rejects.toMatchObject({
      code: 'ERR_BAD_RESPONSE',
      message: 'maxContentLength size of 1000 exceeded',
    });
  });

  it('rejects the same way through readDefaultBody (no explicit responseType)', async () => {
    const raw = Buffer.alloc(100_000, 'x');
    const body = bodyFromBuffer(gzipSync(raw));

    await expect(
      readDefaultBody(body, 'application/octet-stream', {
        maxContentLength: 1000,
        contentEncoding: 'gzip',
      }),
    ).rejects.toMatchObject({ code: 'ERR_BAD_RESPONSE' });
  });

  it('rejects the same way through readText (text/json responses)', async () => {
    const raw = Buffer.from(JSON.stringify({ z: 'x'.repeat(100_000) }));
    const body = bodyFromBuffer(gzipSync(raw));

    await expect(
      readText(body, { maxContentLength: 1000, contentEncoding: 'gzip' }),
    ).rejects.toMatchObject({ code: 'ERR_BAD_RESPONSE' });
  });

  it('decompress: false checks the raw (compressed) bytes, unaffected by this change', async () => {
    const raw = Buffer.alloc(100_000, 'x');
    const compressed = gzipSync(raw);
    // The compressed body itself is small - well within the limit - even
    // though its *decompressed* size would exceed it.
    const body = bodyFromBuffer(compressed);

    const result = await readBodyAsResponseType(
      body,
      'arraybuffer',
      1_000_000,
      {
        contentEncoding: 'gzip',
        decompress: false,
      },
    );

    expect(Buffer.compare(Buffer.from(result), compressed)).toBe(0);
  });

  it('corrupt gzip data still rejects with a limit set (streaming path), not just on the fast/no-limit path', async () => {
    const body = bodyFromBuffer(Buffer.from('this is not gzip'));

    await expect(
      readBodyAsResponseType(body, 'arraybuffer', 1000, {
        contentEncoding: 'gzip',
      }),
    ).rejects.toBeTruthy();
  });

  it('memory/early-abort: a highly compressible gzip body rejects quickly, without decompressing it all in memory (see also the real-server test in gzip-bomb.e2e.spec.ts)', async () => {
    // 50MB of zeros - representative "gzip bomb" shape - compresses down to
    // a tiny buffer almost instantly.
    const raw = Buffer.alloc(50 * 1024 * 1024);
    const compressed = gzipSync(raw);
    const body = bodyFromCompressedBuffer(compressed);

    const t0 = Date.now();
    await expect(
      readBodyAsResponseType(body, 'arraybuffer', 1000, {
        contentEncoding: 'gzip',
      }),
    ).rejects.toMatchObject({ code: 'ERR_BAD_RESPONSE' });
    const elapsedMs = Date.now() - t0;

    // Rejects quickly - nowhere near what fully decompressing and buffering
    // 50MB would take (not asserting on RSS here: too flaky in CI - see the
    // real-server test for a memory-bounded check via `repro-maxcontent.js`
    // and `plan.md`).
    expect(elapsedMs).toBeLessThan(2000);
    // Both the compressed source and the decompression stream are destroyed
    // the moment the limit is crossed, not left to linger/keep decompressing
    // in the background.
    expect(body.destroyed).toBe(true);
  });
});

describe('axios-response-type adapter: zstd decompression', () => {
  it('this Node build supports zstd (sanity check for the rest of this block)', () => {
    // Every Node this package's `engines.node` (`>=22.17.0`) allows has zstd
    // (added in 22.15.0/23.8.0) - see the doc comment on `isZstdSupported`.
    // If this ever fails on a real, supported Node build, the feature-detect
    // itself (not just this test) needs a second look.
    expect(isZstdSupported).toBe(true);
  });

  it('decompresses a zstd body (buffered/fast path, no maxContentLength)', async () => {
    const raw = Buffer.from('x'.repeat(5000));
    const body = bodyFromBuffer(zstdCompressSync(raw));

    const result = await readBodyAsResponseType(
      body,
      'arraybuffer',
      undefined,
      { contentEncoding: 'zstd' },
    );

    expect(Buffer.from(result).toString()).toBe(raw.toString());
  });

  it('decompresses a zstd body via the streaming path (maxContentLength set, within the limit)', async () => {
    const raw = Buffer.from('x'.repeat(5000));
    const body = bodyFromBuffer(zstdCompressSync(raw));

    const result = await readBodyAsResponseType(body, 'arraybuffer', 10_000, {
      contentEncoding: 'zstd',
    });

    expect(Buffer.from(result).toString()).toBe(raw.toString());
  });

  it('enforces maxContentLength against the DECOMPRESSED zstd size, not the compressed size', async () => {
    const raw = Buffer.alloc(100_000, 'x');
    const compressed = zstdCompressSync(raw);
    expect(compressed.length).toBeLessThan(1000);
    const body = bodyFromBuffer(compressed);

    await expect(
      readBodyAsResponseType(body, 'arraybuffer', 1000, {
        contentEncoding: 'zstd',
      }),
    ).rejects.toMatchObject({
      code: 'ERR_BAD_RESPONSE',
      message: 'maxContentLength size of 1000 exceeded',
    });
  });

  it('decompress: false leaves a zstd body as the raw (compressed) bytes', async () => {
    const raw = Buffer.from('hello zstd');
    const compressed = zstdCompressSync(raw);
    const body = bodyFromBuffer(compressed);

    const result = await readBodyAsResponseType(
      body,
      'arraybuffer',
      undefined,
      { contentEncoding: 'zstd', decompress: false },
    );

    expect(Buffer.compare(Buffer.from(result), compressed)).toBe(0);
  });

  it('decompresses a zstd body for `responseType: "stream"`, honouring maxContentLength on the decoded bytes', async () => {
    const raw = Buffer.alloc(50_000, 'y');
    const compressed = zstdCompressSync(raw);
    const body = bodyFromCompressedBuffer(compressed);

    const stream = await readBodyAsResponseType(body, 'stream', undefined, {
      contentEncoding: 'zstd',
    });

    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).equals(raw)).toBe(true);
  });

  it('readDefaultBody (no explicit responseType) decodes and JSON-parses a zstd body', async () => {
    const raw = Buffer.from(JSON.stringify({ ok: true }));
    const body = bodyFromBuffer(zstdCompressSync(raw));

    const result = await readDefaultBody(body, 'application/json', {
      contentEncoding: 'zstd',
    });

    expect(result).toEqual({ ok: true });
  });

  it("the default Accept-Encoding doesn't advertise zstd, matching axios' own default", () => {
    // axios 1.20 only sends `zstd` in `Accept-Encoding` when
    // `transitional.advertiseZstdAcceptEncoding === true` is explicitly set;
    // its own out-of-the-box default (`ACCEPT_ENCODING`, not
    // `ACCEPT_ENCODING_WITH_ZSTD`) leaves it out - see the doc comment on
    // `SUPPORTED_CONTENT_ENCODINGS`.
    expect(SUPPORTED_CONTENT_ENCODINGS).toBe('gzip, deflate, br');
    expect(SUPPORTED_CONTENT_ENCODINGS).not.toContain('zstd');
  });
});

describe('axios-response-type adapter: parseReviver', () => {
  it('parseJsonOrText passes the reviver through to JSON.parse', () => {
    const reviver = (key: string, value: any) =>
      typeof value === 'number' ? value * 2 : value;

    expect(parseJsonOrText('{"a":1,"b":2}', reviver)).toEqual({ a: 2, b: 4 });
  });

  it('parseJsonOrText with no reviver behaves exactly as before', () => {
    expect(parseJsonOrText('{"a":1}')).toEqual({ a: 1 });
  });

  it('parseTextMaybeJson passes the reviver through when the text looks like JSON', () => {
    const reviver = (key: string, value: any) =>
      typeof value === 'number' ? value * 10 : value;

    expect(parseTextMaybeJson('[1,2,3]', reviver)).toEqual([10, 20, 30]);
  });

  it('parseTextMaybeJson never calls the reviver for plain (non-JSON-looking) text', () => {
    const reviver = jest.fn((key: string, value: any) => value);

    expect(parseTextMaybeJson('just plain text', reviver)).toBe(
      'just plain text',
    );
    expect(reviver).not.toHaveBeenCalled();
  });

  it('readDefaultBody applies parseReviver to a JSON response (Content-Type: application/json)', async () => {
    const body = bodyFromBuffer(Buffer.from('{"n":5}'));
    const reviver = (key: string, value: any) =>
      typeof value === 'number' ? value + 1 : value;

    const result = await readDefaultBody(body, 'application/json', {
      parseReviver: reviver,
    });

    expect(result).toEqual({ n: 6 });
  });

  it('readDefaultBody applies parseReviver to a JSON-looking text/plain response', async () => {
    const body = bodyFromBuffer(Buffer.from('{"n":5}'));
    const reviver = (key: string, value: any) =>
      typeof value === 'number' ? value + 100 : value;

    const result = await readDefaultBody(body, 'text/plain', {
      parseReviver: reviver,
    });

    expect(result).toEqual({ n: 105 });
  });

  it('readBodyAsResponseType applies parseReviver only for responseType: "json"', async () => {
    const body = bodyFromBuffer(Buffer.from('{"n":5}'));
    const reviver = (key: string, value: any) =>
      typeof value === 'number' ? value + 1 : value;

    const asJson = await readBodyAsResponseType(
      bodyFromBuffer(Buffer.from('{"n":5}')),
      'json',
      undefined,
      { parseReviver: reviver },
    );
    expect(asJson).toEqual({ n: 6 });

    // `responseType: 'text'` never JSON-parses at all, reviver or not.
    const asText = await readBodyAsResponseType(body, 'text', undefined, {
      parseReviver: reviver,
    });
    expect(asText).toBe('{"n":5}');
  });
});
