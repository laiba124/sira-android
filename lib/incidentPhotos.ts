import { useEffect, useState } from "react";

import { supabase } from "./supabase";

// Incident photos live in a private bucket. Rows keep the URL that was saved
// at upload time; the app turns it into a short-lived signed URL to display it.
const BUCKET = "incident-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
// Re-sign a little before expiry so an image never loads with a dead link.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
// Cards on a list ask at almost the same moment; group them into one request.
const BATCH_DELAY_MS = 25;

export function storagePathFromIncidentPhoto(value: string) {
  const input = String(value ?? "").trim();
  if (!input) return null;

  const markers = [
    "/storage/v1/object/public/incident-photos/",
    "/storage/v1/object/sign/incident-photos/",
    "/storage/v1/object/authenticated/incident-photos/",
    "/storage/v1/render/image/public/incident-photos/",
    "/storage/v1/render/image/authenticated/incident-photos/",
  ];

  for (const marker of markers) {
    const markerIndex = input.indexOf(marker);
    if (markerIndex >= 0) {
      const encodedPath = input.slice(markerIndex + marker.length).split("?")[0];
      try {
        return decodeURIComponent(encodedPath);
      } catch {
        return encodedPath;
      }
    }
  }

  // Also support rows where the Storage path itself was saved.
  if (!/^https?:\/\//i.test(input)) {
    const path = input.startsWith("incident-photos/") ? input.slice("incident-photos/".length) : input;
    return path.replace(/^\/+/, "").split("?")[0] || null;
  }

  return null;
}

type Resolver = (url: string | null) => void;

const signedCache = new Map<string, { url: string; expiresAt: number }>();
let pending = new Map<string, Resolver[]>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

async function flushBatch() {
  const batch = pending;
  pending = new Map();
  batchTimer = null;

  const signed: Record<string, string> = {};
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls([...batch.keys()], SIGNED_URL_TTL_SECONDS);
    if (!error && data) {
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) signed[item.path] = item.signedUrl;
      }
    }
  } catch {
    // Treated as unavailable below; the screen shows its image fallback.
  }

  const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000 - REFRESH_MARGIN_MS;
  for (const [path, resolvers] of batch) {
    const url = signed[path] ?? null;
    if (url) signedCache.set(path, { url, expiresAt });
    resolvers.forEach((resolve) => resolve(url));
  }
}

function signStoragePath(path: string): Promise<string | null> {
  const cached = signedCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url);

  return new Promise((resolve) => {
    const waiting = pending.get(path) ?? [];
    waiting.push(resolve);
    pending.set(path, waiting);
    if (!batchTimer) batchTimer = setTimeout(flushBatch, BATCH_DELAY_MS);
  });
}

// Returns a displayable URL, or null when the value is not a SIRA photo.
// Arbitrary external URLs are never loaded.
export function resolveIncidentPhotoUrl(value: string): Promise<string | null> {
  const path = storagePathFromIncidentPhoto(value);
  return path ? signStoragePath(path) : Promise.resolve(null);
}

// Stable expo-image cache key, so a re-signed URL reuses the cached file.
export function incidentPhotoCacheKey(value: string) {
  return storagePathFromIncidentPhoto(value) ?? undefined;
}

// One entry per input: undefined while loading, null if unavailable.
export function useIncidentPhotoUris(values: readonly string[]): (string | null | undefined)[] {
  const key = values.join("\n");
  const [state, setState] = useState<{ key: string; uris: (string | null)[] } | null>(null);

  useEffect(() => {
    let active = true;
    const list = key ? key.split("\n") : [];
    Promise.all(list.map(resolveIncidentPhotoUrl)).then((uris) => {
      if (active) setState({ key, uris });
    });
    return () => {
      active = false;
    };
  }, [key]);

  if (!state || state.key !== key) return values.map(() => undefined);
  return state.uris;
}
