import React, { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { WatchListItem, UserProfile } from '../types';
import { LiquidGlassCard } from './LiquidGlassCard';
import { RatingPicker } from './RatingPicker';
import { 
  Plus, 
  Check, 
  Trash2, 
  Image as ImageIcon, 
  Film, 
  User as UserIcon,
  Play,
  RotateCcw,
  Star,
  Tv,
  ChevronRight,
  Eye,
  CheckCircle2,
  ListFilter
} from 'lucide-react';

interface WatchListProps {
  currentUser: UserProfile;
  selectedFriend?: UserProfile | null;
  onStartRoom?: (movieTitle: string) => void;
}

export const WatchList: React.FC<WatchListProps> = ({ 
  currentUser, 
  selectedFriend,
  onStartRoom
}) => {
  const [items, setItems] = useState<WatchListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<'to_watch' | 'watched'>('to_watch');
  
  // Form fields
  const [title, setTitle] = useState<string>('');
  const [itemType, setItemType] = useState<'movie' | 'series'>('movie');
  const [currentSeason, setCurrentSeason] = useState<number>(1);
  const [currentEpisode, setCurrentEpisode] = useState<number>(1);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [ratingType, setRatingType] = useState<'stars' | 'tomatoes'>('stars');
  const [ratingValue, setRatingValue] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Editing rating inline
  const [editingRatingItemId, setEditingRatingItemId] = useState<string | null>(null);
  // Editing episode/season inline
  const [editingEpisodeItemId, setEditingEpisodeItemId] = useState<string | null>(null);
  const [editSeasonVal, setEditSeasonVal] = useState<number>(1);
  const [editEpisodeVal, setEditEpisodeVal] = useState<number>(1);

  const targetUser = selectedFriend || currentUser;
  const isOwnList = targetUser.uid === currentUser.uid;

  // Real-time listener for watch list items
  useEffect(() => {
    setLoading(true);
    const watchlistCollection = collection(db, 'watchlist');
    const q = query(
      watchlistCollection,
      where('userId', '==', targetUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems: WatchListItem[] = [];
      snapshot.forEach((docSnap) => {
        fetchedItems.push({
          id: docSnap.id,
          ...docSnap.data()
        } as WatchListItem);
      });

      // Sort client side by addedAt descending
      fetchedItems.sort((a, b) => {
        const timeA = a.addedAt?.toMillis ? a.addedAt.toMillis() : new Date(a.addedAt || 0).getTime();
        const timeB = b.addedAt?.toMillis ? b.addedAt.toMillis() : new Date(b.addedAt || 0).getTime();
        return timeB - timeA;
      });

      setItems(fetchedItems);
      setLoading(false);
    }, (err) => {
      console.error("Watchlist fetch error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [targetUser.uid]);

  // Handle local image file selection and compress it to base64
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
      setError('Please choose an image under 1.5MB');
      return;
    }

    setError('');
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = (event: any) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setImagePreview(dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setFormLoading(true);
    setError('');

    try {
      const newItem: any = {
        userId: currentUser.uid,
        title: title.trim(),
        itemType,
        imageUrl: imagePreview || null,
        isWatched: false,
        addedAt: new Date()
      };

      if (itemType === 'series') {
        newItem.currentSeason = Number(currentSeason) || 1;
        newItem.currentEpisode = Number(currentEpisode) || 1;
      }

      const path = 'watchlist';
      try {
        await addDoc(collection(db, 'watchlist'), newItem);
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, path);
      }

      // Reset form
      setTitle('');
      setItemType('movie');
      setCurrentSeason(1);
      setCurrentEpisode(1);
      setImageFile(null);
      setImagePreview('');
      setReviewComment('');
      setShowAddForm(false);
      setActiveFilter('to_watch');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to add item to watchlist');
    } finally {
      setFormLoading(false);
    }
  };

  const toggleWatched = async (item: WatchListItem) => {
    if (!isOwnList) return;
    const itemRef = doc(db, 'watchlist', item.id);
    const path = `watchlist/${item.id}`;
    const nextWatched = !item.isWatched;
    try {
      await updateDoc(itemRef, { isWatched: nextWatched });
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.UPDATE, path);
    }
  };

  // When user rates an item, automatically mark it as watched so it transitions to Watched & Rated!
  const handleSaveItemRating = async (
    itemId: string,
    type: 'stars' | 'tomatoes',
    val: number,
    comment: string
  ) => {
    if (!isOwnList) return;
    const itemRef = doc(db, 'watchlist', itemId);
    try {
      await updateDoc(itemRef, {
        ratingType: type,
        ratingValue: val,
        reviewComment: comment || null,
        isWatched: true // Automatically moves to Watched List
      });
      setEditingRatingItemId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Quick increment/decrement episode for a series
  const handleUpdateEpisode = async (itemId: string, currentEp: number, delta: number) => {
    if (!isOwnList) return;
    const newEp = Math.max(1, (currentEp || 1) + delta);
    const itemRef = doc(db, 'watchlist', itemId);
    try {
      await updateDoc(itemRef, { currentEpisode: newEp });
    } catch (err) {
      console.error(err);
    }
  };

  // Save manual Season & Episode
  const handleSaveSeasonEpisode = async (itemId: string) => {
    if (!isOwnList) return;
    const itemRef = doc(db, 'watchlist', itemId);
    try {
      await updateDoc(itemRef, {
        currentSeason: Math.max(1, editSeasonVal || 1),
        currentEpisode: Math.max(1, editEpisodeVal || 1)
      });
      setEditingEpisodeItemId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!isOwnList) return;
    if (!window.confirm('Are you sure you want to remove this item?')) return;
    const itemRef = doc(db, 'watchlist', itemId);
    const path = `watchlist/${itemId}`;
    try {
      await deleteDoc(itemRef);
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.DELETE, path);
    }
  };

  // Filter items based on active subtab
  const toWatchItems = items.filter(i => !i.isWatched);
  const watchedItems = items.filter(i => i.isWatched);
  const displayedItems = activeFilter === 'to_watch' ? toWatchItems : watchedItems;

  return (
    <div className="space-y-6">
      {/* Header with Title and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
            <Film className="w-5 h-5 text-sky-400" />
            {isOwnList ? 'My Personal Watch List' : `${targetUser.name}'s To-Watch List`}
          </h3>
          <p className="text-xs text-slate-400">
            {isOwnList 
              ? 'Organize films & series. Rated titles automatically move to Watched & Rated.' 
              : `Browse which movies & shows ${targetUser.name} wants to watch.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isOwnList && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 flex items-center gap-1.5 text-xs font-semibold text-white cursor-pointer transition-all duration-200 shadow-md hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.3) 0%, rgba(99, 102, 241, 0.3) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '12px'
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Add Movie or Series</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Filter Tabs: To Watch vs Watched & Rated */}
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 p-1.5 rounded-2xl max-w-md">
        <button
          onClick={() => setActiveFilter('to_watch')}
          className={`flex-1 px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeFilter === 'to_watch'
              ? 'bg-sky-500/25 text-white border border-sky-400/40 shadow-md shadow-sky-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Film className="w-3.5 h-3.5 text-sky-400" />
          <span>To Watch</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            activeFilter === 'to_watch' ? 'bg-sky-400/30 text-sky-200' : 'bg-white/10 text-slate-400'
          }`}>
            {toWatchItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('watched')}
          className={`flex-1 px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeFilter === 'watched'
              ? 'bg-emerald-500/25 text-white border border-emerald-400/40 shadow-md shadow-emerald-500/10'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Watched & Rated</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            activeFilter === 'watched' ? 'bg-emerald-400/30 text-emerald-200' : 'bg-white/10 text-slate-400'
          }`}>
            {watchedItems.length}
          </span>
        </button>
      </div>

      {/* Add New Movie/Show Form */}
      {showAddForm && isOwnList && (
        <LiquidGlassCard className="animate-fade-in border-sky-500/20 shadow-xl">
          <form onSubmit={handleAddItem} className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-sky-400" />
              Add a New Title
            </h4>

            {error && (
              <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-500/20 p-2 rounded-lg">
                {error}
              </p>
            )}

            {/* Content Type Selector (Movie vs Series / Anime) */}
            <div className="flex items-center gap-3">
              <label className="text-[11px] font-medium text-slate-400">Content Type:</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setItemType('movie')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                    itemType === 'movie'
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/40 shadow-sm'
                      : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>🎬 Movie / Film</span>
                </button>

                <button
                  type="button"
                  onClick={() => setItemType('series')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                    itemType === 'series'
                      ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40 shadow-sm'
                      : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>📺 TV Series / Anime</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    {itemType === 'series' ? 'Series / Anime Title' : 'Movie Title'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={itemType === 'series' ? "e.g. Breaking Bad, Attack on Titan..." : "e.g. Interstellar, Inside Out 2..."}
                    className="w-full px-4 py-2.5 text-sm text-slate-100 liquid-glass-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                {/* Series Episode and Season Tracker Inputs */}
                {itemType === 'series' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">
                        Current Season #
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="w-full px-3 py-2 text-xs font-mono text-white bg-black/40 border border-indigo-400/30 rounded-xl"
                        value={currentSeason}
                        onChange={(e) => setCurrentSeason(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">
                        Current Episode #
                      </label>
                      <input
                        type="number"
                        min="1"
                        className="w-full px-3 py-2 text-xs font-mono text-white bg-black/40 border border-indigo-400/30 rounded-xl"
                        value={currentEpisode}
                        onChange={(e) => setCurrentEpisode(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </div>
                  </div>
                )}
                
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Upload Poster / Photo (Optional)
                  </label>
                  <div className="flex items-center gap-3">
                    <label 
                      className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs transition-colors"
                    >
                      <ImageIcon className="w-4 h-4 text-sky-400" />
                      Choose Image
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleImageChange} 
                      />
                    </label>
                    <span className="text-[10px] text-slate-500 max-w-[200px] truncate">
                      {imageFile ? imageFile.name : 'No file chosen'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center border border-white/5 bg-white/5 rounded-2xl p-3 min-h-[120px]">
                {imagePreview ? (
                  <div className="relative group w-full h-full max-h-[140px] rounded-xl overflow-hidden shadow-inner">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="w-full h-full object-cover" 
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview('');
                      }}
                      className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded-full text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-slate-500">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-40" />
                    <p className="text-[10px]">Image Preview</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setError('');
                }}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-4 py-2 text-xs font-semibold text-white cursor-pointer transition-transform active:scale-95 shadow-md"
                style={{
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.3) 0%, rgba(99, 102, 241, 0.3) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px'
                }}
              >
                {formLoading ? 'Adding...' : 'Save to To-Watch List'}
              </button>
            </div>
          </form>
        </LiquidGlassCard>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-xs text-slate-400 font-mono">LOADING WATCHLIST...</p>
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-white/10 rounded-3xl bg-white/[0.02] space-y-2">
          {activeFilter === 'to_watch' ? (
            <>
              <Film className="w-10 h-10 mx-auto text-slate-600 mb-1 opacity-60" />
              <p className="text-sm font-semibold text-slate-300 font-display">No movies or shows in To-Watch</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {isOwnList 
                  ? "Your to-watch list is clean! Add new movies or anime you plan to sync with friends." 
                  : "This friend has no uncompleted items in their to-watch list."}
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/50 mb-1 opacity-60" />
              <p className="text-sm font-semibold text-slate-300 font-display">No watched titles yet</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                {isOwnList 
                  ? "When you finish a movie or series and rate it, it will be stored right here in your Watched archive!" 
                  : "No watched films logged yet."}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedItems.map((item) => {
            const isSeries = item.itemType === 'series' || item.currentEpisode !== undefined;
            const seasonNum = item.currentSeason || 1;
            const episodeNum = item.currentEpisode || 1;

            return (
              <div
                key={item.id}
                className="relative group transition-all duration-300 rounded-[24px] overflow-hidden border border-white/10 hover:border-white/20 hover:-translate-y-0.5 shadow-lg flex flex-col h-full justify-between"
                style={{
                  background: item.isWatched 
                    ? 'rgba(255, 255, 255, 0.03)' 
                    : 'rgba(255, 255, 255, 0.06)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)'
                }}
              >
                {/* Image poster overlay or cute backdrop icon */}
                <div className="relative h-44 w-full bg-[#0a0d14] flex items-center justify-center overflow-hidden">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                        item.isWatched ? 'opacity-40 grayscale' : 'opacity-85'
                      }`}
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 opacity-30 text-slate-400">
                      {isSeries ? <Tv className="w-12 h-12 stroke-1 text-indigo-400" /> : <Film className="w-12 h-12 stroke-1" />}
                      <span className="text-[10px] uppercase tracking-wider font-mono">
                        {isSeries ? 'SERIES PREVIEW' : 'PENGUIN PREVIEW'}
                      </span>
                    </div>
                  )}

                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    <span 
                      className={`px-2.5 py-1 rounded-full text-[9px] font-semibold font-mono tracking-wider shadow-md backdrop-blur-md ${
                        item.isWatched 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                          : 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30'
                      }`}
                    >
                      {item.isWatched ? '✓ WATCHED' : isSeries ? '📺 SERIES' : '🎬 MOVIE'}
                    </span>

                    {isSeries && !item.isWatched && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-sky-500/30 text-sky-200 border border-sky-400/40 backdrop-blur-md">
                        S{seasonNum} : E{episodeNum}
                      </span>
                    )}
                  </div>

                  {/* Hover Sync Room Launcher */}
                  {onStartRoom && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200 backdrop-blur-sm">
                      <button
                        onClick={() => {
                          const roomTitle = isSeries ? `${item.title} (S${seasonNum} E${episodeNum})` : item.title;
                          onStartRoom(roomTitle);
                        }}
                        className="px-4 py-2.5 flex items-center gap-2 text-xs font-semibold text-white shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.4) 0%, rgba(99, 102, 241, 0.4) 100%)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          borderRadius: '12px'
                        }}
                      >
                        <Play className="w-3.5 h-3.5" />
                        Sync This {isSeries ? 'Episode' : 'Movie'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Details */}
                <div className="p-4 flex flex-col justify-between flex-grow space-y-3">
                  <div>
                    <h4 className={`font-semibold text-sm tracking-tight font-display text-white line-clamp-2 ${
                      item.isWatched ? 'text-slate-300' : ''
                    }`}>
                      {item.title}
                    </h4>

                    {/* Series Progress Tracker Bar */}
                    {isSeries && (
                      <div className="mt-2.5 p-2 bg-white/5 border border-white/10 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-indigo-300 flex items-center gap-1">
                            <Tv className="w-3 h-3 text-indigo-400" />
                            Watching: Season {seasonNum}, Ep {episodeNum}
                          </span>

                          {isOwnList && (
                            <button
                              onClick={() => {
                                setEditSeasonVal(seasonNum);
                                setEditEpisodeVal(episodeNum);
                                setEditingEpisodeItemId(editingEpisodeItemId === item.id ? null : item.id);
                              }}
                              className="text-[10px] text-sky-400 hover:underline font-mono cursor-pointer"
                            >
                              {editingEpisodeItemId === item.id ? 'Cancel' : 'Edit S/E'}
                            </button>
                          )}
                        </div>

                        {/* Quick increment/decrement buttons */}
                        {isOwnList && !editingEpisodeItemId && (
                          <div className="flex items-center gap-1.5 pt-1">
                            <button
                              onClick={() => handleUpdateEpisode(item.id, episodeNum, -1)}
                              disabled={episodeNum <= 1}
                              className="px-2 py-0.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-300 rounded-md text-[10px] font-mono cursor-pointer transition-all"
                              title="Previous Episode"
                            >
                              - Ep {Math.max(1, episodeNum - 1)}
                            </button>

                            <button
                              onClick={() => handleUpdateEpisode(item.id, episodeNum, 1)}
                              className="px-2 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 rounded-md text-[10px] font-mono font-bold cursor-pointer transition-all flex items-center gap-0.5 active:scale-95"
                              title="Next Episode"
                            >
                              <span>+ Next Ep ({episodeNum + 1})</span>
                            </button>
                          </div>
                        )}

                        {/* Inline Season & Episode Editor */}
                        {editingEpisodeItemId === item.id && isOwnList && (
                          <div className="pt-2 border-t border-white/10 space-y-2 animate-fade-in">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] text-slate-400 font-mono">Season #</label>
                                <input
                                  type="number"
                                  min="1"
                                  className="w-full px-2 py-1 text-xs bg-black/50 border border-white/20 rounded-lg text-white font-mono"
                                  value={editSeasonVal}
                                  onChange={(e) => setEditSeasonVal(parseInt(e.target.value) || 1)}
                                />
                              </div>
                              <div>
                                <label className="text-[9px] text-slate-400 font-mono">Episode #</label>
                                <input
                                  type="number"
                                  min="1"
                                  className="w-full px-2 py-1 text-xs bg-black/50 border border-white/20 rounded-lg text-white font-mono"
                                  value={editEpisodeVal}
                                  onChange={(e) => setEditEpisodeVal(parseInt(e.target.value) || 1)}
                                />
                              </div>
                            </div>
                            <button
                              onClick={() => handleSaveSeasonEpisode(item.id)}
                              className="w-full py-1 bg-sky-500/30 hover:bg-sky-500/40 text-sky-200 border border-sky-400/30 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                            >
                              Update Progress
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rating & Review Badge */}
                    {item.ratingValue && (
                      <div className="mt-2 space-y-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/30 text-amber-300 shadow-sm">
                          {item.ratingType === 'tomatoes' ? '🍅' : '⭐'} {item.ratingValue} / 5
                        </span>
                        {item.reviewComment && (
                          <p className="text-[10px] text-slate-300 italic bg-white/5 p-2 rounded-lg border border-white/5 line-clamp-2">
                            "{item.reviewComment}"
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inline Rating Editor */}
                  {editingRatingItemId === item.id ? (
                    <div className="pt-2">
                      <RatingPicker
                        initialRatingType={item.ratingType || 'stars'}
                        initialRatingValue={item.ratingValue || 5}
                        initialReviewComment={item.reviewComment || ''}
                        onSave={(t, v, c) => handleSaveItemRating(item.id, t, v, c)}
                        onCancel={() => setEditingRatingItemId(null)}
                      />
                    </div>
                  ) : isOwnList ? (
                    <div className="flex items-center justify-between border-t border-white/5 mt-3 pt-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleWatched(item)}
                          className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          {item.isWatched ? (
                            <>
                              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                              Move to To-Watch
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              Mark Watched
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => setEditingRatingItemId(item.id)}
                          className="flex items-center gap-1 text-[10px] font-medium text-amber-300 hover:underline cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-400" />
                          {item.ratingValue ? 'Edit Rating' : 'Rate & Review'}
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10 cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 pt-2 text-[10px] text-slate-500 flex items-center gap-1 border-t border-white/5">
                      <UserIcon className="w-3 h-3 text-sky-400/60" />
                      <span>Belongs to {targetUser.name}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
