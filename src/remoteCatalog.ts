import type { AppStore, PoolInfoEntry } from "./types";
import { mergeDynamicI18nCatalog, type LocalizedNames } from "./itemI18n";

export const REMOTE_CATALOG_URL =
  "https://raw.githubusercontent.com/ribeye0/eggroll-endfield/main/data/eggroll-i18n.json";

export interface RemoteCatalogPayload {
  updatedAt?: string;
  poolInfo?: Record<string, PoolInfoEntry>;
  items?: Record<string, LocalizedNames>;
  pools?: Record<string, LocalizedNames>;
}

/** Apply locally cached remote catalog entries immediately on startup. */
export function applyCachedCatalog(store: AppStore): void {
  if (store.remoteCatalog) {
    mergeDynamicI18nCatalog(store.remoteCatalog.items, store.remoteCatalog.pools);
  }
}

/**
 * Fetch the latest static catalog JSON from GitHub Raw CDN with a short timeout.
 * Fails silently offline and preserves local cache when unreachable.
 */
export async function refreshRemoteCatalog(store: AppStore): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(REMOTE_CATALOG_URL, {
      signal: controller.signal,
      cache: "no-cache",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as RemoteCatalogPayload;
    if (!data || typeof data !== "object") return false;

    let changed = false;
    if (data.poolInfo && typeof data.poolInfo === "object") {
      store.poolInfo = { ...store.poolInfo, ...data.poolInfo };
      changed = true;
    }
    if (data.items || data.pools) {
      store.remoteCatalog = {
        updatedAt: data.updatedAt || new Date().toISOString(),
        items: { ...(store.remoteCatalog?.items || {}), ...(data.items || {}) },
        pools: { ...(store.remoteCatalog?.pools || {}), ...(data.pools || {}) },
      };
      mergeDynamicI18nCatalog(store.remoteCatalog.items, store.remoteCatalog.pools);
      changed = true;
    }
    return changed;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
