import { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../logger';
import { InscriptionIdRegEx } from '../types';

export enum ETagType {
  chainTip,
  inscription,
}

/**
 * A `Cache-Control` header used for re-validation based caching.
 * * `public` == allow proxies/CDNs to cache as opposed to only local browsers.
 * * `no-cache` == clients can cache a resource but should revalidate each time before using it.
 * * `must-revalidate` == somewhat redundant directive to assert that cache must be revalidated, required by some CDNs
 */
const CACHE_CONTROL_MUST_REVALIDATE = 'public, no-cache, must-revalidate';

export async function handleInscriptionCache(request: FastifyRequest, reply: FastifyReply) {
  return handleCache(ETagType.inscription, request, reply);
}

export async function handleChainTipCache(request: FastifyRequest, reply: FastifyReply) {
  return handleCache(ETagType.chainTip, request, reply);
}

async function handleCache(type: ETagType, request: FastifyRequest, reply: FastifyReply) {
  const ifNoneMatch = parseIfNoneMatchHeader(request.headers['if-none-match']);
  let etag: string | undefined;
  switch (type) {
    case ETagType.inscription:
      etag = await getInscriptionLocationEtag(request);
      break;
    case ETagType.chainTip:
      etag = await getChainTipEtag(request);
      break;
  }
  if (etag) {
    if (ifNoneMatch && ifNoneMatch.includes(etag)) {
      await reply.header('Cache-Control', CACHE_CONTROL_MUST_REVALIDATE).code(304).send();
    } else {
      void reply.headers({ 'Cache-Control': CACHE_CONTROL_MUST_REVALIDATE, ETag: `"${etag}"` });
    }
  }
}

export function setReplyNonCacheable(reply: FastifyReply) {
  reply.removeHeader('Cache-Control');
  reply.removeHeader('Etag');
}

/**
 * Retrieve the inscriptions's location timestamp as a UNIX epoch so we can use it as the response
 * ETag.
 * @param request - Fastify request
 * @returns Etag string
 */
async function getInscriptionLocationEtag(request: FastifyRequest): Promise<string | undefined> {
  try {
    const components = request.url.split('/');
    let inscription_id: string | undefined;
    do {
      const lastElement = components.pop();
      if (lastElement && lastElement.length) {
        if (InscriptionIdRegEx.test(lastElement)) {
          inscription_id = lastElement;
          break;
        }
      }
    } while (components.length);
    if (!inscription_id) return;
    return await request.server.db.getInscriptionETag({ inscription_id });
  } catch (error) {
    return;
  }
}

/**
 * Get an ETag based on the last observed chain tip.
 * @param request - Fastify request
 * @returns ETag string
 */
async function getChainTipEtag(request: FastifyRequest): Promise<string | undefined> {
  try {
    const blockHeight = await request.server.db.getChainTipBlockHeight();
    if (blockHeight) {
      return blockHeight.toString();
    }
  } catch (error) {
    return;
  }
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
    logger.warn(`Normalized If-None-Match header is falsy: ${ifNoneMatchHeaderValue}`);
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
