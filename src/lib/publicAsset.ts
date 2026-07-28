const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu;

function normalizeBasePath(basePath: string): string {
  if (ABSOLUTE_URL_PATTERN.test(basePath)) {
    return basePath.endsWith("/") ? basePath : `${basePath}/`;
  }

  const withLeadingSlash = basePath.startsWith("/")
    ? basePath
    : `/${basePath}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

/**
 * Resolves an asset from `public/` against Vite's configured deployment base.
 *
 * Vite cannot rewrite URL strings loaded from JSON, so root-style paths such
 * as `/models/guide.vrm` need the repository prefix on a Pages project site.
 */
export function resolvePublicAssetPath(
  assetPath: string,
  basePath = import.meta.env.BASE_URL,
): string {
  if (ABSOLUTE_URL_PATTERN.test(assetPath)) {
    return assetPath;
  }

  const normalizedBase = normalizeBasePath(basePath);
  const assetWithoutPrefix = assetPath.replace(/^(?:\.\/|\/)+/u, "");

  if (ABSOLUTE_URL_PATTERN.test(normalizedBase)) {
    return new URL(assetWithoutPrefix, normalizedBase).href;
  }

  if (
    assetPath === normalizedBase.slice(0, -1) ||
    assetPath.startsWith(normalizedBase)
  ) {
    return assetPath;
  }

  return `${normalizedBase}${assetWithoutPrefix}`;
}
