import type { HttpModuleOptions } from '../types';
import type { Agent } from 'http';
import type { Agent as HttpsAgent } from 'https';
import type { HttpInterceptorFunction } from '../interfaces';
import { createSizeLimitInterceptor } from '../interceptors/size-limit.interceptor';

/**
 * TLS/connection options this library reads off a Node.js `https.Agent`
 * (from `agent.options`, where `new https.Agent(opts)` stores them) and maps
 * onto undici's `Agent({ connect: {...} })`. This is exactly the subset
 * axios' own http adapter benefits from: axios never reads these fields off
 * `config` directly, only through the `Agent` instance it hands to Node's
 * `http`/`https` module, which applies them during the TLS handshake.
 */
export const TLS_AGENT_OPTION_KEYS = [
  'ca',
  'cert',
  'key',
  'pfx',
  'passphrase',
  'rejectUnauthorized',
  'servername',
  'ciphers',
  'minVersion',
  'maxVersion',
] as const;

/** Resolved, ready-to-use pieces for the undici `Agent` this module creates. */
export interface ResolvedAgentOptions {
  /** `new Agent({ connect: {...} })`'s TLS options, from `httpsAgent.options`. */
  tls?: Record<string, unknown>;
  /** `maxSockets` -> undici `connections`. */
  connections?: number;
  /** `keepAlive` -> undici `pipelining` (0 or 1). */
  pipelining?: 0 | 1;
  /** Agent-level `timeout`, used only when no axios `timeout` was set. */
  agentTimeout?: number;
  /** `httpVersion: 2` -> `Agent({ allowH2: true })`. */
  allowH2?: boolean;
}

/**
 * Axios configuration options that need to be mapped
 */
export interface AxiosConfigOptions {
  timeout?: number;
  maxRedirects?: number;
  /** Same as axios: called before each redirect hop. */
  beforeRedirect?: (
    options: Record<string, any>,
    responseDetails: { headers: Record<string, any>; statusCode: number },
    requestDetails: {
      url: string;
      method: string;
      headers: Record<string, any>;
    },
  ) => void;
  maxBodyLength?: number;
  maxContentLength?: number;
  httpAgent?: Agent;
  httpsAgent?: HttpsAgent;
  proxy?:
    | {
        protocol?: string;
        host: string;
        port: number;
        auth?: {
          username: string;
          password: string;
        };
      }
    | false;
  decompress?: boolean;
  validateStatus?: (status: number) => boolean;
  baseURL?: string;
  transformRequest?: Array<(data: any, headers?: any) => any>;
  transformResponse?: Array<(data: any) => any>;
  paramsSerializer?: (params: any) => string;
  socketPath?: string;
  responseType?: 'json' | 'text' | 'stream' | 'arraybuffer' | 'blob';
  responseEncoding?: string;
  xsrfCookieName?: string;
  xsrfHeaderName?: string;
  withCredentials?: boolean;
  auth?: {
    username: string;
    password: string;
  };
  /** axios 1.x: `1` (default) or `2`. Mapped to `Agent({ allowH2: true })`; undici negotiates ALPN itself. */
  httpVersion?: number | string;
  /** Accepted for axios compatibility; undici has no per-call HTTP/2 session tuning, so this is unused. */
  http2Options?: Record<string, unknown>;
}

/**
 * Extracts the undici `Agent` options this library can honour from a
 * Node.js `http.Agent`/`https.Agent` instance (module-level `httpAgent`/
 * `httpsAgent`) plus axios' `httpVersion`. Setup-time only - never called
 * per request.
 */
export function resolveAgentOptions(
  axiosConfig: Pick<
    AxiosConfigOptions,
    'httpAgent' | 'httpsAgent' | 'timeout' | 'httpVersion'
  >,
): ResolvedAgentOptions | undefined {
  const resolved: ResolvedAgentOptions = {};

  // `httpsAgent` is the one axios actually performs the TLS handshake
  // through, so it's the only source for TLS options; `httpAgent` (plain
  // HTTP) only ever carries keep-alive/socket-count/timeout.
  const source = axiosConfig.httpsAgent || axiosConfig.httpAgent;
  if (source && typeof source === 'object') {
    const agentOptions = (
      source as unknown as { options?: Record<string, any> }
    ).options;
    if (agentOptions && typeof agentOptions === 'object') {
      if (axiosConfig.httpsAgent) {
        const tls: Record<string, unknown> = {};
        for (const key of TLS_AGENT_OPTION_KEYS) {
          if (agentOptions[key] !== undefined) tls[key] = agentOptions[key];
        }
        if (Object.keys(tls).length > 0) resolved.tls = tls;
      }
      if ('keepAlive' in agentOptions) {
        resolved.pipelining = agentOptions.keepAlive ? 1 : 0;
      }
      if (typeof agentOptions.maxSockets === 'number') {
        resolved.connections = agentOptions.maxSockets;
      }
      if ('timeout' in agentOptions && axiosConfig.timeout === undefined) {
        resolved.agentTimeout = agentOptions.timeout;
      }
    }
  }

  const httpVersion = axiosConfig.httpVersion;
  if (httpVersion === 2 || httpVersion === '2') {
    resolved.allowH2 = true;
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

/**
 * Maps axios configuration to undici configuration
 */
export function mapAxiosConfigToUndici(
  axiosConfig: AxiosConfigOptions,
): HttpModuleOptions {
  const undiciConfig: HttpModuleOptions = {};
  const interceptors: HttpInterceptorFunction[] = [];

  // Direct mappings
  if (axiosConfig.timeout !== undefined) {
    undiciConfig.headersTimeout = axiosConfig.timeout;
    undiciConfig.bodyTimeout = axiosConfig.timeout;
  }

  if (axiosConfig.maxRedirects !== undefined) {
    undiciConfig.maxRedirections = axiosConfig.maxRedirects;
  }

  // Handle size limits with interceptor
  if (
    axiosConfig.maxBodyLength !== undefined ||
    axiosConfig.maxContentLength !== undefined
  ) {
    // Create size limit interceptor
    interceptors.push(
      createSizeLimitInterceptor({
        maxBodyLength: axiosConfig.maxBodyLength,
        maxContentLength: axiosConfig.maxContentLength,
      }),
    );

    // Also store in options for the response adapter
    (undiciConfig as any).maxBodyLength = axiosConfig.maxBodyLength;
    (undiciConfig as any).maxContentLength = axiosConfig.maxContentLength;
  }

  // Handle httpAgent/httpsAgent (TLS + keep-alive + maxSockets) and
  // httpVersion - resolved once here (setup time) into the exact undici
  // `Agent` options `setupDispatcher` (http.service.ts) needs; never
  // recomputed per request.
  const agentOptions = resolveAgentOptions(axiosConfig);
  if (agentOptions) {
    (undiciConfig as any).__agentOptions = agentOptions;
    if (agentOptions.pipelining !== undefined) {
      undiciConfig.pipelining = agentOptions.pipelining;
    }
    if (agentOptions.agentTimeout !== undefined) {
      undiciConfig.headersTimeout = agentOptions.agentTimeout;
      undiciConfig.bodyTimeout = agentOptions.agentTimeout;
    }
  }

  // Handle proxy configuration (an explicit `proxy: {...}`; `proxy: false`
  // disables even the HTTP_PROXY/HTTPS_PROXY env vars - see
  // `HttpService.setupDispatcher`). Undici's `ProxyAgent` is created lazily
  // there too, so only the resolved `{ uri, token }` is stored here.
  if (axiosConfig.proxy) {
    const protocol = axiosConfig.proxy.protocol || 'http:';
    const proxyUrl = `${protocol}//${axiosConfig.proxy.host}:${axiosConfig.proxy.port}`;

    const proxyOptions: any = {
      uri: proxyUrl,
    };

    // Add authentication if provided
    if (axiosConfig.proxy.auth) {
      const proxyAuth = Buffer.from(
        `${axiosConfig.proxy.auth.username}:${axiosConfig.proxy.auth.password}`,
      ).toString('base64');
      proxyOptions.token = `Basic ${proxyAuth}`;
    }

    // Store proxy configuration for later dispatcher creation
    (undiciConfig as any).__proxyAgent = proxyOptions;
  }

  // Handle withCredentials - cookie support
  if (axiosConfig.withCredentials) {
    // Store flag for later cookie agent creation
    (undiciConfig as any).__withCredentials = true;
  }

  // Decompress: applied as a default per-request option (the response
  // adapter reads it the same way it reads a per-call `decompress`).
  if (axiosConfig.decompress !== undefined) {
    (undiciConfig as any).decompress = axiosConfig.decompress;
  }

  // Validate status - this is handled at the interceptor level
  if (axiosConfig.validateStatus) {
    undiciConfig.validateStatus = axiosConfig.validateStatus;
  }

  // `socketPath` needs no mapping here: it's read directly off the raw
  // module/request options at dispatch time (`HttpService.getSocketPathDispatcher`),
  // module-level and per-request, and cached per path - see http.service.ts.

  // Auth
  if (axiosConfig.auth) {
    // Convert to basic auth header
    const basicAuth = Buffer.from(
      `${axiosConfig.auth.username}:${axiosConfig.auth.password}`,
    ).toString('base64');
    undiciConfig.headers = {
      ...undiciConfig.headers,
      Authorization: `Basic ${basicAuth}`,
    };
  }

  // `baseURL`, `transformRequest`/`transformResponse`, `paramsSerializer`,
  // `responseType` and `responseEncoding` need no mapping: they pass through
  // unchanged (module.ts spreads the original `config` over this function's
  // result) and are read directly off `moduleOptions`/`instanceOptions` by
  // `normalizeAxiosRequest`/the axios pipeline. There used to be a dead
  // `__axiosCompat.baseURL` branch here that duplicated (and, for a
  // `UrlObject` URL, broke) that handling - removed.

  // Add interceptors if any were created
  if (interceptors.length > 0) {
    undiciConfig.interceptors = interceptors;
  }

  return undiciConfig;
}

/**
 * Creates a warning message for unsupported axios features
 */
export function getAxiosCompatibilityWarnings(
  axiosConfig: AxiosConfigOptions,
): string[] {
  const warnings: string[] = [];

  // These are now supported but with different implementation
  // Keeping warnings for features that still need manual handling

  if (axiosConfig.xsrfCookieName || axiosConfig.xsrfHeaderName) {
    warnings.push(
      'XSRF protection: Must be implemented manually with interceptors',
    );
  }

  return warnings;
}
