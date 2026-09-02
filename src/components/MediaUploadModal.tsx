import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  Film, 
  Tv, 
  Sparkles, 
  Link, 
  FolderPlus, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Cloud,
  FileVideo,
  ListPlus
} from 'lucide-react';
import { UserProfile, MediaItem, MediaSeason, MediaEpisode } from '../types';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { LiquidGlassCard } from './LiquidGlassCard';

interface MediaUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  existingMediaItem?: MediaItem | null; // For adding episodes to existing series
  onSuccess?: () => void;
}

export const MediaUploadModal: React.FC<MediaUploadModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  existingMediaItem,
  onSuccess
}) => {
  // Mode: 'archive_import' (Method B) vs 'direct_upload' (Method A) vs 'direct_url' (Method C)
  const [uploadMode, setUploadMode] = useState<'archive_import' | 'direct_upload' | 'direct_url'>('archive_import');
  
  // Basic metadata
  const [mediaType, setMediaType] = useState<'movie' | 'series' | 'anime'>(
    existingMediaItem ? existingMediaItem.type : 'series'
  );
  const [title, setTitle] = useState<string>(existingMediaItem ? existingMediaItem.title : '');
  const [description, setDescription] = useState<string>(existingMediaItem ? existingMediaItem.description || '' : '');
  const [posterUrl, setPosterUrl] = useState<string>(existingMediaItem ? existingMediaItem.posterUrl || '' : '');
  const [trailerUrl, setTrailerUrl] = useState<string>(existingMediaItem ? existingMediaItem.trailerUrl || '' : '');
  const [genresInput, setGenresInput] = useState<string>(
    existingMediaItem ? (existingMediaItem.genres || []).join(', ') : 'Anime, Action'
  );
  const [releaseYear, setReleaseYear] = useState<number>(existingMediaItem?.releaseYear || 2024);
  const [audioLang, setAudioLang] = useState<string>(existingMediaItem?.audioLang || 'Japanese (Eng Sub)');
  
  // For Movies:
  const [movieStreamUrl, setMovieStreamUrl] = useState<string>(existingMediaItem?.streamUrl || '');
  const [movieDuration, setMovieDuration] = useState<number>(existingMediaItem?.duration || 110);

  // For Series / Anime: Seasons & Episodes
  const [seasons, setSeasons] = useState<MediaSeason[]>(
    existingMediaItem?.seasons || [
      {
        seasonNumber: 1,
        seasonTitle: 'Season 1',
        episodes: []
      }
    ]
  );
  const [activeSeasonIndex, setActiveSeasonIndex] = useState<number>(0);

  // Method B (Archive Inspector) State
  const [archiveUrlInput, setArchiveUrlInput] = useState<string>('');
  const [isInspectingArchive, setIsInspectingArchive] = useState<boolean>(false);
  const [archiveInspectResult, setArchiveInspectResult] = useState<any>(null);

  // Method A (Direct File Upload to Archive.org S3) State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState<string>('');
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);

  // Form submission state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  // Method B: Inspect Archive.org link
  const handleInspectArchive = async () => {
    if (!archiveUrlInput.trim()) {
      setError('Please paste a valid Archive.org item URL or ID');
      return;
    }

    setIsInspectingArchive(true);
    setError('');

    try {
      const res = await fetch('/api/archive/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlOrId: archiveUrlInput.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to inspect Archive.org link');
      }

      setArchiveInspectResult(data);

      // Auto fill title, poster, description if blank
      if (!title) setTitle(data.title || '');
      if (!description) setDescription(data.description || '');
      if (!posterUrl && data.posterUrl) setPosterUrl(data.posterUrl);
      if (data.year) setReleaseYear(data.year);

      // If movie and exactly 1 file:
      if (mediaType === 'movie' && data.files.length > 0) {
        setMovieStreamUrl(data.files[0].streamUrl);
        if (data.files[0].duration) {
          setMovieDuration(Math.round(data.files[0].duration / 60));
        }
      }

      // If series/anime: populate current season with the inspected files!
      if (mediaType !== 'movie' && data.files.length > 0) {
        const newEpisodes: MediaEpisode[] = data.files.map((f: any, idx: number) => ({
          episodeNumber: idx + 1,
          title: f.title || `Episode ${idx + 1}`,
          streamUrl: f.streamUrl,
          downloadUrl: f.downloadUrl,
          duration: f.duration ? Math.round(f.duration / 60) : undefined
        }));

        setSeasons(prev => {
          const updated = [...prev];
          if (!updated[activeSeasonIndex]) {
            updated[activeSeasonIndex] = {
              seasonNumber: activeSeasonIndex + 1,
              seasonTitle: `Season ${activeSeasonIndex + 1}`,
              episodes: []
            };
          }
          updated[activeSeasonIndex].episodes = newEpisodes;
          return updated;
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error inspecting Archive.org item');
    } finally {
      setIsInspectingArchive(false);
    }
  };

  // Method A: Direct Upload to Archive.org S3
  const handleUploadFileToArchive = async () => {
    if (!selectedFile) {
      setError('Please choose a video file to upload.');
      return;
    }

    setIsUploadingFile(true);
    setError('');
    setUploadProgressText('Connecting to Internet Archive S3...');

    try {
      const formData = new FormData();
      formData.append('videoFile', selectedFile);
      formData.append('title', episodeTitle.trim() || selectedFile.name);
      formData.append('seriesName', title.trim());
      formData.append('seasonNumber', (activeSeasonIndex + 1).toString());
      formData.append('episodeNumber', ((seasons[activeSeasonIndex]?.episodes?.length || 0) + 1).toString());
      formData.append('mediaType', mediaType);

      setUploadProgressText('Streaming file to Internet Archive unlimited storage...');

      const res = await fetch('/api/archive/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload to Archive.org failed');
      }

      setUploadProgressText('Upload complete! Streaming link generated.');

      if (mediaType === 'movie') {
        setMovieStreamUrl(data.streamUrl);
      } else {
        // Add episode to current season
        const newEp: MediaEpisode = {
          episodeNumber: (seasons[activeSeasonIndex]?.episodes?.length || 0) + 1,
          title: episodeTitle.trim() || `Episode ${(seasons[activeSeasonIndex]?.episodes?.length || 0) + 1}`,
          streamUrl: data.streamUrl,
          downloadUrl: data.downloadUrl
        };

        setSeasons(prev => {
          const updated = [...prev];
          if (!updated[activeSeasonIndex]) {
            updated[activeSeasonIndex] = {
              seasonNumber: activeSeasonIndex + 1,
              seasonTitle: `Season ${activeSeasonIndex + 1}`,
              episodes: []
            };
          }
          updated[activeSeasonIndex].episodes.push(newEp);
          return updated;
        });
      }

      setSelectedFile(null);
      setEpisodeTitle('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to upload video to Internet Archive.');
    } finally {
      setIsUploadingFile(false);
      setTimeout(() => setUploadProgressText(''), 3000);
    }
  };

  // Add empty Season
  const handleAddSeason = () => {
    const nextSeasonNum = seasons.length + 1;
    setSeasons(prev => [
      ...prev,
      {
        seasonNumber: nextSeasonNum,
        seasonTitle: `Season ${nextSeasonNum}`,
        episodes: []
      }
    ]);
    setActiveSeasonIndex(seasons.length);
  };

  // Add manual episode to current season
  const handleAddManualEpisode = () => {
    const currentEps = seasons[activeSeasonIndex]?.episodes || [];
    const newEpNum = currentEps.length + 1;
    const newEp: MediaEpisode = {
      episodeNumber: newEpNum,
      title: `Episode ${newEpNum}`,
      streamUrl: '',
      downloadUrl: ''
    };

    setSeasons(prev => {
      const updated = [...prev];
      if (!updated[activeSeasonIndex]) {
        updated[activeSeasonIndex] = {
          seasonNumber: activeSeasonIndex + 1,
          seasonTitle: `Season ${activeSeasonIndex + 1}`,
          episodes: []
        };
      }
      updated[activeSeasonIndex].episodes.push(newEp);
      return updated;
    });
  };

  const handleUpdateEpisodeField = (epIndex: number, field: keyof MediaEpisode, val: any) => {
    setSeasons(prev => {
      const updated = [...prev];
      if (updated[activeSeasonIndex]?.episodes[epIndex]) {
        updated[activeSeasonIndex].episodes[epIndex] = {
          ...updated[activeSeasonIndex].episodes[epIndex],
          [field]: val
        };
      }
      return updated;
    });
  };

  const handleRemoveEpisode = (epIndex: number) => {
    setSeasons(prev => {
      const updated = [...prev];
      if (updated[activeSeasonIndex]?.episodes) {
        updated[activeSeasonIndex].episodes.splice(epIndex, 1);
        // renumber episodes
        updated[activeSeasonIndex].episodes = updated[activeSeasonIndex].episodes.map((ep, idx) => ({
          ...ep,
          episodeNumber: idx + 1
        }));
      }
      return updated;
    });
  };

  // Save to Firestore
  const handleSaveToCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please enter a title for the media item.');
      return;
    }

    if (mediaType === 'movie' && !movieStreamUrl.trim()) {
      setError('Please provide or upload a stream URL for this movie.');
      return;
    }

    if (mediaType !== 'movie') {
      const totalEps = seasons.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);
      if (totalEps === 0) {
        setError('Please add at least one episode or import an episode list from Archive.org.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const genresArray = genresInput
        .split(',')
        .map(g => g.trim())
        .filter(Boolean);

      const mediaPayload: Partial<MediaItem> = {
        type: mediaType,
        title: title.trim(),
        description: description.trim(),
        posterUrl: posterUrl.trim(),
        backdropUrl: posterUrl.trim(),
        trailerUrl: trailerUrl.trim(),
        genres: genresArray,
        releaseYear: releaseYear || 2024,
        audioLang: mediaType === 'anime' ? audioLang : undefined,
        status: 'completed',
        uploadedByUid: currentUser.uid,
        uploadedByName: currentUser.name,
        updatedAt: serverTimestamp()
      };

      if (mediaType === 'movie') {
        mediaPayload.streamUrl = movieStreamUrl.trim();
        mediaPayload.duration = movieDuration;
      } else {
        mediaPayload.seasons = seasons;
      }

      if (existingMediaItem?.id) {
        await updateDoc(doc(db, 'media_items', existingMediaItem.id), mediaPayload);
      } else {
        mediaPayload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'media_items'), mediaPayload);
      }

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 1800);
    } catch (err: any) {
      console.error('Error saving media:', err);
      setError(err.message || 'Failed to save media item to catalog.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200 font-sans overflow-y-auto">
      <div className="w-full max-w-2xl relative my-auto">
        <LiquidGlassCard intensity="glow" className="p-5 sm:p-6 space-y-5 relative max-h-[92vh] overflow-y-auto">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4 sticky -top-5 bg-[#0e1424]/90 backdrop-blur-md z-20 pt-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-display flex items-center gap-2">
                  {existingMediaItem ? `Edit / Add Episodes: ${existingMediaItem.title}` : 'Penguin View Upload Studio'}
                </h3>
                <p className="text-xs text-slate-400">
                  Stream direct from Internet Archive unlimited cloud storage
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {saveSuccess ? (
            <div className="py-12 text-center space-y-3 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h4 className="text-base font-bold text-white font-display">
                Published to Catalog!
              </h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                "{title}" is now live in the catalog. All friends can stream it and watch in sync!
              </p>
            </div>
          ) : (
            <form onSubmit={handleSaveToCatalog} className="space-y-5">
              {error && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Media Category Picker */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'movie', label: '🎬 Movie' },
                    { id: 'series', label: '📺 TV Series' },
                    { id: 'anime', label: '⛩️ Anime' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMediaType(item.id as any)}
                      className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        mediaType === item.id
                          ? 'bg-sky-500/30 border-sky-400 text-sky-200 shadow-md'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title & Release Year */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Naruto Shippuden, Interstellar, Game of Thrones"
                    className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    min={1920}
                    max={2030}
                    className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                    value={releaseYear}
                    onChange={(e) => setReleaseYear(parseInt(e.target.value, 10))}
                  />
                </div>
              </div>

              {/* Description & Genres */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Genres (Comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Anime, Shonen, Action, Fantasy"
                    className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                    value={genresInput}
                    onChange={(e) => setGenresInput(e.target.value)}
                  />
                </div>
                {mediaType === 'anime' && (
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Audio / Subtitle Tag
                    </label>
                    <select
                      className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input bg-[#0d1322]"
                      value={audioLang}
                      onChange={(e) => setAudioLang(e.target.value)}
                    >
                      <option value="Japanese (Eng Sub)">Japanese (Eng Sub)</option>
                      <option value="English Dub">English Dub</option>
                      <option value="Dual Audio [JP/EN]">Dual Audio [JP/EN]</option>
                      <option value="Original Audio">Original Audio</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Poster Image URL & Trailer URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Poster Art URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://.../poster.jpg"
                    className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                    value={posterUrl}
                    onChange={(e) => setPosterUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Trailer Link (YouTube or MP4)
                  </label>
                  <input
                    type="text"
                    placeholder="https://www.youtube.com/watch?v=... or .mp4"
                    className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                    value={trailerUrl}
                    onChange={(e) => setTrailerUrl(e.target.value)}
                  />
                </div>
              </div>

              {/* Source Mode Switcher */}
              <div className="border-t border-white/10 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5" />
                    Select Upload or Import Method
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setUploadMode('archive_import')}
                    className={`py-2 px-2 text-[11px] font-semibold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      uploadMode === 'archive_import'
                        ? 'bg-sky-500/30 text-sky-200 border border-sky-400/30 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Link className="w-3.5 h-3.5 text-sky-400" />
                    <span>Archive.org Import</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode('direct_upload')}
                    className={`py-2 px-2 text-[11px] font-semibold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      uploadMode === 'direct_upload'
                        ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Upload to IA S3</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode('direct_url')}
                    className={`py-2 px-2 text-[11px] font-semibold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      uploadMode === 'direct_url'
                        ? 'bg-purple-500/30 text-purple-200 border border-purple-400/30 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileVideo className="w-3.5 h-3.5 text-purple-400" />
                    <span>Direct Stream URL</span>
                  </button>
                </div>

                {/* Method B: Archive.org Link Import */}
                {uploadMode === 'archive_import' && (
                  <div className="p-4 bg-sky-950/20 border border-sky-500/20 rounded-2xl space-y-3">
                    <p className="text-xs text-slate-300">
                      Paste an Archive.org item details link (e.g. <code className="text-sky-300 font-mono">https://archive.org/details/my_show</code>) or item ID. Penguin View will automatically inspect and import all videos!
                    </p>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="https://archive.org/details/identifier or identifier..."
                        className="flex-grow px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                        value={archiveUrlInput}
                        onChange={(e) => setArchiveUrlInput(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={handleInspectArchive}
                        disabled={isInspectingArchive}
                        className="px-4 py-2 bg-gradient-to-r from-sky-400 to-indigo-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isInspectingArchive ? (
                          <span className="animate-spin">⏳</span>
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>Inspect & Auto-Fill</span>
                      </button>
                    </div>

                    {archiveInspectResult && (
                      <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center justify-between">
                        <span>Found {archiveInspectResult.filesCount} video episodes! Automatically filled into {mediaType === 'movie' ? 'movie stream' : 'Season 1'}.</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                )}

                {/* Method A: Direct Upload to Archive.org */}
                {uploadMode === 'direct_upload' && (
                  <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl space-y-3">
                    <p className="text-xs text-slate-300">
                      Upload your MP4 video file directly through Penguin View. It streams directly to your Internet Archive S3 account with unlimited free storage!
                    </p>

                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Episode / Video Title (e.g. Ep 1: The Beginning)"
                        className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                        value={episodeTitle}
                        onChange={(e) => setEpisodeTitle(e.target.value)}
                      />

                      <div className="flex items-center gap-2">
                        <label className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl text-xs text-slate-200 cursor-pointer flex items-center gap-2 truncate">
                          <Upload className="w-4 h-4 text-sky-400 shrink-0" />
                          <span className="truncate">{selectedFile ? selectedFile.name : 'Choose Video (.mp4, .mkv, .webm)'}</span>
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                setSelectedFile(e.target.files[0]);
                                if (!episodeTitle) setEpisodeTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ''));
                              }
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={handleUploadFileToArchive}
                          disabled={!selectedFile || isUploadingFile}
                          className="px-5 py-2.5 bg-gradient-to-r from-sky-400 to-indigo-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {isUploadingFile ? <span className="animate-spin">⏳</span> : <Cloud className="w-4 h-4" />}
                          <span>Upload Now</span>
                        </button>
                      </div>
                    </div>

                    {uploadProgressText && (
                      <p className="text-[11px] font-mono text-sky-300 animate-pulse bg-sky-500/10 p-2 rounded-lg border border-sky-400/20">
                        {uploadProgressText}
                      </p>
                    )}
                  </div>
                )}

                {/* Method C: Direct Stream URL */}
                {uploadMode === 'direct_url' && mediaType === 'movie' && (
                  <div className="p-4 bg-purple-950/20 border border-purple-500/20 rounded-2xl space-y-2">
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Direct MP4 / HLS / Google Drive Video Link
                    </label>
                    <input
                      type="url"
                      placeholder="https://.../movie.mp4 or Drive stream link"
                      className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                      value={movieStreamUrl}
                      onChange={(e) => setMovieStreamUrl(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Seasons & Episodes Editor (For TV Series & Anime) */}
              {mediaType !== 'movie' && (
                <div className="border-t border-white/10 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
                      <FolderPlus className="w-4 h-4 text-sky-400" />
                      Seasons & Episode Folder Structure
                    </h4>

                    <button
                      type="button"
                      onClick={handleAddSeason}
                      className="text-[10px] font-semibold text-sky-300 bg-sky-500/15 hover:bg-sky-500/25 px-2.5 py-1 rounded-lg border border-sky-400/20 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add Season
                    </button>
                  </div>

                  {/* Season Tabs */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {seasons.map((season, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveSeasonIndex(idx)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                          activeSeasonIndex === idx
                            ? 'bg-sky-500/25 text-sky-200 border border-sky-400/30'
                            : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
                        }`}
                      >
                        Season {season.seasonNumber} ({season.episodes?.length || 0} eps)
                      </button>
                    ))}
                  </div>

                  {/* Current Season Episodes List */}
                  <div className="space-y-2 bg-black/30 p-3 rounded-2xl border border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400 font-semibold">
                        Episodes in Season {seasons[activeSeasonIndex]?.seasonNumber || 1}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddManualEpisode}
                        className="text-[10px] text-indigo-300 hover:text-white flex items-center gap-1 cursor-pointer font-medium"
                      >
                        <Plus className="w-3 h-3" />
                        Add Single Episode
                      </button>
                    </div>

                    {(seasons[activeSeasonIndex]?.episodes || []).length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        No episodes added yet. Use <span className="text-sky-300 font-semibold">Archive.org Import</span> or upload video files above!
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {seasons[activeSeasonIndex].episodes.map((ep, epIdx) => (
                          <div key={epIdx} className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/5 text-xs">
                            <span className="w-6 text-[10px] font-mono text-sky-400 shrink-0">
                              #{ep.episodeNumber}
                            </span>
                            <input
                              type="text"
                              placeholder="Episode Title"
                              className="w-1/3 px-2 py-1 bg-black/40 rounded-lg text-xs text-white border border-white/10"
                              value={ep.title}
                              onChange={(e) => handleUpdateEpisodeField(epIdx, 'title', e.target.value)}
                            />
                            <input
                              type="url"
                              placeholder="Stream URL (Archive.org, Drive, MP4)..."
                              className="flex-grow px-2 py-1 bg-black/40 rounded-lg text-xs text-white border border-white/10 truncate font-mono text-[11px]"
                              value={ep.streamUrl}
                              onChange={(e) => handleUpdateEpisodeField(epIdx, 'streamUrl', e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveEpisode(epIdx)}
                              className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2 sticky -bottom-5 bg-[#0e1424]/95 backdrop-blur-md pb-1 z-20">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 text-xs font-bold text-white rounded-xl bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isSaving ? (
                    <span className="animate-spin text-sm">⏳</span>
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Publish to Catalog</span>
                </button>
              </div>

            </form>
          )}

        </LiquidGlassCard>
      </div>
    </div>
  );
};
