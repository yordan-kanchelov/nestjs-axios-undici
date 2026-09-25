/**
 * Axios-compatible header types
 * These types match axios header definitions for compatibility
 */

/**
 * Valid axios header value types
 */
export type AxiosHeaderValue =
  string | string[] | number | boolean | null | undefined;

/**
 * Common HTTP request headers with proper typing
 */
export interface CommonRequestHeaders {
  Accept?: AxiosHeaderValue;
  'Accept-Encoding'?: AxiosHeaderValue;
  'Accept-Language'?: AxiosHeaderValue;
  Authorization?: AxiosHeaderValue;
  'Cache-Control'?: AxiosHeaderValue;
  'Content-Encoding'?: AxiosHeaderValue;
  'Content-Length'?: AxiosHeaderValue;
  'Content-Type'?: AxiosHeaderValue;
  Cookie?: AxiosHeaderValue;
  Host?: AxiosHeaderValue;
  Origin?: AxiosHeaderValue;
  Referer?: AxiosHeaderValue;
  'User-Agent'?: AxiosHeaderValue;
  'X-Requested-With'?: AxiosHeaderValue;
}

/**
 * Common HTTP response headers
 */
export interface CommonResponseHeaders {
  'Cache-Control'?: AxiosHeaderValue;
  'Content-Encoding'?: AxiosHeaderValue;
  'Content-Length'?: AxiosHeaderValue;
  'Content-Type'?: AxiosHeaderValue;
  Date?: AxiosHeaderValue;
  Etag?: AxiosHeaderValue;
  Expires?: AxiosHeaderValue;
  'Last-Modified'?: AxiosHeaderValue;
  Location?: AxiosHeaderValue;
  Server?: AxiosHeaderValue;
  'Set-Cookie'?: AxiosHeaderValue;
  Vary?: AxiosHeaderValue;
}

/**
 * Raw axios headers interface - allows any string key with AxiosHeaderValue
 */
export interface RawAxiosHeaders {
  [key: string]: AxiosHeaderValue;
}

/**
 * Method-specific headers
 */
export interface MethodHeaders {
  common?: RawAxiosHeaders;
  delete?: RawAxiosHeaders;
  get?: RawAxiosHeaders;
  head?: RawAxiosHeaders;
  post?: RawAxiosHeaders;
  put?: RawAxiosHeaders;
  patch?: RawAxiosHeaders;
  options?: RawAxiosHeaders;
  trace?: RawAxiosHeaders;
  connect?: RawAxiosHeaders;
}

/**
 * Combined axios request headers type
 * Supports common headers with proper typing and any custom headers
 */
export type AxiosRequestHeaders = Partial<
  RawAxiosHeaders & CommonRequestHeaders
>;

/**
 * AxiosHeaders class for advanced header manipulation
 * Provides methods similar to the Headers API but with axios compatibility
 * Supports bracket notation for header access/assignment
 */
export class AxiosHeaders {
  // Matches axios' own `AxiosHeaders` type declaration: lets bracket
  // notation (`config.headers['Authorization'] = ...`) type-check under
  // `strict`, on top of the Proxy that already supports it at runtime.
  [key: string]: any;

  private headers: Map<string, AxiosHeaderValue>;

  constructor(headers?: RawAxiosHeaders | AxiosHeaders) {
    this.headers = new Map();

    if (headers) {
      if (headers instanceof AxiosHeaders) {
        headers.forEach((value, key) => {
          this.set(key, value);
        });
      } else {
        Object.entries(headers).forEach(([key, value]) => {
          this.set(key, value);
        });
      }
    }

    // Return a Proxy to support bracket notation
    return new Proxy(this, {
      get(target, prop: string | symbol) {
        // If it's a method or property of AxiosHeaders, return it
        if (prop in target) {
          const value = (target as any)[prop];
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }

        // Otherwise, treat it as a header key
        if (typeof prop === 'string') {
          return target.get(prop);
        }

        return undefined;
      },

      set(target, prop: string | symbol, value: AxiosHeaderValue) {
        // Don't allow setting methods or internal properties
        if (prop in target) {
          return false;
        }

        // Set as header
        if (typeof prop === 'string') {
          target.set(prop, value);
          return true;
        }

        return false;
      },

      has(target, prop: string | symbol) {
        // Check if it's a property/method first
        if (prop in target) {
          return true;
        }

        // Otherwise check headers
        if (typeof prop === 'string') {
          return target.has(prop);
        }

        return false;
      },

      deleteProperty(target, prop: string | symbol) {
        // Don't allow deleting methods or internal properties
        if (prop in target) {
          return false;
        }

        // Delete header
        if (typeof prop === 'string') {
          return target.delete(prop);
        }

        return false;
      },

      ownKeys(target) {
        // Header keys, plus the class' method names (non-enumerable, so
        // `Object.keys()`/`for...in`/spread only ever see the header keys).
        // Deliberately excludes the instance's own property names (just the
        // internal `headers` Map) - otherwise `{...axiosHeaders}` leaks it
        // as an enumerable `headers` "header" (undici then rejects it: a Map
        // isn't a valid header value).
        const classKeys = Object.getOwnPropertyNames(
          Object.getPrototypeOf(target),
        );
        const headerKeys = Array.from(target.headers.keys());
        return [...new Set([...classKeys, ...headerKeys])];
      },

      getOwnPropertyDescriptor(target, prop: string | symbol) {
        // For class properties/methods
        if (prop in target) {
          return (
            Object.getOwnPropertyDescriptor(target, prop) ||
            Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), prop)
          );
        }

        // For headers
        if (typeof prop === 'string' && target.has(prop)) {
          return {
            configurable: true,
            enumerable: true,
            value: target.get(prop),
          };
        }

        return undefined;
      },
    });
  }

  /**
   * Set a header value
   */
  set(key: string, value: AxiosHeaderValue): this {
    if (value !== undefined) {
      this.headers.set(key.toLowerCase(), value);
    }
    return this;
  }

  /**
   * Get a header value
   */
  get(key: string): AxiosHeaderValue {
    return this.headers.get(key.toLowerCase());
  }

  /**
   * Check if header exists
   */
  has(key: string): boolean {
    return this.headers.has(key.toLowerCase());
  }

  /**
   * Delete a header
   */
  delete(key: string): boolean {
    return this.headers.delete(key.toLowerCase());
  }

  /**
   * Clear all headers
   */
  clear(): void {
    this.headers.clear();
  }

  /**
   * Sets (or removes, with `false`) the `Authorization` header. Matches
   * axios' `AxiosHeaders#setAuthorization`.
   */
  setAuthorization(value: AxiosHeaderValue | false): this {
    if (value === false) {
      this.delete('Authorization');
    } else {
      this.set('Authorization', value);
    }
    return this;
  }

  /** Reads the `Authorization` header. Matches axios' `AxiosHeaders#getAuthorization`. */
  getAuthorization(): AxiosHeaderValue {
    return this.get('Authorization');
  }

  /** Matches axios' `AxiosHeaders#hasAuthorization`. */
  hasAuthorization(): boolean {
    return this.has('Authorization');
  }

  /**
   * Sets (or removes, with `false`) the `Content-Type` header. Matches
   * axios' `AxiosHeaders#setContentType`.
   */
  setContentType(value: AxiosHeaderValue | false): this {
    if (value === false) {
      this.delete('Content-Type');
    } else {
      this.set('Content-Type', value);
    }
    return this;
  }

  /**
   * Reads the `Content-Type` header. Matches axios' `AxiosHeaders#getContentType`.
   */
  getContentType(): AxiosHeaderValue {
    return this.get('Content-Type');
  }

  /** Matches axios' `AxiosHeaders#hasContentType`. */
  hasContentType(): boolean {
    return this.has('Content-Type');
  }

  /** Matches axios' `AxiosHeaders#setContentLength`. */
  setContentLength(value: AxiosHeaderValue | false): this {
    if (value === false) {
      this.delete('Content-Length');
    } else {
      this.set('Content-Length', value);
    }
    return this;
  }

  /** Matches axios' `AxiosHeaders#getContentLength`. */
  getContentLength(): AxiosHeaderValue {
    return this.get('Content-Length');
  }

  /** Matches axios' `AxiosHeaders#hasContentLength`. */
  hasContentLength(): boolean {
    return this.has('Content-Length');
  }

  /** Matches axios' `AxiosHeaders#setAccept`. */
  setAccept(value: AxiosHeaderValue | false): this {
    if (value === false) {
      this.delete('Accept');
    } else {
      this.set('Accept', value);
    }
    return this;
  }

  /** Matches axios' `AxiosHeaders#getAccept`. */
  getAccept(): AxiosHeaderValue {
    return this.get('Accept');
  }

  /** Matches axios' `AxiosHeaders#hasAccept`. */
  hasAccept(): boolean {
    return this.has('Accept');
  }

  /** Matches axios' `AxiosHeaders#setAcceptEncoding` (axios' own runtime accessor list, though not its `.d.ts`). */
  setAcceptEncoding(value: AxiosHeaderValue | false): this {
    if (value === false) {
      this.delete('Accept-Encoding');
    } else {
      this.set('Accept-Encoding', value);
    }
    return this;
  }

  /** Matches axios' `AxiosHeaders#getAcceptEncoding`. */
  getAcceptEncoding(): AxiosHeaderValue {
    return this.get('Accept-Encoding');
  }

  /** Matches axios' `AxiosHeaders#hasAcceptEncoding`. */
  hasAcceptEncoding(): boolean {
    return this.has('Accept-Encoding');
  }

  /** Matches axios' `AxiosHeaders#setContentEncoding` (in its `.d.ts`, though its own runtime accessor list uses `Accept-Encoding` instead - both are provided here). */
  setContentEncoding(value: AxiosHeaderValue | false): this {
    if (value === false) {
      this.delete('Content-Encoding');
    } else {
      this.set('Content-Encoding', value);
    }
    return this;
  }

  /** Matches axios' `AxiosHeaders#getContentEncoding`. */
  getContentEncoding(): AxiosHeaderValue {
    return this.get('Content-Encoding');
  }

  /** Matches axios' `AxiosHeaders#hasContentEncoding`. */
  hasContentEncoding(): boolean {
    return this.has('Content-Encoding');
  }

  /** Matches axios' `AxiosHeaders#setUserAgent`. */
  setUserAgent(value: AxiosHeaderValue | false): this {
    if (value === false) {
      this.delete('User-Agent');
    } else {
      this.set('User-Agent', value);
    }
    return this;
  }

  /** Matches axios' `AxiosHeaders#getUserAgent`. */
  getUserAgent(): AxiosHeaderValue {
    return this.get('User-Agent');
  }

  /** Matches axios' `AxiosHeaders#hasUserAgent`. */
  hasUserAgent(): boolean {
    return this.has('User-Agent');
  }

  /**
   * Merge other header sources onto a *new* `AxiosHeaders` seeded from this
   * one. Matches axios' `AxiosHeaders#concat` (`this.constructor.concat(this, ...targets)`).
   */
  concat(
    ...sources: Array<AxiosHeaders | RawAxiosHeaders | undefined>
  ): AxiosHeaders {
    return AxiosHeaders.concat(this, ...sources);
  }

  /**
   * Accepted for API parity, but a no-op. Axios merges case-duplicate names
   * in place and, with `format: true`, title-cases them (`Content-Type`).
   * This class stores every name lower-cased and doesn't keep the original
   * casing, so duplicates are already merged and there is no casing to
   * restore: `normalize(true).toJSON()` still returns lower-case names.
   * Header casing doesn't matter on the wire; preserving it like axios is
   * tracked in plan.md ("feat(axiosRef): make it a real axios instance").
   */
  normalize(_format?: boolean): this {
    return this;
  }

  /** Matches axios' `AxiosHeaders#getSetCookie`: always an array, even for one cookie. */
  getSetCookie(): string[] {
    const value = this.get('set-cookie');
    if (value == null || value === false) return [];
    return Array.isArray(value) ? value.map(String) : [String(value)];
  }

  /** `"key: value"` per header, newline-separated, like axios' `AxiosHeaders#toString`. */
  toString(): string {
    return Array.from(this.headers.entries())
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
  }

  /**
   * Iterate over headers
   */
  forEach(
    callback: (
      value: AxiosHeaderValue,
      key: string,
      headers: AxiosHeaders,
    ) => void,
  ): void {
    this.headers.forEach((value, key) => {
      callback(value, key, this);
    });
  }

  /**
   * Get all headers as a plain object
   */
  toJSON(): RawAxiosHeaders {
    const result: RawAxiosHeaders = {};
    this.headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Create AxiosHeaders from various input types
   * @param thing - Input to convert to AxiosHeaders
   * @returns AxiosHeaders instance with proxy support
   */
  static from(thing?: AxiosHeaders | RawAxiosHeaders | string): AxiosHeaders {
    if (thing instanceof AxiosHeaders) {
      return thing;
    }

    const headers = new AxiosHeaders();

    if (typeof thing === 'string') {
      // Parse raw headers string (e.g., from HTTP response)
      thing.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length) {
          headers.set(key.trim(), valueParts.join(':').trim());
        }
      });
    } else if (thing && typeof thing === 'object') {
      Object.entries(thing).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    return headers;
  }

  /**
   * Concatenate headers
   * @param sources - Headers to concatenate
   * @returns New AxiosHeaders instance with all headers
   */
  static concat(
    ...sources: Array<AxiosHeaders | RawAxiosHeaders | undefined>
  ): AxiosHeaders {
    const result = new AxiosHeaders();

    sources.forEach(source => {
      if (source) {
        const headers = AxiosHeaders.from(source);
        headers.forEach((value, key) => {
          result.set(key, value);
        });
      }
    });

    return result;
  }

  /**
   * Normalize header name
   */
  static normalizeHeader(header: string): string {
    return header.toLowerCase();
  }

  /**
   * Iterator support
   */
  [Symbol.iterator](): Iterator<[string, AxiosHeaderValue]> {
    return this.headers.entries();
  }

  /**
   * Support for Object.entries()
   */
  entries(): IterableIterator<[string, AxiosHeaderValue]> {
    return this.headers.entries();
  }

  /**
   * Get all header keys
   */
  keys(): IterableIterator<string> {
    return this.headers.keys();
  }

  /**
   * Get all header values
   */
  values(): IterableIterator<AxiosHeaderValue> {
    return this.headers.values();
  }
}
