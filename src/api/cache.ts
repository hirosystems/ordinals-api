import { FastifyReply, FastifyRequest } from 'fastify';
import { ENV } from '../env';

/**
 * A `Cache-Control` header used for re-validation based caching.
 * * `public` == allow proxies/CDNs to cache as opposed to only local browsers.
 * * `no-cache` == clients can cache a resource but should revalidate each time before using it.
 * * `must-revalidate` == somewhat redundant directive to assert that cache must be revalidated, required by some CDNs
 */
const CACHE_CONTROL_MUST_REVALIDATE = 'public, no-cache, must-revalidate';

export async function handleChainTipCache(request: FastifyRequest, reply: FastifyReply) {
  const ifNoneMatch = parseIfNoneMatchHeader(request.headers['if-none-match']);
  const etag = await getNodeChainTipEtag();
  if (etag) {
    if (ifNoneMatch && ifNoneMatch.includes(etag)) {
      await reply.header('cache-control', CACHE_CONTROL_MUST_REVALIDATE).code(304).send();
    } else {
      await reply.header('etag', etag);
    }
  }
}

/**
 * Retrieve the chain tip from the node so we can build the etag.
 * @returns Etag string
 */
async function getNodeChainTipEtag(): Promise<string | undefined> {
  // const url = new URL(`/v2/info`, ENV.STACKS_API_ENDPOINT);
  // const result = await fetchJson({ url, init: { method: 'GET' } });
  // if (result.result === 'ok') {
  //   const response = result.response as any;
  //   return `${response.stacks_tip}:${response.unanchored_tip}`;
  // }
  return Promise.resolve('');
}

/**
 * Parses the etag values from a raw `If-None-Match` request header value.
 * The wrapping double quotes (if any) and validation prefix (if any) are stripped.
 * The parsing is permissive to account for commonly non-spec-compliant clients, proxies, CDNs, etc.
 * E.g. the value:
 * ```js
 * `"a", W/"b", c,d,   "e", "f"`
 * ```
 * Would be parsed and returned as:
 * ```js
 * ['a', 'b', 'c', 'd', 'e', 'f']
 * ```
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match#syntax
 * ```
 * If-None-Match: "etag_value"
 * If-None-Match: "etag_value", "etag_value", ...
 * If-None-Match: *
 * ```
 * @param ifNoneMatchHeaderValue - raw header value
 * @returns an array of etag values
 */
function parseIfNoneMatchHeader(ifNoneMatchHeaderValue: string | undefined): string[] | undefined {
  if (!ifNoneMatchHeaderValue) {
    return undefined;
  }
  // Strip wrapping double quotes like `"hello"` and the ETag validation-prefix like `W/"hello"`.
  // The API returns compliant, strong-validation ETags (double quoted ASCII), but can't control what
  // clients, proxies, CDNs, etc may provide.
  const normalized = /^(?:"|W\/")?(.*?)"?$/gi.exec(ifNoneMatchHeaderValue.trim())?.[1];
  if (!normalized) {
    // This should never happen unless handling a buggy request with something like `If-None-Match: ""`,
    // or if there's a flaw in the above code. Log warning for now.
    console.warn(`Normalized If-None-Match header is falsy: ${ifNoneMatchHeaderValue}`);
    return undefined;
  } else if (normalized.includes(',')) {
    // Multiple etag values provided, likely irrelevant extra values added by a proxy/CDN.
    // Split on comma, also stripping quotes, weak-validation prefixes, and extra whitespace.
    return normalized.split(/(?:W\/"|")?(?:\s*),(?:\s*)(?:W\/"|")?/gi);
  } else {
    // Single value provided (the typical case)
    return [normalized];
  }
}
