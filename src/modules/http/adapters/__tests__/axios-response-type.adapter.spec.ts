import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import {
  readBodyAsResponseType,
  readDefaultBody,
  readText,
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
