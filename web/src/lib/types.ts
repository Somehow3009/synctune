export type Source = "youtube" | "tiktok" | "other";

export interface Track {
  id: string;
  source: Source;
  sourceId?: string | null;
  url: string;
  title: string;
  uploader?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  addedAt: string;
}

export interface Playlist {
  id: string;
  name: string;
  ownerId: string;
  items: Track[];
  createdAt: string;
  updatedAt: string;
}

export interface Share {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId?: string | null;
  kind: "track" | "playlist";
  payload: Track | Playlist;
  createdAt: string;
  read: boolean;
}

export interface Profile {
  id: string;
  name: string;
  email?: string | null;
}

export interface SearchResult {
  id: string;
  title: string;
  uploader?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  url: string;
  source: Source;
}

export interface StreamFormat {
  url: string;
  ext?: string | null;
  mime?: string | null;
  abr?: number | null;
  height?: number | null;
  filesize?: number | null;
}

export interface ResolvedStream {
  id: string;
  title: string;
  uploader?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  source: Source;
  webpage_url: string;
  audio?: StreamFormat | null;
  video?: StreamFormat | null;
  resolvedAt: string;
  expiresIn: number;
}

export type RepeatMode = "off" | "one" | "all";

export interface QueueSource {
  type: "playlist";
  id: string;
}

export interface ChatMessage {
  id: string;
  name: string;
  userId: string;
  text: string;
  at: number;
}

export interface PartyParticipant {
  peerId: string;
  userId: string;
  name: string;
  muted?: boolean;
  joinedAt: number;
}

export interface PartySync {
  url: string;
  title?: string | null;
  thumbnail?: string | null;
  position: number;
  playing: boolean;
  at: number;
  by: string;
}

export interface PartyQueueItem {
  id: string;
  url: string;
  title: string;
  thumbnail?: string | null;
  addedBy: string;
}
