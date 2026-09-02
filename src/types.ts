export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  profilePic: string; // Base64 image data URL or emoji string
  customBgImage?: string; // Optional Base64 background image data URL
  themeColor: string; // Accent color name ('sky', 'rose', 'emerald', 'amber', 'purple', 'teal')
  activeTheme?: 'sky' | 'liquid' | 'bubbles' | 'fire' | 'cyber' | 'emerald' | 'green' | 'yellow' | 'orange' | 'gold' | 'silver' | 'autumn' | 'fall'; // Visual background theme mode
  friendCode: string; // Unique 6-character code
  friends: string[]; // List of friend uids
  role?: 'master_admin' | 'uploader' | 'viewer'; // User role for media uploads & management
}

export interface WatchListItem {
  id: string;
  userId: string;
  title: string;
  itemType?: 'movie' | 'series'; // 'movie' or 'series'
  currentSeason?: number; // Season currently watching (e.g., 1, 2)
  currentEpisode?: number; // Episode currently on (e.g., 5)
  totalEpisodes?: number;
  imageUrl?: string; // Optional Base64 image
  isWatched: boolean;
  ratingType?: 'stars' | 'tomatoes'; // ⭐ Stars or 🍅 Tomatoes
  ratingValue?: number; // 1-5
  reviewComment?: string;
  addedAt: any; // Firestore Timestamp
}

export interface SharedList {
  id: string;
  title: string;
  createdById: string;
  createdByName: string;
  members: string[]; // UIDs of participating friends
  createdAt: any;
}

export interface SharedWatchListItem {
  id: string;
  listId: string;
  title: string;
  itemType?: 'movie' | 'series';
  currentSeason?: number;
  currentEpisode?: number;
  totalEpisodes?: number;
  addedByUid: string;
  addedByName: string;
  imageUrl?: string;
  isWatched: boolean;
  ratingType?: 'stars' | 'tomatoes';
  ratingValue?: number; // 1 to 5
  reviewComment?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  addedAt: any;
}

export interface Room {
  roomId: string;
  hostId: string;
  hostName: string;
  videoName: string;
  isPlaying: boolean;
  currentTime: number; // in seconds
  lastUpdatedAt: any; // Firestore Timestamp
  senderId: string; // UID of user who made the last state change
  currentEpisodeIndex?: number;
  currentEpisodeName?: string;
  totalEpisodesCount?: number;
  // Hybrid sync & Cloud Stream fields
  streamUrl?: string; // Direct cloud stream URL (Archive.org, R2, Drive, MP4, HLS)
  mediaType?: 'movie' | 'series' | 'anime' | 'custom';
  mediaId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  isLocalFile?: boolean;
}

export interface MediaEpisode {
  episodeNumber: number;
  title: string;
  streamUrl: string;
  downloadUrl?: string;
  duration?: number; // duration in minutes or seconds
  thumbnailUrl?: string;
}

export interface MediaSeason {
  seasonNumber: number;
  seasonTitle?: string;
  episodes: MediaEpisode[];
}

export interface MediaItem {
  id: string;
  type: 'movie' | 'series' | 'anime';
  title: string;
  description?: string;
  posterUrl?: string;
  backdropUrl?: string;
  trailerUrl?: string; // YouTube / MP4 trailer link
  genres: string[];
  releaseYear?: number;
  rating?: number; // 0 to 10 or 1 to 5
  status?: 'completed' | 'ongoing';
  
  // For Movies:
  streamUrl?: string;
  duration?: number; // in minutes

  // For Anime / Series:
  audioLang?: string; // e.g. "Japanese (Eng Sub)", "Dual Audio", "English"
  subtitles?: string[];
  seasons?: MediaSeason[];

  // Storage & Attribution:
  storageProvider?: 'archive_org' | 'google_drive' | 'cloudflare_r2' | 'direct_url';
  archiveItemId?: string;
  uploadedByUid: string;
  uploadedByName: string;
  createdAt: any;
  updatedAt?: any;
}

export interface MediaRequest {
  id: string;
  userUid: string;
  userName: string;
  userEmail: string;
  type: 'request_title' | 'request_uploader_role';
  category?: 'movie' | 'series' | 'anime';
  titleRequested?: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  resolvedAt?: any;
}

export interface RoomParticipant {
  uid: string;
  name: string;
  profilePic?: string;
  themeColor?: string;
  lastSeen: any; // Firestore Timestamp
}

export interface Reaction {
  id: string;
  roomId: string;
  emoji: string;
  senderId: string;
  senderName: string;
  timestamp: any; // Firestore Timestamp
}

export interface DirectMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPic?: string;
  recipientId: string;
  text: string;
  isInvite?: boolean;
  roomId?: string;
  roomVideoName?: string;
  isRead?: boolean;
  timestamp: any;
  reactions?: { [emoji: string]: string[] }; // Map of emoji string to array of user UIDs who reacted
  replyTo?: {
    id: string;
    text: string;
    senderName: string;
  };
}

export interface ChatThreadSettings {
  threadId: string; // [uid1, uid2].sort().join('_')
  customBgImage?: string; // Shared base64 background wallpaper
  theme?: string; // Shared background theme ('sky', 'cyber', 'fire', 'bubbles', 'liquid', 'emerald', etc.)
  updatedAt?: any;
  updatedBy?: string;
  updatedByName?: string;
  typing?: { [uid: string]: number }; // Map of uid to epoch millisecond timestamp
}

export interface RoomInvite {
  id: string;
  senderId: string;
  senderName: string;
  senderPic?: string;
  recipientId: string;
  roomId: string;
  videoName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: any;
}
