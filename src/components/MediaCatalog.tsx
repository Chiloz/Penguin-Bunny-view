import React, { useState, useEffect } from 'react';
import { 
  Film, 
  Tv, 
  Search, 
  Plus, 
  Folder, 
  Play, 
  ShieldCheck, 
  MessageSquare, 
  Calendar, 
  Star, 
  Clapperboard, 
  Clock,
  Filter,
  CheckCircle2,
  Download,
  UploadCloud,
  ChevronRight,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Edit
} from 'lucide-react';
import { MediaItem, MediaEpisode, UserProfile } from '../types';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { LiquidGlassCard } from './LiquidGlassCard';
import { SeriesFolderView } from './SeriesFolderView';
import { MediaUploadModal } from './MediaUploadModal';
import { MediaRequestModal } from './MediaRequestModal';
import { AdminRequestsDrawer } from './AdminRequestsDrawer';

interface MediaCatalogProps {
  currentUser: UserProfile;
  onStartRoom: (movieTitle: string, streamUrl?: string, mediaItem?: MediaItem, episode?: MediaEpisode, seasonNumber?: number) => void;
}

// Starter seed catalog items (using public Archive.org verified streaming videos)
const INITIAL_STARTER_ITEMS: Omit<MediaItem, 'id' | 'createdAt'>[] = [
  {
    type: 'anime',
    title: 'Sita Sings the Blues',
    description: 'An acclaimed animated musical fantasy film blending ancient myth and modern romance with vibrant animation.',
    posterUrl: 'https://archive.org/download/Sita_Sings_the_Blues/sita_poster.jpg',
    backdropUrl: 'https://archive.org/download/Sita_Sings_the_Blues/sita_poster.jpg',
    genres: ['Anime', 'Animation', 'Fantasy', 'Musical'],
    releaseYear: 2008,
    rating: 4.8,
    audioLang: 'English (Original)',
    status: 'completed',
    storageProvider: 'archive_org',
    uploadedByUid: 'system',
    uploadedByName: 'Master Admin',
    seasons: [
      {
        seasonNumber: 1,
        seasonTitle: 'Complete Series',
        episodes: [
          {
            episodeNumber: 1,
            title: 'Part 1: The Exiled Princess',
            streamUrl: 'https://archive.org/download/Sita_Sings_the_Blues/Sita_Sings_the_Blues_720p.mp4',
            downloadUrl: 'https://archive.org/download/Sita_Sings_the_Blues/Sita_Sings_the_Blues_720p.mp4',
            duration: 28
          },
          {
            episodeNumber: 2,
            title: 'Part 2: The Golden Deer',
            streamUrl: 'https://archive.org/download/Sita_Sings_the_Blues/Sita_Sings_the_Blues_720p.mp4',
            downloadUrl: 'https://archive.org/download/Sita_Sings_the_Blues/Sita_Sings_the_Blues_720p.mp4',
            duration: 26
          },
          {
            episodeNumber: 3,
            title: 'Part 3: The Reunion',
            streamUrl: 'https://archive.org/download/Sita_Sings_the_Blues/Sita_Sings_the_Blues_720p.mp4',
            downloadUrl: 'https://archive.org/download/Sita_Sings_the_Blues/Sita_Sings_the_Blues_720p.mp4',
            duration: 28
          }
        ]
      }
    ]
  },
  {
    type: 'movie',
    title: 'Night of the Living Dead',
    description: 'The legendary masterpiece classic that defined the genre, completely restored and available for direct streaming.',
    posterUrl: 'https://archive.org/download/night_of_the_living_dead_1968/notld.jpg',
    genres: ['Horror', 'Classic', 'Mystery'],
    releaseYear: 1968,
    rating: 4.6,
    duration: 96,
    streamUrl: 'https://archive.org/download/night_of_the_living_dead_1968/night_of_the_living_dead_1968.mp4',
    storageProvider: 'archive_org',
    uploadedByUid: 'system',
    uploadedByName: 'Master Admin'
  },
  {
    type: 'series',
    title: 'Cosmos: A Space Odyssey',
    description: 'An exhilarating journey through space and time exploring our universe and modern physics.',
    posterUrl: 'https://archive.org/download/cosmos-carl-sagan/cosmos.jpg',
    genres: ['Documentary', 'Science', 'Adventure'],
    releaseYear: 2014,
    rating: 4.9,
    status: 'completed',
    storageProvider: 'archive_org',
    uploadedByUid: 'system',
    uploadedByName: 'Master Admin',
    seasons: [
      {
        seasonNumber: 1,
        seasonTitle: 'Season 1: Exploration',
        episodes: [
          {
            episodeNumber: 1,
            title: 'Episode 1: The Shores of the Cosmic Ocean',
            streamUrl: 'https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4',
            downloadUrl: 'https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4',
            duration: 45
          },
          {
            episodeNumber: 2,
            title: 'Episode 2: One Voice in the Cosmic Fugue',
            streamUrl: 'https://archive.org/download/ElephantsDream/ed_hd.mp4',
            downloadUrl: 'https://archive.org/download/ElephantsDream/ed_hd.mp4',
            duration: 42
          }
        ]
      }
    ]
  }
];

export const MediaCatalog: React.FC<MediaCatalogProps> = ({
  currentUser,
  onStartRoom
}) => {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'movie' | 'series' | 'anime' | 'my_uploads'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected series for Folder View
  const [activeSeries, setActiveSeries] = useState<MediaItem | null>(null);

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);
  const [isAdminDrawerOpen, setIsAdminDrawerOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);

  // Deletion State
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteNotice, setDeleteNotice] = useState<string>('');

  // Check Master Admin
  const isMasterAdmin = currentUser.email.toLowerCase() === 'josaphatkychiloz@gmail.com' || currentUser.role === 'master_admin';
  const isUploader = isMasterAdmin || currentUser.role === 'uploader';

  const canManageItem = (item: MediaItem) => {
    return isMasterAdmin || isUploader || item.uploadedByUid === currentUser.uid;
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, 'media_items', itemToDelete.id));
      setDeleteNotice(`"${itemToDelete.title}" has been deleted from Penguin View.`);
      if (activeSeries?.id === itemToDelete.id) {
        setActiveSeries(null);
      }
      setItemToDelete(null);
      setTimeout(() => setDeleteNotice(''), 4500);
    } catch (err: any) {
      console.error("Failed to delete media item:", err);
      alert("Failed to delete media item: " + (err.message || 'Permission denied'));
    } finally {
      setIsDeleting(false);
    }
  };

  // Real-time Firestore subscription to media_items
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'media_items'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: MediaItem[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as MediaItem);
      });

      // If empty, auto-seed starter media items so the app is immediately alive
      if (items.length === 0 && snapshot.empty) {
        seedInitialItems();
      } else {
        setMediaItems(items);
        setLoading(false);
      }
    }, (err) => {
      console.error('Firestore media error:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const seedInitialItems = async () => {
    try {
      for (const starter of INITIAL_STARTER_ITEMS) {
        await addDoc(collection(db, 'media_items'), {
          ...starter,
          createdAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error('Seeding error:', e);
      setLoading(false);
    }
  };

  // Filter items based on category and search query
  const filteredItems = mediaItems.filter((item) => {
    if (selectedCategory === 'my_uploads') {
      const isMine = item.uploadedByUid === currentUser.uid || (isMasterAdmin && item.uploadedByUid === 'system');
      if (!isMine) return false;
    } else if (selectedCategory !== 'all' && item.type !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchGenre = item.genres?.some(g => g.toLowerCase().includes(q));
      const matchDesc = item.description?.toLowerCase().includes(q);
      return matchTitle || matchGenre || matchDesc;
    }
    return true;
  });

  // Count categories
  const moviesCount = mediaItems.filter(i => i.type === 'movie').length;
  const seriesCount = mediaItems.filter(i => i.type === 'series').length;
  const animeCount = mediaItems.filter(i => i.type === 'anime').length;
  const myUploadsCount = mediaItems.filter(i => i.uploadedByUid === currentUser.uid || (isMasterAdmin && i.uploadedByUid === 'system')).length;

  // Handle starting a movie watch party directly
  const handleStartMovieParty = (movie: MediaItem) => {
    onStartRoom(movie.title, movie.streamUrl, movie);
  };

  // Handle starting an episode watch party
  const handleStartEpisodeParty = (episode: MediaEpisode, series: MediaItem, seasonNumber: number) => {
    const roomTitle = `${series.title} - S${seasonNumber}E${episode.episodeNumber}: ${episode.title}`;
    onStartRoom(roomTitle, episode.streamUrl, series, episode, seasonNumber);
  };

  // If a series folder is opened, show SeriesFolderView
  if (activeSeries) {
    return (
      <SeriesFolderView
        series={activeSeries}
        currentUser={currentUser}
        isMasterAdmin={isMasterAdmin}
        isUploader={isUploader}
        onBack={() => setActiveSeries(null)}
        onStartWatchParty={handleStartEpisodeParty}
        onEditSeries={(item) => {
          setEditingItem(item);
          setIsUploadModalOpen(true);
        }}
        onDeleteSeries={(item) => setItemToDelete(item)}
        onRequestEpisodes={() => setIsRequestModalOpen(true)}
      />
    );
  }

  return (
    <div className="space-y-6 font-sans animate-in fade-in duration-200">
      
      {/* Deletion Toast / Notice */}
      {deleteNotice && (
        <div className="p-3.5 bg-red-950/80 border border-red-500/40 rounded-2xl text-red-200 text-xs flex items-center justify-between gap-3 shadow-lg backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-semibold text-white">{deleteNotice}</span>
          </div>
          <button
            onClick={() => setDeleteNotice('')}
            className="p-1 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-sky-950/40 via-indigo-950/40 to-[#0e1424]/60 p-5 sm:p-6 rounded-3xl border border-white/10 backdrop-blur-md shadow-xl">
        <div className="space-y-1 text-left">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-sky-500/20 text-sky-300 border border-sky-400/30 flex items-center gap-1.5">
              <Film className="w-3 h-3" />
              Internet Archive Cloud Streaming
            </span>
            {isMasterAdmin && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Master Admin
              </span>
            )}
            {!isMasterAdmin && isUploader && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Uploader
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-display">
            Movies, TV Series & Anime Hub
          </h2>
          <p className="text-xs text-slate-400 max-w-xl">
            Stream directly in exact millisecond sync with your friends, or choose the Data Saver mode to sync using your local downloaded copies.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {isMasterAdmin && (
            <button
              onClick={() => setIsAdminDrawerOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md"
            >
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Admin Requests</span>
            </button>
          )}

          {isUploader ? (
            <button
              onClick={() => {
                setEditingItem(null);
                setIsUploadModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-sky-500/25 flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Upload Studio</span>
            </button>
          ) : (
            <button
              onClick={() => setIsRequestModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <MessageSquare className="w-4 h-4 text-sky-400" />
              <span>Request Title or Rights</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Bar & Category Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'All Catalog', count: mediaItems.length },
            { id: 'movie', label: '🎬 Movies', count: moviesCount },
            { id: 'series', label: '📺 TV Series', count: seriesCount },
            { id: 'anime', label: '⛩️ Anime', count: animeCount },
            { id: 'my_uploads', label: '📤 My Uploads', count: myUploadsCount },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === cat.id
                  ? 'bg-sky-500/25 text-white border border-sky-400/40 shadow-md'
                  : 'bg-white/5 text-slate-400 hover:text-white border border-white/10 hover:bg-white/10'
              }`}
            >
              <span>{cat.label}</span>
              <span className="text-[10px] font-mono opacity-70">({cat.count})</span>
            </button>
          ))}

          {/* Archive.org External Collection Browser */}
          <a
            href="https://archive.org/search?query=penguin-view"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-2xl text-xs font-medium text-slate-400 hover:text-sky-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center gap-1.5 whitespace-nowrap"
            title="Browse all files uploaded to the community Internet Archive collection"
          >
            <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
            <span>Archive.org S3</span>
          </a>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px] sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search titles, genres, anime..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs text-slate-100 liquid-glass-input rounded-2xl"
          />
        </div>

      </div>

      {/* Catalog Grid */}
      {loading ? (
        <div className="text-center py-20 space-y-3">
          <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Loading catalog from Internet Archive...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-16 bg-white/[0.02] border border-white/10 rounded-3xl space-y-3">
          <Film className="w-10 h-10 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold text-white">No titles found</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery ? `No matches for "${searchQuery}". Try a different keyword.` : 'No titles available in this category yet.'}
          </p>
          <div className="pt-2">
            <button
              onClick={() => setIsRequestModalOpen(true)}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold cursor-pointer underline"
            >
              Request this title from the admin
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                if (item.type !== 'movie') {
                  setActiveSeries(item);
                }
              }}
              className="group relative rounded-2xl overflow-hidden bg-slate-900/60 border border-white/10 hover:border-sky-400/50 transition-all duration-300 flex flex-col justify-between shadow-lg hover:shadow-2xl hover:shadow-sky-500/10 cursor-pointer"
            >
              {/* Poster Container */}
              <div className="aspect-[2/3] w-full relative overflow-hidden bg-slate-800">
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
                    {item.type === 'movie' ? (
                      <Film className="w-8 h-8 text-sky-400 mb-1" />
                    ) : (
                      <Folder className="w-8 h-8 text-indigo-400 mb-1" />
                    )}
                    <span className="text-[11px] font-bold text-slate-300 line-clamp-2">{item.title}</span>
                  </div>
                )}

                {/* Top Badge: Type & Audio */}
                <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-10">
                  <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[9px] font-mono font-bold uppercase tracking-wider text-sky-300 border border-white/10">
                    {item.type}
                  </span>
                  {item.audioLang && (
                    <span className="px-1.5 py-0.5 rounded-md bg-indigo-950/90 backdrop-blur-md text-[9px] font-mono text-indigo-200 border border-white/10">
                      {item.audioLang}
                    </span>
                  )}
                </div>

                {/* Top Right: Delete & Edit buttons for authorized users */}
                {canManageItem(item) && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingItem(item);
                        setIsUploadModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg bg-black/80 hover:bg-indigo-600 text-slate-300 hover:text-white backdrop-blur-md border border-white/20 transition-all shadow-lg cursor-pointer"
                      title="Edit / Replace video link"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToDelete(item);
                      }}
                      className="p-1.5 rounded-lg bg-black/80 hover:bg-red-600 text-red-300 hover:text-white backdrop-blur-md border border-white/20 transition-all shadow-lg cursor-pointer group/del"
                      title="Delete from Penguin View"
                    >
                      <Trash2 className="w-3 h-3 group-hover/del:scale-110 transition-transform" />
                    </button>
                  </div>
                )}

                {/* Rating Badge */}
                {item.rating && (
                  <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-bold text-amber-400 flex items-center gap-1 border border-white/10 z-10">
                    <Star className="w-3 h-3 fill-amber-400" />
                    <span>{item.rating}</span>
                  </div>
                )}

                {/* Hover overlay with quick action */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-3 text-left z-20">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-sky-300 uppercase tracking-wider">
                      {item.storageProvider === 'firebase' ? '🔥 Firebase' : '☁️ Archive'}
                    </span>
                    {canManageItem(item) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemToDelete(item);
                        }}
                        className="px-2 py-1 rounded-lg bg-red-600/90 hover:bg-red-600 text-white text-[10px] font-bold flex items-center gap-1 shadow cursor-pointer active:scale-95"
                        title="Delete from Penguin View"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {item.type === 'movie' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartMovieParty(item);
                        }}
                        className="w-full py-2 bg-gradient-to-r from-sky-400 to-indigo-600 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Watch Party</span>
                      </button>
                    ) : (
                      <div className="w-full py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5">
                        <Folder className="w-3.5 h-3.5" />
                        <span>Open Folder</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Title & Metadata Card Footer */}
              <div className="p-3 text-left space-y-1 bg-[#090e1c]">
                <h3 className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors line-clamp-1 font-display">
                  {item.title}
                </h3>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>{item.releaseYear || '2024'}</span>
                  {item.type === 'movie' ? (
                    <span>{item.duration ? `${item.duration}m` : 'Movie'}</span>
                  ) : (
                    <span>{item.seasons?.length || 1} Season{(item.seasons?.length || 1) > 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Upload Studio Modal */}
      {isUploadModalOpen && (
        <MediaUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => {
            setIsUploadModalOpen(false);
            setEditingItem(null);
          }}
          currentUser={currentUser}
          existingMediaItem={editingItem}
        />
      )}

      {/* Viewer Request Title / Uploader Rights Modal */}
      <MediaRequestModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        currentUser={currentUser}
      />

      {/* Master Admin Requests Drawer */}
      <AdminRequestsDrawer
        isOpen={isAdminDrawerOpen}
        onClose={() => setIsAdminDrawerOpen(false)}
        currentUser={currentUser}
      />

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0d1322] border border-red-500/40 rounded-3xl p-6 shadow-2xl space-y-5 text-left relative overflow-hidden">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">
                  Remove "{itemToDelete.title}"?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This will permanently remove this {itemToDelete.type} from Penguin View so you can re-upload a working or higher-quality version.
                </p>
              </div>
            </div>

            <div className="p-3 bg-red-950/30 border border-red-500/20 rounded-xl text-[11px] text-red-200 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-red-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Confirm Removal</span>
              </p>
              <p className="text-red-300/80">
                Title: <strong>{itemToDelete.title}</strong> {itemToDelete.releaseYear ? `(${itemToDelete.releaseYear})` : ''}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-lg shadow-red-600/30 flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isDeleting ? (
                  <span className="animate-spin text-sm">⏳</span>
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>{isDeleting ? 'Deleting...' : 'Yes, Delete Movie'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
