import { uid } from "./utils";
import type { ResolvedStream, SearchResult, Track } from "./types";

export function trackFromSearch(r: SearchResult): Track {
  return {
    id: uid(),
    source: r.source,
    sourceId: r.id ?? null,
    url: r.url,
    title: r.title,
    uploader: r.uploader ?? null,
    thumbnail: r.thumbnail ?? null,
    duration: r.duration ?? null,
    addedAt: new Date().toISOString(),
  };
}

export function trackFromResolved(r: ResolvedStream): Track {
  return {
    id: uid(),
    source: r.source,
    sourceId: r.id ?? null,
    url: r.webpage_url,
    title: r.title,
    uploader: r.uploader ?? null,
    thumbnail: r.thumbnail ?? null,
    duration: r.duration ?? null,
    addedAt: new Date().toISOString(),
  };
}

export function trackFromUrl(url: string, partial?: Partial<Track>): Track {
  return {
    id: uid(),
    source: partial?.source ?? "other",
    sourceId: partial?.sourceId ?? null,
    url,
    title: partial?.title || url,
    uploader: partial?.uploader ?? null,
    thumbnail: partial?.thumbnail ?? null,
    duration: partial?.duration ?? null,
    addedAt: new Date().toISOString(),
  };
}
