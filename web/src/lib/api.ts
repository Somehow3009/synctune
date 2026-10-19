import { API_URL } from "./config";
import type { ResolvedStream, SearchResult } from "./types";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { signal });
  } catch {
    throw new ApiError(
      `Không kết nối được backend tại ${API_URL}. Hãy chạy API (uvicorn main:app) và kiểm tra NEXT_PUBLIC_API_URL.`
    );
  }
  if (!res.ok) {
    let detail = `Lỗi ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

export async function searchYouTube(query: string, limit = 20, signal?: AbortSignal): Promise<SearchResult[]> {
  const data = await request<{ results: SearchResult[] }>(
    `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    signal
  );
  return data.results || [];
}

export async function resolveStream(url: string, signal?: AbortSignal): Promise<ResolvedStream> {
  return request<ResolvedStream>(`/api/resolve?url=${encodeURIComponent(url)}`, signal);
}

export interface YouTubeMeta {
  id: string;
  title: string;
  uploader?: string | null;
  thumbnail?: string | null;
}

export async function fetchYouTubeMeta(videoId: string): Promise<YouTubeMeta> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`
    );
    if (!res.ok) throw new Error("oembed failed");
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      id: videoId,
      title: data.title || "YouTube video",
      uploader: data.author_name ?? null,
      thumbnail: data.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return {
      id: videoId,
      title: "YouTube video",
      uploader: null,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
