import React, { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  getDocs,
  orderBy,
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
  Sparkles, 
  User as UserIcon,
  Play,
  RotateCcw,
  Star,
  MessageSquare
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
  
  // Form fields
  const [title, setTitle] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [ratingType, setRatingType] = useState<'stars' | 'tomatoes'>('stars');
  const [ratingValue, setRatingValue] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Editing rating inline
  const [editingRatingItemId, setEditingRatingItemId] = useState<string | null>(null);

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

    // Compress & convert image to standard responsive Base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Render image to canvas to compress/resize
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Compress quality
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
      const newItem = {
        userId: currentUser.uid,
        title: title.trim(),
        imageUrl: imagePreview || null,
        isWatched: false,
        ratingType,
        ratingValue,
        reviewComment: reviewComment.trim() || null,
        addedAt: new Date()
      };

      const path = 'watchlist';
      try {
        await addDoc(collection(db, 'watchlist'), newItem);
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, path);
      }

      // Reset form
      setTitle('');
      setImageFile(null);
      setImagePreview('');
      setReviewComment('');
      setShowAddForm(false);
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
    try {
      await updateDoc(itemRef, { isWatched: !item.isWatched });
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.UPDATE, path);
    }
  };

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
        reviewComment: comment || null
      });
      setEditingRatingItemId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!isOwnList) return;
    if (!window.confirm('Are you sure you want to remove this movie?')) return;
    const itemRef = doc(db, 'watchlist', itemId);
    const path = `watchlist/${itemId}`;
    try {
      await deleteDoc(itemRef);
    } catch (fsErr) {
      handleFirestoreError(fsErr, OperationType.DELETE, path);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
            <Film className="w-5 h-5 text-sky-400" />
            {isOwnList ? 'My Personal Watch List' : `${targetUser.name}'s To-Watch List`}
          </h3>
          <p className="text-xs text-slate-400">
            {isOwnList 
              ? 'Movies & videos you plan to watch or have rated. Friends can view this!' 
              : `Browse which movies ${targetUser.name} wants to watch. Select one to start a sync room!`}
          </p>
        </div>

        {isOwnList && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 flex items-center gap-1.5 text-xs font-semibold text-white cursor-pointer transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px'
            }}
          >
            <Plus className="w-4 h-4" />
            Add Movie
          </button>
        )}
      </div>

      {showAddForm && isOwnList && (
        <LiquidGlassCard className="animate-fade-in border-sky-500/20">
          <form onSubmit={handleAddItem} className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Add a New Film
            </h4>

            {error && (
              <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-500/20 p-2 rounded-lg">
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Movie / Video Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Interstellar, Inside Out 2..."
                    className="w-full px-4 py-2.5 text-sm text-slate-100 liquid-glass-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                
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

            {/* Optional initial rating & review comment */}
            <RatingPicker
              initialRatingType={ratingType}
              initialRatingValue={ratingValue}
              initialReviewComment={reviewComment}
              onSave={(t, v, c) => {
                setRatingType(t);
                setRatingValue(v);
                setReviewComment(c);
              }}
            />

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
                className="px-4 py-2 text-xs font-semibold text-white cursor-pointer transition-transform active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.3) 0%, rgba(99, 102, 241, 0.3) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px'
                }}
              >
                {formLoading ? 'Adding...' : 'Save to Watch List'}
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
      ) : items.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
          <Film className="w-10 h-10 mx-auto text-slate-600 mb-2.5 opacity-60" />
          <p className="text-sm font-semibold text-slate-400 font-display">No movies in the list</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            {isOwnList 
              ? "Start adding videos or movies you'd like to sync with friends later!" 
              : "This friend hasn't added any movies to their list yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
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
                    <Film className="w-12 h-12 stroke-1" />
                    <span className="text-[10px] uppercase tracking-wider font-mono">PENGUIN PREVIEW</span>
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <span 
                    className={`px-2.5 py-1 rounded-full text-[9px] font-semibold font-mono tracking-wider shadow-md backdrop-blur-md ${
                      item.isWatched 
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                        : 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30'
                    }`}
                  >
                    {item.isWatched ? '✓ WATCHED' : '👀 PLAN TO WATCH'}
                  </span>
                </div>

                {/* Hover Sync Room Launcher */}
                {onStartRoom && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200 backdrop-blur-sm">
                    <button
                      onClick={() => onStartRoom(item.title)}
                      className="px-4 py-2.5 flex items-center gap-2 text-xs font-semibold text-white shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      style={{
                        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.4) 0%, rgba(99, 102, 241, 0.4) 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '12px'
                      }}
                    >
                      <Play className="w-3.5 h-3.5" />
                      Sync This Movie
                    </button>
                  </div>
                )}
              </div>

              {/* Card Details */}
              <div className="p-4 flex flex-col justify-between flex-grow space-y-2">
                <div>
                  <h4 className={`font-semibold text-sm tracking-tight font-display text-white line-clamp-2 ${
                    item.isWatched ? 'line-through text-slate-500' : ''
                  }`}>
                    {item.title}
                  </h4>

                  {/* Rating & Review Badge */}
                  {item.ratingValue && (
                    <div className="mt-2 space-y-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-400/20 text-amber-300">
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
                            Unmark
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            Watched
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
                      title="Remove from list"
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
          ))}
        </div>
      )}
    </div>
  );
};
