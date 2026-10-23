import { GetRequest } from "~/utils/new-request";

/**
 * Whether The Office is switched on for an organisation.
 *
 * The switch is an organisation setting, not a deployment: the backend reads
 * it on every office request, so turning it off takes effect on the next page
 * load and needs no rebuild. The rail icon and the route both ask this module
 * so they can never disagree.
 */
export type OfficeStatus = {
  enabled: boolean;
};

type CacheEntry = {
  value?: OfficeStatus;
  pending?: Promise<OfficeStatus>;
  at?: number;
};

// How long an answer is trusted. The setting can be changed by an
// administrator in another browser, so it is not kept forever.
const cacheTtl = 60_000;

const cache = new Map<string, CacheEntry>();
const listeners = new Set<() => void>();

function parseStatus(response: any): OfficeStatus | null {
  const httpStatus = response?.status ?? response?.response?.status;

  // 403 office_disabled (or a caller outside the organisation) is an answer,
  // not an outage.
  if (httpStatus === 403) return { enabled: false };
  if (httpStatus !== 200) return null;

  const body = response?.data;
  const data = body?.data ?? body;

  return typeof data?.enabled === "boolean" ? { enabled: data.enabled } : null;
}

/**
 * Resolves the office setting for an organisation, at most once per session.
 *
 * A status endpoint that cannot answer (404 while the backend rolls out, a
 * network blip) leaves the office available: only an explicit "off" hides it.
 * Otherwise a backend hiccup would look like the feature was taken away.
 */
export async function getOfficeStatus(
  orgKey: string,
  force = false
): Promise<OfficeStatus> {
  if (!orgKey) return { enabled: false };

  const cached = cache.get(orgKey);
  if (!force && cached?.value && Date.now() - (cached.at ?? 0) < cacheTtl) {
    return cached.value;
  }
  if (!force && cached?.pending) return cached.pending;

  const pending = GetRequest("/office/status")
    .then((response: any) => parseStatus(response) ?? { enabled: true })
    .catch(() => ({ enabled: true }));

  cache.set(orgKey, { pending });

  const value = await pending;
  cache.set(orgKey, { value, at: Date.now() });

  return value;
}

/**
 * Forget the cached answer, e.g. after an administrator changes the setting.
 * Everyone listening is told, so the rail item follows the change at once.
 */
export function clearOfficeStatusCache(): void {
  cache.clear();
  for (const listener of listeners) {
    listener();
  }
}

/** Listen for the setting changing, e.g. after it was saved in the settings. */
export function subscribeToOfficeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
