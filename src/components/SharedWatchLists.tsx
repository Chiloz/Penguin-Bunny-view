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
import { UserProfile, SharedList, SharedWatchListItem } from '../types';
import { LiquidGlassCard } from './LiquidGlassCard';
import { RatingPicker } from './RatingPicker';
import { 
  Users, 
  Plus, 
  Film, 
  Check, 
  Trash2, 
  Play, 
  Image as ImageIcon, 
  Star, 
  MessageSquare,
  ChevronRight,
  RotateCcw,
  UserCheck,
  Tv,
  CheckCircle2
} from 'lucide-react';

interface SharedWatchListsProps {
  currentUser: UserProfile;
  friendsProfiles: UserProfile[];
  onStartRoom: (movieTitle: string) => void;
}

export const SharedWatchLists: React.FC<SharedWatchListsProps> = ({
  currentUser,
  friendsProfiles = [],
  onStartRoom
}) => {
  const [lists, setLists] = useState<SharedList[]>([]);
  const [loadingLists, setLoadingLists] = useState<boolean>(true);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'to_watch' | 'watched'>('to_watch');

  // Modal / Form state for creating a new shared list
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [listTitleInput, setListTitleInput] = useState<string>('');
  const [selectedFriendUids, setSelectedFriendUids] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string>('');
  const [creatingList, setCreatingList] = useState<boolean>(false);

  // Active List items state
  const [listItems, setListItems] = useState<SharedWatchListItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  // Form for adding film to selected list
  const [showAddItemForm, setShowAddItemForm] = useState<boolean>(false);
  const [itemTitle, setItemTitle] = useState<string>('');
  const [itemType, setItemType] = useState<'movie' | 'series'>('movie');
  const [currentSeason, setCurrentSeason] = useState<number>(1);
  const [currentEpisode, setCurrentEpisode] = useState<number>(1);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [addItemLoading, setAddItemLoading] = useState<boolean>(false);

  // Editing Rating state for a specific item
  const [editingRatingItemId, setEditingRatingItemId] = useState<string | null>(null);
  // Editing Episode state for a specific item
  const [editingEpisodeItemId, setEditingEpisodeItemId] = useState<string | null>(null);
  const [editSeasonVal, setEditSeasonVal] = useState<number>(1);
  const [editEpisodeVal, setEditEpisodeVal] = useState<number>(1);

  // 1. Listen for all shared lists where currentUser is a member
  useEffect(() => {
    setLoadingLists(true);
    const q = query(
      collection(db, 'shared_lists'),
      where('members', 'array-contains', currentUser.uid)
    );

    const unsubscribe紧 = onSnapshot(q, (snapshot) => {
      const fetched: SharedList[] = [];
      snapshot.forEach((docSnap) => {
        fetched.push({
          id: docSnap.id,
          ...docSnap.data()
        } as SharedList);
      });

      setLists(fetched);
      if (fetched.length > 0 && !activeListId) {
        setActiveListId(fetched[0].id);
      }
      setLoadingLists(false);
    }, (err) => {
      console.error("Shared lists error:", err);
      handleFirestoreError(err, OperationType.LIST, 'shared_lists');
      setLoadingLists(false);
    });

    return () => unsubscribe紧();
  }, [currentUser.uid]);

  // 2. Listen for items in the active shared list
  useEffect(() => {
    if (!activeListId) {
      setListItems([]);
      return;
    }

    setLoadingItems(true);
    const itemsRef = collection(db, 'shared_lists', activeListId, 'items');

    const unsubscribe = onSnapshot(itemsRef, (snapshot) => {
      const items: SharedWatchListItem[] = [];
      snapshot.forEach((docSnap) => {
        items.push({
          id: docSnap.id,
          ...docSnap.data()
        } as SharedWatchListItem);
      });

      // Sort client side
      items.sort((a, b) => {
        const timeA = a.addedAt?.toMillis ? a.addedAt.toMillis() : new Date(a.addedAt || 0).getTime();
        const timeB紧 = b.addedAt?.toMillis ? b.addedAt.toMillis() : new Date(b.addedAt || 0).getTime();
        return timeB紧 - timeA;
      });

      setListItems(items);
      setLoadingItems(false);
    }, (err) => {
      console.error("Shared list items error:", err);
      setLoadingItems(false);
    });

    return () => unsubscribe();
  }, [activeListId]);

  // Action: Create Shared List with Friend
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listTitleInput.trim()) return;

    if (selectedFriendUids.length === 0) {
      setCreateError('Please select at least one friend to share this list with!');
      return;
    }

    setCreatingList(true);
    setCreateError('');

    try {
      const members = Array.from(new Set([currentUser.uid, ...selectedFriendUids]));
      const newList = {
        title: listTitleInput.trim(),
        createdById: currentUser.uid,
        createdByName: currentUser.name,
        members,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'shared_lists'), newList);
      setActiveListId(docRef.id);

      // Reset modal
      setListTitleInput('');
      setSelectedFriendUids([]);
      setShowCreateModal(false);
    } catch (err: any) {
      console.error(err);
      setCreateError(err.message || 'Failed to create shared list.');
    } finally {
      setCreatingList(false);
    }
  };

  // Action: Add Item to Shared List
  const handleAddItemToSharedList做到 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeListId || !itemTitle.trim()) return;

    setAddItemLoading(true);

    try {
      const newItem: any = {
        listId: activeListId,
        title: itemTitle.trim(),
        itemType,
        addedByUid: currentUser.uid,
        addedByName: currentUser.name,
        imageUrl: imagePreview || null,
        isWatched: false,
        addedAt: new Date()
      };

      if (itemType === 'series') {
        newItem.currentSeason = Number(currentSeason) || 1;
        newItem.currentEpisode = Number(currentEpisode) || 1;
      }

      await addDoc(collection(db, 'shared_lists', activeListId, 'items'), newItem);

      // Reset form
      setItemTitle('');
      setItemType('movie');
      setCurrentSeason(1);
      setCurrentEpisode(1);
      setImagePreview('');
      setShowAddItemForm(false);
      setActiveFilter('to_watch');
    } catch (err) {
      console.error(err);
    } finally {
      setAddItemLoading(false);
    }
  };

  // Action: Toggle Watched State
  const toggleItemWatched = async (item: SharedWatchListItem) => {
    if (!activeListId) return;
    const itemRef = doc(db, 'shared_lists', activeListId, 'items', item.id);
    try {
      await updateDoc(itemRef, { isWatched: !item.isWatched });
    } catch (err) {
      console.error(err);
    }
  };

  // Action: Save Rating / Review on Item (automatically sets isWatched: true)
  const handleSaveItemRating = async (
    itemId: string, 
    type: 'stars' | 'tomatoes', 
    val: number, 
    comment: string
  ) => {
    if (!activeListId) return;
    const itemRef = doc(db, 'shared_lists', activeListId, 'items', itemId);
    try {
      await updateDoc(itemRef, {
        ratingType: type,
        ratingValue: val,
        reviewComment: comment || null,
        reviewedByUid: currentUser.uid,
        reviewedByName: currentUser.name,
        isWatched: true // Auto moves to watched list
      });
      setEditingRatingItemId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Update Episode count
  const handleUpdateEpisode = async (itemId: string, currentEp: number, delta: number) => {
    if (!activeListId) return;
    const newEp = Math.max(1, (currentEp || 1) + delta);
    const itemRef = doc(db, 'shared_lists', activeListId, 'items', itemId);
    try {
      await updateDoc(itemRef, { currentEpisode: newEp });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveSeasonEpisode = async (itemId: string) => {
    if (!activeListId) return;
    const itemRef = doc(db, 'shared_lists', activeListId, 'items', itemId);
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

  // Action: Delete Item from Shared List
  const handleDeleteItem = async (itemId: string) => {
    if (!activeListId) return;
    if (!window.confirm("Remove this title from the shared list?")) return;
    const itemRef = doc(db, 'shared_lists', activeListId, 'items', itemId);
    try {
      await deleteDoc(itemRef);
    } catch (err) {
      console.error(err);
    }
  };

  // Helper image preview upload
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 380;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setImagePreview(canvas.toDataURL('image/jpeg', 0.7));
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const activeList = lists.find(l => l.id === activeListId);
  const toWatchItems = listItems.filter(i => !i.isWatched);
  const watchedItems = listItems.filter(i => i.isWatched);
  const displayedItems = activeFilter === 'to_watch' ? toWatchItems : watchedItems;

  return (
    <div className="space-y-6">
      
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold font-display text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            Collaborative Shared Lists
          </h3>
          <p className="text-xs text-slate-400">
            Create shared lists with friends! Both you and your friends can add movies, check off items, and rate them together in real-time.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 flex items-center gap-1.5 text-xs font-semibold text-white cursor-pointer transition-all active:scale-95 whitespace-nowrap shadow-lg"
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.4) 0%, rgba(168, 85, 247, 0.4) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px'
          }}
        >
          <Plus className="w-4 h-4" />
          Create List with Friend
        </button>
      </div>

      {/* Shared Lists Selector Tabs */}
      {loadingLists ? (
        <div className="flex items-center gap-2 py-4">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400">Loading shared lists...</span>
        </div>
      ) : lists.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
          <Users className="w-8 h-8 mx-auto text-slate-500 mb-2 opacity-50" />
          <p className="text-sm font-semibold text-slate-300">No shared lists created yet</p>
          <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
            Click "Create List with Friend" above to start a shared movie checklist with your friends!
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {lists.map((list) => (
            <button
              key={list.id}
              onClick={() => setActiveListId(list.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap border ${
                activeListId === list.id
                  ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-indigo-400/40 text-white shadow-md'
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-indigo-400" />
              <span>{list.title}</span>
              <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded-full font-mono text-slate-300">
                {list.members.length} members
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Selected List Dashboard Container */}
      {activeList && (
        <LiquidGlassCard className="border-indigo-500/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-lg font-bold font-display text-white">{activeList.title}</h4>
                <span className="text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-400/20 px-2 py-0.5 rounded-full font-mono">
                  Shared
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Created by <span className="text-slate-200 font-medium">{activeList.createdByName}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddItemForm(!showAddItemForm)}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-sky-400" />
                Add Title to List
              </button>
            </div>
          </div>

          {/* Sub-tabs: To Watch vs Watched & Rated */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 p-1.5 rounded-2xl max-w-xs mb-5">
            <button
              onClick={() => setActiveFilter('to_watch')}
              className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeFilter === 'to_watch'
                  ? 'bg-indigo-500/30 text-white border border-indigo-400/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-indigo-400" />
              <span>To Watch</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-white/10">
                {toWatchItems.length}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('watched')}
              className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeFilter === 'watched'
                  ? 'bg-emerald-500/30 text-white border border-emerald-400/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Watched</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-white/10">
                {watchedItems.length}
              </span>
            </button>
          </div>

          {/* Form: Add film or show to active shared list */}
          {showAddItemForm && (
            <form onSubmit={handleAddItemToSharedList做到} className="space-y-4 bg-white/5 border border-white/10 p-4 rounded-2xl mb-6 animate-fade-in">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-sky-400" />
                Add Title to "{activeList.title}"
              </h5>

              {/* Type Toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setItemType('movie')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                    itemType === 'movie'
                      ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'
                      : 'bg-white/5 text-slate-400 border-white/10'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Movie</span>
                </button>
                <button
                  type="button"
                  onClick={() => setItemType('series')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                    itemType === 'series'
                      ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40'
                      : 'bg-white/5 text-slate-400 border-white/10'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>TV Series / Anime</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                    {itemType === 'series' ? 'Series Title' : 'Movie Title'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={itemType === 'series' ? "e.g. Arcane, Severance..." : "e.g. Deadpool & Wolverine..."}
                    className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                    value={itemTitle}
                    onChange={(e) => setItemTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Upload Poster Image (Optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full text-xs text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white cursor-pointer"
                  />
                </div>
              </div>

              {itemType === 'series' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl max-w-sm">
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">
                      Season #
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-3 py-1.5 text-xs font-mono text-white bg-black/40 border border-indigo-400/30 rounded-xl"
                      value={currentSeason}
                      onChange={(e) => setCurrentSeason(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">
                      Episode #
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="w-full px-3 py-1.5 text-xs font-mono text-white bg-black/40 border border-indigo-400/30 rounded-xl"
                      value={currentEpisode}
                      onChange={(e) => setCurrentEpisode(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddItemForm(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addItemLoading}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow cursor-pointer hover:opacity-90 active:scale-95"
                >
                  {addItemLoading ? 'Adding...' : 'Add to Shared List'}
                </button>
              </div>
            </form>
          )}

          {/* List Items Grid */}
          {loadingItems ? (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-400">Loading list items...</p>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-white/5 rounded-2xl">
              <Film className="w-8 h-8 mx-auto text-slate-600 mb-1 opacity-50" />
              <p className="text-xs font-medium text-slate-400">
                {activeFilter === 'to_watch' ? 'No to-watch items in this list' : 'No watched items in this list yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedItems.map((item) => {
                const isSeries = item.itemType === 'series' || item.currentEpisode !== undefined;
                const seasonNum = item.currentSeason || 1;
                const episodeNum = item.currentEpisode || 1;

                return (
                  <div
                    key={item.id}
                    className="relative group transition-all duration-300 rounded-[20px] overflow-hidden border border-white/10 hover:border-white/20 bg-white/[0.04] backdrop-blur-md flex flex-col justify-between"
                  >
                    {/* Poster / Preview */}
                    <div className="relative h-40 w-full bg-black/40 flex items-center justify-center overflow-hidden">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className={`w-full h-full object-cover transition-transform group-hover:scale-105 ${
                            item.isWatched ? 'opacity-40 grayscale' : 'opacity-85'
                          }`}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-slate-500 opacity-40">
                          {isSeries ? <Tv className="w-10 h-10 text-indigo-400" /> : <Film className="w-10 h-10" />}
                          <span className="text-[9px] uppercase tracking-wider font-mono">
                            {isSeries ? 'SERIES' : 'PENGUIN FILM'}
                          </span>
                        </div>
                      )}

                      {/* Badges */}
                      <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
                        <span className="bg-black/70 border border-white/15 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-semibold text-slate-200">
                          {item.addedByUid === currentUser.uid ? 'Added by You' : `By ${item.addedByName}`}
                        </span>
                        {isSeries && (
                          <span className="bg-indigo-500/60 border border-indigo-400/40 backdrop-blur-md px-2 py-0.5 rounded-full text-[9px] font-mono font-bold text-white">
                            S{seasonNum}:E{episodeNum}
                          </span>
                        )}
                      </div>

                      {/* Sync Room Overlay */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm">
                        <button
                          onClick={() => {
                            const roomTitle = isSeries ? `${item.title} (S${seasonNum} E${episodeNum})` : item.title;
                            onStartRoom(roomTitle);
                          }}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-sky-400 to-indigo-500 rounded-xl shadow flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Sync Room
                        </button>
                      </div>
                    </div>

                    {/* Body Content */}
                    <div className="p-3.5 space-y-2 flex-grow flex flex-col justify-between">
                      <div>
                        <h5 className={`text-sm font-semibold text-white line-clamp-1 ${item.isWatched ? 'text-slate-400' : ''}`}>
                          {item.title}
                        </h5>

                        {/* Series Tracker on Card */}
                        {isSeries && (
                          <div className="mt-2 p-2 bg-white/5 border border-white/10 rounded-xl space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-semibold text-indigo-300">
                                Season {seasonNum}, Episode {episodeNum}
                              </span>
                              <button
                                onClick={() => {
                                  setEditSeasonVal(seasonNum);
                                  setEditEpisodeVal(episodeNum);
                                  setEditingEpisodeItemId(editingEpisodeItemId === item.id ? null : item.id);
                                }}
                                className="text-[9px] text-sky-400 hover:underline font-mono"
                              >
                                {editingEpisodeItemId === item.id ? 'Cancel' : 'Edit'}
                              </button>
                            </div>

                            {!editingEpisodeItemId && (
                              <div className="flex items-center gap-1.5 pt-0.5">
                                <button
                                  onClick={() => handleUpdateEpisode(item.id, episodeNum, -1)}
                                  disabled={episodeNum <= 1}
                                  className="px-2 py-0.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 text-slate-300 rounded text-[9px] font-mono"
                                >
                                  - Ep {Math.max(1, episodeNum - 1)}
                                </button>
                                <button
                                  onClick={() => handleUpdateEpisode(item.id, episodeNum, 1)}
                                  className="px-2 py-0.5 bg-indigo-500/30 hover:bg-indigo-500/40 text-indigo-200 border border-indigo-400/30 rounded text-[9px] font-mono font-bold"
                                >
                                  + Next Ep ({episodeNum + 1})
                                </button>
                              </div>
                            )}

                            {editingEpisodeItemId === item.id && (
                              <div className="pt-2 border-t border-white/10 space-y-1.5">
                                <div className="grid grid-cols-2 gap-1.5">
                                  <input
                                    type="number"
                                    min="1"
                                    className="px-2 py-1 text-xs bg-black/50 border border-white/20 rounded text-white font-mono"
                                    value={editSeasonVal}
                                    onChange={(e) => setEditSeasonVal(parseInt(e.target.value) || 1)}
                                  />
                                  <input
                                    type="number"
                                    min="1"
                                    className="px-2 py-1 text-xs bg-black/50 border border-white/20 rounded text-white font-mono"
                                    value={editEpisodeVal}
                                    onChange={(e) => setEditEpisodeVal(parseInt(e.target.value) || 1)}
                                  />
                                </div>
                                <button
                                  onClick={() => handleSaveSeasonEpisode(item.id)}
                                  className="w-full py-0.5 bg-sky-500/30 hover:bg-sky-500/40 text-sky-200 rounded text-[9px] font-bold"
                                >
                                  Save Ep
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Display Rating & Review if available */}
                        {item.ratingValue && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 text-[9px] font-semibold rounded-md bg-amber-500/10 border border-amber-400/20 text-amber-300 flex items-center gap-1">
                              {item.ratingType === 'tomatoes' ? '🍅' : '⭐'} {item.ratingValue} / 5
                            </span>
                            {item.reviewComment && (
                              <p className="text-[10px] text-slate-300 italic bg-white/5 px-2 py-1 rounded-lg border border-white/5 line-clamp-2">
                                "{item.reviewComment}"
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Interactive Rating Editor inline toggle */}
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
                      ) : (
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleItemWatched(item)}
                              className="text-[10px] font-medium text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              {item.isWatched ? (
                                <>
                                  <RotateCcw className="w-3 h-3 text-amber-400" />
                                  To-Watch
                                </>
                              ) : (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  Watched
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => setEditingRatingItemId(item.id)}
                              className="text-[10px] font-medium text-amber-300 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Star className="w-3 h-3 text-amber-400" />
                              {item.ratingValue ? 'Edit Rating' : 'Rate & Review'}
                            </button>
                          </div>

                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors rounded-lg cursor-pointer"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </LiquidGlassCard>
      )}

      {/* Modal: Create List with Friend */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-[#0e1424] border border-white/15 p-5 md:p-6 rounded-3xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-base font-bold font-display text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Create Shared Watchlist
              </h4>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <p className="text-xs text-rose-300 bg-rose-950/30 border border-rose-500/20 p-2 rounded-xl">
                {createError}
              </p>
            )}

            <form onSubmit={handleCreateList} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">List Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekend Binge, Marvel Marathon 🍿"
                  className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                  value={listTitleInput}
                  onChange={(e) => setListTitleInput(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1.5">
                  Select Friend(s) to Invite
                </label>
                {friendsProfiles.length === 0 ? (
                  <div className="text-center p-3 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                    <p className="text-xs text-slate-400">You haven't added any friends yet!</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Go to Penguin Settings to add a friend using their code first.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {friendsProfiles.map((friend) => {
                      const isSelected = selectedFriendUids.includes(friend.uid);
                      return (
                        <button
                          key={friend.uid}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedFriendUids(selectedFriendUids.filter(id => id !== friend.uid));
                            } else {
                              setSelectedFriendUids([...selectedFriendUids, friend.uid]);
                            }
                          }}
                          className={`w-full p-2 rounded-xl border text-left flex items-center justify-between text-xs transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-500/20 border-indigo-400/40 text-white shadow'
                              : 'bg-white/5 border-transparent text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{friend.profilePic || '🐧'}</span>
                            <span className="font-semibold">{friend.name}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${isSelected ? 'bg-indigo-500 text-white' : 'bg-white/10 text-slate-400'}`}>
                            {isSelected ? '✓ Selected' : '+ Select'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingList || friendsProfiles.length === 0}
                  className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow cursor-pointer hover:opacity-90 active:scale-95 disabled:opacity-50"
                >
                  {creatingList ? 'Creating...' : 'Create Shared List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
