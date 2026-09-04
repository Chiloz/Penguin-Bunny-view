import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Upload, 
  Film, 
  Tv, 
  Search, 
  Link, 
  FolderPlus, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Cloud,
  FileVideo,
  ListPlus,
  Image as ImageIcon,
  Video,
  Folder,
  Play,
  Check,
  ChevronDown,
  Layers,
  HelpCircle,
  FileText,
  FolderTree,
  RefreshCw,
  Info,
  HardDrive,
  ExternalLink
} from 'lucide-react';
import { UserProfile, MediaItem, MediaSeason, MediaEpisode } from '../types';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { LiquidGlassCard } from './LiquidGlassCard';
import { useUpload } from '../context/UploadContext';
import { uploadFileInChunks } from '../utils/chunkedUpload';

// Fast client-side image compressor for instant poster art uploads from device
const compressImageFile = (file: File, maxWidth = 800, maxHeight = 1200, quality = 0.85): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(reader.result as string);
        }
      };
      img.onerror = () => resolve(reader.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

export interface QueuedBatchEpisode {
  id: string;
  file: File;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  sizeMb: string;
  status: 'queued' | 'uploading' | 'completed' | 'error';
  progress?: number;
  errorMsg?: string;
  streamUrl?: string;
}

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
  
  // Poster Art State (URL or Direct Upload)
  const [posterUrl, setPosterUrl] = useState<string>(existingMediaItem ? existingMediaItem.posterUrl || '' : '');
  const [posterMode, setPosterMode] = useState<'url' | 'upload'>('url');
  const [isUploadingPoster, setIsUploadingPoster] = useState<boolean>(false);
  const [posterUploadMsg, setPosterUploadMsg] = useState<string>('');

  // Trailer State (URL or Direct Upload)
  const [trailerUrl, setTrailerUrl] = useState<string>(existingMediaItem ? existingMediaItem.trailerUrl || '' : '');
  const [trailerMode, setTrailerMode] = useState<'url' | 'upload'>('url');
  const [isUploadingTrailer, setIsUploadingTrailer] = useState<boolean>(false);
  const [trailerUploadMsg, setTrailerUploadMsg] = useState<string>('');

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
  const [previewPlayerOpen, setPreviewPlayerOpen] = useState<boolean>(false);

  // Method A (Single File Upload to Archive.org S3) State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState<string>('');
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [isUploadingFile, setIsUploadingFile] = useState<boolean>(false);

  // Multi-Select & Entire Folder Batch Upload State
  const [batchQueue, setBatchQueue] = useState<QueuedBatchEpisode[]>([]);
  const [isBatchUploading, setIsBatchUploading] = useState<boolean>(false);
  const [showFolderExplainer, setShowFolderExplainer] = useState<boolean>(false);

  // DOM Refs for file inputs
  const posterFileInputRef = useRef<HTMLInputElement>(null);
  const trailerFileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // Form submission state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Global Multi-Upload Background Queue
  const { startUpload, jobs, cancelUpload, setIsDrawerOpen } = useUpload();

  // Find if there is an active background upload job matching this movie title or file name
  const currentUploadJob = jobs.find(j => {
    const candidateTitles = [
      title.trim().toLowerCase(),
      episodeTitle.trim().toLowerCase(),
      selectedFile?.name?.replace(/\.[^/.]+$/, '').toLowerCase()
    ].filter(Boolean);
    return candidateTitles.includes(j.title.toLowerCase());
  });

  const handleStartAnotherMovie = () => {
    setSelectedFile(null);
    setTitle('');
    setEpisodeTitle('');
    setDescription('');
    setMovieStreamUrl('');
    setUploadProgressText('');
  };

  const handleStartBackgroundUpload = () => {
    if (!selectedFile) {
      setError('Please choose a video file (.mp4, .mkv, .webm) from your computer.');
      return;
    }

    const effectiveTitle = title.trim() || episodeTitle.trim() || selectedFile.name.replace(/\.[^/.]+$/, '');
    if (!title) setTitle(effectiveTitle);

    const genresArray = genresInput
      .split(',')
      .map(g => g.trim())
      .filter(Boolean);

    const mediaPayload: Partial<MediaItem> = {
      id: existingMediaItem?.id,
      type: mediaType,
      title: effectiveTitle,
      description: description.trim(),
      posterUrl: posterUrl.trim(),
      backdropUrl: posterUrl.trim(),
      trailerUrl: trailerUrl.trim(),
      genres: genresArray,
      releaseYear: releaseYear || 2024,
      duration: movieDuration,
      audioLang: mediaType === 'anime' ? audioLang : undefined,
      uploadedByUid: currentUser.uid,
      uploadedByName: currentUser.name
    };

    startUpload(selectedFile, mediaPayload);
    setIsDrawerOpen(true);
    setUploadProgressText('Upload started in background.');
  };

  // Sync state when editing existingMediaItem or opening modal
  useEffect(() => {
    if (isOpen) {
      if (existingMediaItem) {
        setMediaType(existingMediaItem.type || 'series');
        setTitle(existingMediaItem.title || '');
        setDescription(existingMediaItem.description || '');
        setPosterUrl(existingMediaItem.posterUrl || '');
        setTrailerUrl(existingMediaItem.trailerUrl || '');
        setGenresInput((existingMediaItem.genres || []).join(', ') || 'Anime, Action');
        setReleaseYear(existingMediaItem.releaseYear || 2024);
        setAudioLang(existingMediaItem.audioLang || 'Japanese (Eng Sub)');
        setMovieStreamUrl(existingMediaItem.streamUrl || '');
        setMovieDuration(existingMediaItem.duration || 110);
        setSeasons(existingMediaItem.seasons || [
          {
            seasonNumber: 1,
            seasonTitle: 'Season 1',
            episodes: []
          }
        ]);
      }
      setError('');
      setSaveSuccess(false);
    }
  }, [isOpen, existingMediaItem]);

  // Method B: Inspect Archive.org link
  const handleInspectArchive = async (overrideUrl?: string) => {
    const rawTarget = (overrideUrl !== undefined ? overrideUrl : archiveUrlInput).trim();
    if (!rawTarget) {
      setError('Please paste a valid Archive.org item URL or ID');
      return null;
    }

    setIsInspectingArchive(true);
    setError('');

    try {
      const res = await fetch('/api/archive/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlOrId: rawTarget })
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

      // If movie:
      if (mediaType === 'movie' && data.files && data.files.length > 0) {
        // Preferred stream: original file (not derivative / .ia.mp4)
        const primaryFile = data.files.find((f: any) => f.isOriginal) || data.files[0];
        setMovieStreamUrl(primaryFile.streamUrl);
        if (primaryFile.duration) {
          setMovieDuration(Math.round(primaryFile.duration / 60));
        }
      }

      // If series/anime: populate current season with the inspected files!
      if (mediaType !== 'movie' && data.files && data.files.length > 0) {
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

      return data;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error inspecting Archive.org item');
      return null;
    } finally {
      setIsInspectingArchive(false);
    }
  };

  // Debounced auto-inspection when user types or pastes an Archive.org URL
  useEffect(() => {
    if (!isOpen) return;
    const raw = archiveUrlInput.trim();
    if (!raw) return;

    // Check if it contains archive.org or is an item slug
    const looksLikeArchive = raw.includes('archive.org') || (raw.length >= 5 && !raw.includes(' ') && !raw.includes('http'));
    if (!looksLikeArchive) return;

    // Skip if already inspected this exact item
    if (archiveInspectResult && (archiveInspectResult.identifier === raw || raw.includes(archiveInspectResult.identifier))) {
      return;
    }

    const timer = setTimeout(() => {
      handleInspectArchive(raw);
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, archiveUrlInput, mediaType]);

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
      setUploadProgressText('Uploading file...');

      const data = await uploadFileInChunks({
        file: selectedFile,
        title: episodeTitle.trim() || selectedFile.name,
        seriesName: title.trim(),
        seasonNumber: activeSeasonIndex + 1,
        episodeNumber: (seasons[activeSeasonIndex]?.episodes?.length || 0) + 1,
        mediaType,
        onProgress: (loaded, total) => {
          const pct = Math.min(99, Math.round((loaded / total) * 100));
          const loadedMb = (loaded / (1024 * 1024)).toFixed(1);
          const totalMb = (total / (1024 * 1024)).toFixed(1);
          setUploadProgressText(`Uploading: ${pct}% (${loadedMb} MB / ${totalMb} MB)`);
        }
      });

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

  // Upload Poster Picture directly from Device (fast client-side compression)
  const handlePosterFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPoster(true);
    setPosterUploadMsg('Optimizing image from device...');

    try {
      const dataUrl = await compressImageFile(file);
      if (dataUrl) {
        setPosterUrl(dataUrl);
        setPosterUploadMsg('✓ Poster picture loaded and ready!');
      } else {
        throw new Error('Could not process image');
      }
    } catch (err: any) {
      console.warn('Poster local read fallback:', err);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPosterUrl(reader.result);
          setPosterUploadMsg('✓ Picture loaded from device!');
        }
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingPoster(false);
      setTimeout(() => setPosterUploadMsg(''), 4000);
    }
  };

  // Upload Trailer Video directly from Device
  const handleTrailerFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingTrailer(true);
    setTrailerUploadMsg('Uploading trailer video...');

    try {
      const data = await uploadFileInChunks({
        file,
        title: `${title || 'Media'} Official Trailer`,
        seriesName: title,
        mediaType: 'movie',
        onProgress: (loaded, total) => {
          const pct = Math.min(99, Math.round((loaded / total) * 100));
          setTrailerUploadMsg(`Uploading trailer: ${pct}%`);
        }
      });

      setTrailerUrl(data.streamUrl);
      setTrailerUploadMsg('Trailer video uploaded successfully!');
    } catch (err: any) {
      console.error('Trailer upload error:', err);
      setError(err.message || 'Failed to upload trailer video.');
    } finally {
      setIsUploadingTrailer(false);
      setTimeout(() => setTrailerUploadMsg(''), 3500);
    }
  };

  // Helper to parse filename and webkitRelativePath for Season and Episode numbers
  const parseVideoFile = (file: File, defaultEpNumber: number, defaultSeasonNumber: number) => {
    const filename = file.name;
    const path = (file as any).webkitRelativePath || filename;

    // Try to find season number in directory path or filename (e.g., Season 2, S02, s2, Season_01)
    let seasonNumber = defaultSeasonNumber;
    const seasonMatch = path.match(/(?:season|s)\s*0?(\d+)/i);
    if (seasonMatch) {
      const sNum = parseInt(seasonMatch[1], 10);
      if (!isNaN(sNum) && sNum > 0 && sNum < 100) {
        seasonNumber = sNum;
      }
    }

    // Try to find episode number (e.g., E05, Ep 5, Episode 5, #5, S01E03)
    let episodeNumber = defaultEpNumber;
    const epMatch = filename.match(/(?:episodes?|ep|e)\s*0?(\d+)/i) || filename.match(/(?:^|\D)(\d{1,3})(?:\D|$)/);
    if (epMatch) {
      const num = parseInt(epMatch[1], 10);
      if (!isNaN(num) && num > 0 && num < 2000) {
        episodeNumber = num;
      }
    }

    // Clean title for display
    let cleanTitle = filename
      .replace(/\.[^/.]+$/, '') // remove file extension
      .replace(/[._-]/g, ' ')   // replace separators with spaces
      .replace(/\s+/g, ' ')      // remove extra spaces
      .trim();

    if (/^\d+$/.test(cleanTitle)) {
      cleanTitle = `Episode ${cleanTitle}`;
    }

    const sizeMb = (file.size / (1024 * 1024)).toFixed(1) + ' MB';

    return { seasonNumber, episodeNumber, cleanTitle, sizeMb };
  };

  // Handle Multi-Select Files or Whole Folder Selection
  const handleBatchFileSelection = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const validVideoExts = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.flv', '.wmv'];
    const currentSeasonNum = seasons[activeSeasonIndex]?.seasonNumber || 1;
    const currentEpCount = seasons[activeSeasonIndex]?.episodes?.length || 0;

    const rawFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lower = file.name.toLowerCase();
      if (validVideoExts.some(ext => lower.endsWith(ext))) {
        rawFiles.push(file);
      }
    }

    if (rawFiles.length === 0) {
      setError('No valid video files (.mp4, .mkv, .webm, etc.) were found in the selected folder/files.');
      return;
    }

    // Sort files naturally by path/name (so Episode 1 comes before Episode 2, 10, etc.)
    rawFiles.sort((a, b) => {
      const pathA = (a as any).webkitRelativePath || a.name;
      const pathB = (b as any).webkitRelativePath || b.name;
      return pathA.localeCompare(pathB, undefined, { numeric: true, sensitivity: 'base' });
    });

    const newQueue: QueuedBatchEpisode[] = rawFiles.map((file, index) => {
      const parsed = parseVideoFile(file, currentEpCount + index + 1, currentSeasonNum);
      return {
        id: `${file.name}-${index}-${Date.now()}`,
        file,
        title: parsed.cleanTitle,
        seasonNumber: parsed.seasonNumber,
        episodeNumber: parsed.episodeNumber,
        sizeMb: parsed.sizeMb,
        status: 'queued'
      };
    });

    setBatchQueue(prev => [...prev, ...newQueue]);
    setError('');
  };

  // Start Batch Upload Process
  const handleStartBatchUpload = async () => {
    const queuedItems = batchQueue.filter(q => q.status === 'queued' || q.status === 'error');
    if (queuedItems.length === 0) return;

    setIsBatchUploading(true);
    setError('');
    setUploadProgressText(`Uploading ${queuedItems.length} episodes to Internet Archive S3...`);

    for (let i = 0; i < batchQueue.length; i++) {
      const item = batchQueue[i];
      if (item.status === 'completed') continue;

      setBatchQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'uploading' } : q));
      setUploadProgressText(`[${i + 1}/${batchQueue.length}] Uploading "${item.title}" (${item.sizeMb})...`);

      try {
        const data = await uploadFileInChunks({
          file: item.file,
          title: item.title,
          seriesName: title.trim() || 'Series',
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
          mediaType,
          onProgress: (loaded, total) => {
            const pct = Math.min(99, Math.round((loaded / total) * 100));
            setUploadProgressText(`[${i + 1}/${batchQueue.length}] Uploading "${item.title}": ${pct}%`);
          }
        });

        setBatchQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'completed', streamUrl: data.streamUrl } : q));

        // Insert into matching season in state
        const targetSeasonNumber = item.seasonNumber;
        const newEp: MediaEpisode = {
          episodeNumber: item.episodeNumber,
          title: item.title,
          streamUrl: data.streamUrl,
          downloadUrl: data.downloadUrl
        };

        setSeasons(prev => {
          const updated = [...prev];
          let sIdx = updated.findIndex(s => s.seasonNumber === targetSeasonNumber);
          if (sIdx === -1) {
            updated.push({
              seasonNumber: targetSeasonNumber,
              seasonTitle: `Season ${targetSeasonNumber}`,
              episodes: []
            });
            sIdx = updated.length - 1;
          }

          const existingEpIdx = updated[sIdx].episodes.findIndex(e => e.episodeNumber === item.episodeNumber);
          if (existingEpIdx !== -1) {
            updated[sIdx].episodes[existingEpIdx] = newEp;
          } else {
            updated[sIdx].episodes.push(newEp);
          }
          updated[sIdx].episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
          return updated;
        });

      } catch (err: any) {
        console.error(err);
        setBatchQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'error', errorMsg: err.message || 'Failed' } : q));
      }
    }

    setIsBatchUploading(false);
    setUploadProgressText('Batch upload finished! All episodes have been added to the season.');
    setTimeout(() => setUploadProgressText(''), 4000);
  };

  const handleRemoveFromQueue = (id: string) => {
    setBatchQueue(prev => prev.filter(q => q.id !== id));
  };

  const handleClearQueue = () => {
    setBatchQueue([]);
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

    let finalMovieStreamUrl = movieStreamUrl.trim();

    if (mediaType === 'movie') {
      if (currentUploadJob) {
        setSaveSuccess(true);
        setUploadProgressText('Uploading in background. It will show in the catalog once done.');
        setTimeout(() => {
          setSaveSuccess(false);
          if (onSuccess) onSuccess();
          onClose();
        }, 1000);
        return;
      }

      // If no stream URL was manually linked yet, but user provided an Archive.org link: auto-inspect now!
      if (!finalMovieStreamUrl && archiveUrlInput.trim()) {
        setIsSaving(true);
        setUploadProgressText('Linking Archive.org video stream...');
        const inspectData = await handleInspectArchive(archiveUrlInput.trim());
        if (inspectData && inspectData.files && inspectData.files.length > 0) {
          const primaryFile = inspectData.files.find((f: any) => f.isOriginal) || inspectData.files[0];
          finalMovieStreamUrl = primaryFile.streamUrl;
          setMovieStreamUrl(finalMovieStreamUrl);
          if (primaryFile.duration && !movieDuration) {
            setMovieDuration(Math.round(primaryFile.duration / 60));
          }
        } else {
          setIsSaving(false);
          setError('Could not locate any video streams in the provided Archive.org link. Please verify the URL or ID.');
          return;
        }
      }

      if (!finalMovieStreamUrl) {
        if (selectedFile) {
          handleStartBackgroundUpload();
          setSaveSuccess(true);
          setUploadProgressText('Upload started in background.');
          setTimeout(() => {
            setSaveSuccess(false);
            if (onSuccess) onSuccess();
            onClose();
          }, 1000);
          return;
        } else {
          setError('Please select a video file to upload, or provide an Archive.org link or stream URL.');
          return;
        }
      }
    }

    if (mediaType !== 'movie') {
      let totalEps = seasons.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);
      if (totalEps === 0 && archiveUrlInput.trim()) {
        setIsSaving(true);
        setUploadProgressText('Importing episodes from Archive.org...');
        const inspectData = await handleInspectArchive(archiveUrlInput.trim());
        if (inspectData && inspectData.files && inspectData.files.length > 0) {
          totalEps = inspectData.files.length;
        }
      }
      if (totalEps === 0) {
        setError('Please add at least one episode or import an episode list from Archive.org.');
        setIsSaving(false);
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
        mediaPayload.streamUrl = finalMovieStreamUrl;
        mediaPayload.storageProvider = finalMovieStreamUrl.startsWith('local://') ? 'direct_url' : 'archive_org';
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

  if (!isOpen) return null;

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

              {/* Poster Image URL & Trailer URL with Dual Mode (Link or Device Upload) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/[0.02] p-3 sm:p-4 rounded-2xl border border-white/5">
                
                {/* Poster Art Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                      <span>Poster Art</span>
                    </label>
                    
                    {/* Mode Toggle */}
                    <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/10">
                      <button
                        type="button"
                        onClick={() => setPosterMode('url')}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all cursor-pointer ${
                          posterMode === 'url' ? 'bg-sky-500/30 text-sky-200 shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Link URL
                      </button>
                      <button
                        type="button"
                        onClick={() => setPosterMode('upload')}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all cursor-pointer ${
                          posterMode === 'upload' ? 'bg-sky-500/30 text-sky-200 shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Upload Picture
                      </button>
                    </div>
                  </div>

                  {posterMode === 'url' ? (
                    <input
                      type="url"
                      placeholder="https://.../poster.jpg"
                      className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                      value={posterUrl}
                      onChange={(e) => setPosterUrl(e.target.value)}
                    />
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="file"
                        ref={posterFileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={handlePosterFileSelect}
                      />
                      <button
                        type="button"
                        disabled={isUploadingPoster}
                        onClick={() => posterFileInputRef.current?.click()}
                        className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-dashed border-sky-400/30 rounded-xl text-xs text-slate-300 hover:text-white flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                      >
                        {isUploadingPoster ? (
                          <>
                            <span className="animate-spin text-sky-400">⏳</span>
                            <span className="text-sky-300">Uploading picture...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 text-sky-400" />
                            <span>Choose Image from Device</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {posterUploadMsg && (
                    <p className="text-[10px] text-sky-300 font-mono animate-fade-in">
                      {posterUploadMsg}
                    </p>
                  )}

                  {posterUrl && (
                    <div className="flex items-center gap-2.5 p-1.5 bg-black/40 rounded-xl border border-white/10">
                      <img
                        src={posterUrl}
                        alt="Poster Preview"
                        className="w-8 h-11 object-cover rounded-lg border border-white/10 shrink-0"
                        onError={(e) => { (e.target as any).style.display = 'none'; }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-200 truncate font-mono">{posterUrl}</p>
                        <p className="text-[9px] text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Ready for display
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPosterUrl('')}
                        className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Remove poster"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Trailer Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Trailer</span>
                    </label>

                    {/* Mode Toggle */}
                    <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/10">
                      <button
                        type="button"
                        onClick={() => setTrailerMode('url')}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all cursor-pointer ${
                          trailerMode === 'url' ? 'bg-indigo-500/30 text-indigo-200 shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Link URL
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrailerMode('upload')}
                        className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-all cursor-pointer ${
                          trailerMode === 'upload' ? 'bg-indigo-500/30 text-indigo-200 shadow' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Upload Video
                      </button>
                    </div>
                  </div>

                  {trailerMode === 'url' ? (
                    <input
                      type="text"
                      placeholder="https://www.youtube.com/watch?v=... or .mp4"
                      className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                      value={trailerUrl}
                      onChange={(e) => setTrailerUrl(e.target.value)}
                    />
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="file"
                        ref={trailerFileInputRef}
                        accept="video/*"
                        className="hidden"
                        onChange={handleTrailerFileSelect}
                      />
                      <button
                        type="button"
                        disabled={isUploadingTrailer}
                        onClick={() => trailerFileInputRef.current?.click()}
                        className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-dashed border-indigo-400/30 rounded-xl text-xs text-slate-300 hover:text-white flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                      >
                        {isUploadingTrailer ? (
                          <>
                            <span className="animate-spin text-indigo-400">⏳</span>
                            <span className="text-indigo-300">Uploading trailer...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Choose Video from Device</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {trailerUploadMsg && (
                    <p className="text-[10px] text-indigo-300 font-mono animate-fade-in">
                      {trailerUploadMsg}
                    </p>
                  )}

                  {trailerUrl && (
                    <div className="flex items-center gap-2 p-1.5 bg-black/40 rounded-xl border border-white/10">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                        <Play className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-slate-200 truncate font-mono">{trailerUrl}</p>
                        <p className="text-[9px] text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Trailer linked
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTrailerUrl('')}
                        className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Remove trailer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

              </div>

              {/* Source Mode Switcher */}
              <div className="border-t border-white/10 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5" />
                    Select Video Source or Import Method
                  </span>
                  {mediaType === 'movie' && movieStreamUrl && (
                    <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Stream Configured
                    </span>
                  )}
                </div>

                {/* Active movie stream banner */}
                {mediaType === 'movie' && movieStreamUrl && (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                        {movieStreamUrl.startsWith('local://') ? (
                          <HardDrive className="w-4 h-4 text-emerald-300" />
                        ) : (
                          <Film className="w-4 h-4 text-emerald-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white">
                          {movieStreamUrl.startsWith('local://') ? 'Local Device Video Linked' : 'Cloud Stream Link Active'}
                        </p>
                        <p className="text-[11px] text-emerald-300/80 font-mono truncate">
                          {movieStreamUrl.startsWith('local://') ? movieStreamUrl.replace('local://', '') : movieStreamUrl}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMovieStreamUrl('')}
                      className="px-2 py-1 text-[10px] text-slate-400 hover:text-rose-300 rounded-lg bg-white/5 border border-white/10 hover:border-rose-400/30 transition-colors shrink-0 cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
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
                    <span>Upload / Local File</span>
                  </button>
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
                    <span>Archive.org Link</span>
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
                    <span>Direct Web URL</span>
                  </button>
                </div>

                {/* Method A: Device / Local Video File or S3 Upload */}
                {uploadMode === 'direct_upload' && (
                  <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl space-y-3">
                    <p className="text-xs text-slate-300">
                      Choose a movie video file from your computer (.mp4, .mkv, .webm). You can upload it with real-time percentage tracking, or link it instantly as a local movie.
                    </p>

                    {/* If this movie is actively uploading in the background queue */}
                    {currentUploadJob ? (
                      <div className="p-4 bg-[#0c1322]/90 border border-sky-400/30 rounded-2xl space-y-3 shadow-xl backdrop-blur-md">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                            <h4 className="text-xs font-bold text-white">
                              {currentUploadJob.status === 'completed'
                                ? '✓ Upload Complete & Ready to Stream'
                                : currentUploadJob.status === 'publishing'
                                ? 'Finalizing & Publishing to Catalog...'
                                : 'Uploading Movie in Background'}
                            </h4>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-sky-300 bg-sky-500/20 px-2.5 py-0.5 rounded-full border border-sky-400/30">
                              {currentUploadJob.progress}%
                            </span>
                            {currentUploadJob.status === 'uploading' && (
                              <button
                                type="button"
                                onClick={() => cancelUpload(currentUploadJob.id)}
                                className="text-[10px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-0.5 rounded-lg border border-rose-500/20 cursor-pointer"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Large Percentage & Progress Bar */}
                        <div className="space-y-1.5">
                          <div className="w-full h-3.5 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/10 relative">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                currentUploadJob.status === 'completed'
                                  ? 'bg-gradient-to-r from-emerald-400 to-teal-500'
                                  : currentUploadJob.status === 'error'
                                  ? 'bg-rose-500'
                                  : 'bg-gradient-to-r from-sky-400 via-indigo-500 to-cyan-400 animate-pulse'
                              }`}
                              style={{ width: `${currentUploadJob.progress}%` }}
                            />
                          </div>

                          {/* Stats Grid */}
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                            <span>
                              {(currentUploadJob.loadedBytes / (1024 * 1024)).toFixed(1)} MB / {(currentUploadJob.fileSize / (1024 * 1024)).toFixed(1)} MB
                            </span>
                            {currentUploadJob.status === 'uploading' && (
                              <span className="text-sky-300">
                                {currentUploadJob.speedMBs > 0 ? `${currentUploadJob.speedMBs} MB/s` : 'Starting...'}
                                {currentUploadJob.timeRemainingSec ? ` • ~${currentUploadJob.timeRemainingSec}s left` : ''}
                              </span>
                            )}
                            {currentUploadJob.status === 'completed' && (
                              <span className="text-emerald-400 font-sans font-medium">
                                Published to Catalog!
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Background Helper Explainer */}
                        <div className="px-3 py-2 bg-sky-500/10 border border-sky-400/20 rounded-xl text-xs text-sky-200">
                          <p className="font-semibold flex items-center gap-1.5">
                            <span>🏋🏾‍♂️</span>
                            <span>Multi-Tasking Background Active</span>
                          </p>
                        </div>

                        {/* Multi-upload buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleStartAnotherMovie}
                            className="flex-1 py-2 px-3 bg-gradient-to-r from-sky-500/30 to-indigo-500/30 hover:from-sky-500/40 hover:to-indigo-500/40 border border-sky-400/40 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5 text-sky-300" />
                            <span>Upload Another Movie</span>
                          </button>

                          <button
                            type="button"
                            onClick={onClose}
                            className="py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-medium text-xs rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-all"
                          >
                            <span>Minimize Window</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* If not currently uploading, show file selection and upload buttons */
                      <div className="space-y-2.5">
                        <input
                          type="text"
                          placeholder="Video Title (e.g. Full Movie)"
                          className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input"
                          value={episodeTitle}
                          onChange={(e) => setEpisodeTitle(e.target.value)}
                        />

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <label className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/15 rounded-xl text-xs text-slate-200 cursor-pointer flex items-center gap-2 truncate">
                            <Upload className="w-4 h-4 text-sky-400 shrink-0" />
                            <span className="truncate">
                              {selectedFile ? `${selectedFile.name} (${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB)` : 'Choose Movie Video (.mp4, .mkv, .webm)'}
                            </span>
                            <input
                              type="file"
                              accept="video/*"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  const f = e.target.files[0];
                                  setSelectedFile(f);
                                  if (!episodeTitle) setEpisodeTitle(f.name.replace(/\.[^/.]+$/, ''));
                                  if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''));
                                }
                              }}
                            />
                          </label>

                          {selectedFile && mediaType === 'movie' && (
                            <button
                              type="button"
                              onClick={() => {
                                setMovieStreamUrl(`local://${selectedFile.name}`);
                                setUploadProgressText('✓ Linked as Local Movie! Click "Publish to Catalog" below to save.');
                              }}
                              className="px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                              title="Instant playback without uploading gigabytes of data"
                            >
                              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Instant Local Link</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={handleStartBackgroundUpload}
                            disabled={!selectedFile}
                            className="px-4 py-2.5 bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-sky-500/20"
                          >
                            <Cloud className="w-3.5 h-3.5 text-sky-200" />
                            <span>Upload Movie (Live %)</span>
                          </button>
                        </div>

                        {selectedFile && (
                          <div className="p-2.5 bg-sky-500/10 border border-sky-400/20 rounded-xl text-[11px] text-sky-200 flex items-start gap-2">
                            <Info className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
                            <span>
                              Uploads continue in the background if you close this or navigate away.
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {uploadProgressText && (
                      <p className="text-[11px] font-mono text-sky-300 animate-pulse bg-sky-500/10 p-2 rounded-lg border border-sky-400/20">
                        {uploadProgressText}
                      </p>
                    )}
                  </div>
                )}

                {/* Method B: Archive.org Link Import */}
                {uploadMode === 'archive_import' && (
                  <div className="p-4 bg-sky-950/20 border border-sky-500/20 rounded-2xl space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-200 font-medium">
                          Archive.org Item Details Link or Identifier
                        </p>
                        <a 
                          href="https://archive.org" 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
                        >
                          <span>Browse Archive.org</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Paste the details link (e.g. <code className="text-sky-300 font-mono">https://archive.org/details/supergirl-480-p</code>) or identifier. Penguin View inspects the files and links the video stream automatically!
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative flex-grow">
                        <input
                          type="text"
                          placeholder="https://archive.org/details/supergirl-480-p or item-id..."
                          className="w-full px-3 py-2 text-xs text-slate-100 liquid-glass-input pr-8"
                          value={archiveUrlInput}
                          onChange={(e) => setArchiveUrlInput(e.target.value)}
                        />
                        {isInspectingArchive && (
                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                            <span className="animate-spin inline-block text-xs">⏳</span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInspectArchive()}
                        disabled={isInspectingArchive || !archiveUrlInput.trim()}
                        className="px-4 py-2 bg-gradient-to-r from-sky-400 to-indigo-600 hover:from-sky-300 hover:to-indigo-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-md shadow-sky-500/20 shrink-0"
                      >
                        {isInspectingArchive ? (
                          <span className="animate-spin text-xs">⏳</span>
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        <span>{isInspectingArchive ? 'Inspecting...' : 'Inspect & Auto-Fill'}</span>
                      </button>
                    </div>

                    {isInspectingArchive && (
                      <div className="p-3 bg-sky-950/40 border border-sky-400/30 rounded-xl text-sky-300 text-xs flex items-center gap-2 animate-pulse">
                        <span className="animate-spin text-sm">⏳</span>
                        <span>Inspecting Archive.org metadata and searching for video files...</span>
                      </div>
                    )}

                    {archiveInspectResult && (
                      <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-emerald-200 text-xs space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span>Found {archiveInspectResult.filesCount} video file{archiveInspectResult.filesCount === 1 ? '' : 's'} for "{archiveInspectResult.title}"</span>
                            </div>
                            <p className="text-[11px] text-slate-300">
                              Identifier: <span className="font-mono text-emerald-300">{archiveInspectResult.identifier}</span>
                            </p>
                          </div>

                          <a
                            href={`https://archive.org/details/${archiveInspectResult.identifier}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 shrink-0 bg-white/5 hover:bg-white/10 px-2 py-1 rounded-lg border border-white/10"
                          >
                            <span>Open on Archive</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>

                        {/* If movie: Show stream file selection and preview */}
                        {mediaType === 'movie' && archiveInspectResult.files && archiveInspectResult.files.length > 0 && (
                          <div className="pt-2 border-t border-emerald-500/20 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-slate-200">
                                Active Video Stream ({archiveInspectResult.files.length} available):
                              </span>
                              <button
                                type="button"
                                onClick={() => setPreviewPlayerOpen(!previewPlayerOpen)}
                                className="text-[11px] text-sky-300 hover:text-sky-200 flex items-center gap-1 cursor-pointer bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/20 px-2 py-0.5 rounded-md"
                              >
                                <Play className="w-3 h-3 text-sky-400" />
                                <span>{previewPlayerOpen ? 'Hide Preview' : 'Test Playback'}</span>
                              </button>
                            </div>

                            {/* Stream File Pills */}
                            <div className="flex flex-wrap gap-1.5">
                              {archiveInspectResult.files.map((file: any) => {
                                const isSelected = movieStreamUrl === file.streamUrl;
                                const sizeMb = file.sizeBytes ? (file.sizeBytes / (1024 * 1024)).toFixed(1) + ' MB' : '';
                                return (
                                  <button
                                    key={file.name}
                                    type="button"
                                    onClick={() => {
                                      setMovieStreamUrl(file.streamUrl);
                                      if (file.duration) setMovieDuration(Math.round(file.duration / 60));
                                    }}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition-all border ${
                                      isSelected
                                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 shadow-sm shadow-emerald-500/30'
                                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                                    }`}
                                  >
                                    <Film className="w-3 h-3 text-emerald-400 shrink-0" />
                                    <span className="truncate max-w-[220px]">{file.name}</span>
                                    {sizeMb && <span className="text-[10px] text-slate-400">({sizeMb})</span>}
                                    {file.isOriginal && (
                                      <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1 py-0.2 rounded font-sans">
                                        Original Master
                                      </span>
                                    )}
                                    {isSelected && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Optional In-Modal Test Preview */}
                            {previewPlayerOpen && movieStreamUrl && (
                              <div className="mt-2 rounded-xl overflow-hidden border border-emerald-400/30 bg-black/60 p-2">
                                <p className="text-[10px] text-slate-400 mb-1 flex items-center justify-between">
                                  <span>Testing stream:</span>
                                  <span className="font-mono text-emerald-400 truncate max-w-[240px]">{movieStreamUrl}</span>
                                </p>
                                <video
                                  src={movieStreamUrl}
                                  controls
                                  className="w-full max-h-56 rounded-lg bg-black"
                                  preload="metadata"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {mediaType !== 'movie' && (
                          <div className="pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-300">
                            ✓ {archiveInspectResult.filesCount} episodes populated into {seasons[activeSeasonIndex]?.seasonTitle || 'Season 1'}. You can review each episode below.
                          </div>
                        )}
                      </div>
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
                <div className="border-t border-white/10 pt-4 space-y-4">
                  {/* Header & Folder Structure Explanation Toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
                        <FolderPlus className="w-4 h-4 text-sky-400" />
                        Seasons & Episode Structure
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Upload multi-episodes or entire folders without uploading one by one.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowFolderExplainer(!showFolderExplainer)}
                        className="text-[10px] text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1 rounded-lg border border-sky-400/20 transition-all cursor-pointer flex items-center gap-1"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>How Folder Structure Works</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleAddSeason}
                        className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 rounded-lg border border-emerald-400/20 transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Season
                      </button>
                    </div>
                  </div>

                  {/* Folder Structure Explainer Panel */}
                  {showFolderExplainer && (
                    <div className="p-3.5 bg-sky-950/40 border border-sky-400/30 rounded-2xl text-xs space-y-2 text-slate-200 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sky-300 flex items-center gap-1.5 text-xs font-mono">
                          <Info className="w-4 h-4 text-sky-400" />
                          How Season & Episode Folders Work in Penguin View
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowFolderExplainer(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
                        <p>
                          • <strong>Hierarchical Structure:</strong> Shows are organized as <code>Series ➔ Season Folders ➔ Episode Videos</code>.
                        </p>
                        <p>
                          • <strong>No more uploading one-by-one!</strong> You can click <span className="text-sky-300 font-semibold">"Upload Whole Folder"</span> or <span className="text-indigo-300 font-semibold">"Multi-Select Episodes"</span> below.
                        </p>
                        <p>
                          • <strong>Smart Auto-Detection:</strong> Penguin View reads your file names (like <code>S01E03.mp4</code>, <code>Episode 5.mkv</code>, or <code>Season 2/Ep 10.webm</code>), detects the correct season & episode numbers, and organizes them automatically in sequence!
                        </p>
                        <p>
                          • <strong>Cloud Storage:</strong> When you click "Start Batch Upload", files stream seamlessly to Internet Archive S3, generating permanent streaming and download links.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Multi-Select & Folder Upload Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white/[0.03] p-2.5 rounded-2xl border border-white/10">
                    {/* Hidden Inputs */}
                    <input
                      type="file"
                      ref={folderInputRef}
                      {...({ webkitdirectory: '', directory: '' } as any)}
                      multiple
                      className="hidden"
                      onChange={(e) => handleBatchFileSelection(e.target.files)}
                    />
                    <input
                      type="file"
                      ref={multiFileInputRef}
                      multiple
                      accept="video/*,.mkv,.mp4,.webm,.avi,.mov,.flv,.wmv"
                      className="hidden"
                      onChange={(e) => handleBatchFileSelection(e.target.files)}
                    />

                    {/* Folder Button */}
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="p-3 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/30 rounded-xl text-left flex items-center gap-3 transition-all cursor-pointer group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <FolderTree className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-sky-200">Upload Whole Folder</p>
                        <p className="text-[10px] text-slate-400">Select a folder with season video files</p>
                      </div>
                    </button>

                    {/* Multi-Select Button */}
                    <button
                      type="button"
                      onClick={() => multiFileInputRef.current?.click()}
                      className="p-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-left flex items-center gap-3 transition-all cursor-pointer group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-indigo-200">Multi-Select Episodes</p>
                        <p className="text-[10px] text-slate-400">Select multiple .mp4 / .mkv files at once</p>
                      </div>
                    </button>
                  </div>

                  {/* Batch Upload Queue Card (when files are selected) */}
                  {batchQueue.length > 0 && (
                    <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-indigo-400" />
                            Batch Queue: {batchQueue.length} Episodes Selected
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/20">
                            {batchQueue.filter(b => b.status === 'completed').length}/{batchQueue.length} done
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBatchUploading}
                            onClick={handleClearQueue}
                            className="text-[10px] text-slate-400 hover:text-rose-400 cursor-pointer disabled:opacity-50"
                          >
                            Clear Queue
                          </button>
                          <button
                            type="button"
                            disabled={isBatchUploading || batchQueue.every(b => b.status === 'completed')}
                            onClick={handleStartBatchUpload}
                            className="px-3 py-1.5 bg-gradient-to-r from-sky-400 to-indigo-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow disabled:opacity-50"
                          >
                            {isBatchUploading ? (
                              <>
                                <span className="animate-spin text-xs">⏳</span>
                                <span>Uploading...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5" />
                                <span>Start Batch Upload</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Queue Item List */}
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {batchQueue.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-xl bg-black/40 border border-white/5 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-16 text-[10px] font-mono text-sky-400 shrink-0">
                                S{item.seasonNumber} : E{item.episodeNumber}
                              </span>
                              <span className="text-slate-200 truncate font-medium">{item.title}</span>
                              <span className="text-[10px] text-slate-400 font-mono shrink-0">({item.sizeMb})</span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.status === 'queued' && (
                                <span className="text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded-md">Queued</span>
                              )}
                              {item.status === 'uploading' && (
                                <span className="text-[10px] text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                                  <span className="animate-spin">⏳</span> Uploading...
                                </span>
                              )}
                              {item.status === 'completed' && (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Added to Season
                                </span>
                              )}
                              {item.status === 'error' && (
                                <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> Failed
                                </span>
                              )}
                              {!isBatchUploading && item.status !== 'uploading' && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromQueue(item.id)}
                                  className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => multiFileInputRef.current?.click()}
                          className="text-[10px] text-sky-300 hover:text-white flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Layers className="w-3 h-3" />
                          Multi-Select
                        </button>
                        <span className="text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={handleAddManualEpisode}
                          className="text-[10px] text-indigo-300 hover:text-white flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Plus className="w-3 h-3" />
                          Add Single Episode
                        </button>
                      </div>
                    </div>

                    {(seasons[activeSeasonIndex]?.episodes || []).length === 0 ? (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        No episodes added yet. Click <span className="text-sky-300 font-semibold cursor-pointer" onClick={() => folderInputRef.current?.click()}>"Upload Whole Folder"</span> or <span className="text-indigo-300 font-semibold cursor-pointer" onClick={() => multiFileInputRef.current?.click()}>"Multi-Select Episodes"</span> above!
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {(seasons[activeSeasonIndex]?.episodes || []).map((ep, epIdx) => (
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
              <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sticky -bottom-5 bg-[#0e1424]/95 backdrop-blur-md pb-1 z-20">
                <div className="text-left">
                  {mediaType === 'movie' && (
                    movieStreamUrl ? (
                      <span className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Ready: {
                          movieStreamUrl.startsWith('local://') 
                            ? `Local Movie (${movieStreamUrl.replace('local://', '')})` 
                            : movieStreamUrl.includes('archive.org')
                            ? `Archive.org Stream Linked (${decodeURIComponent(movieStreamUrl.split('/').pop() || 'Video')})`
                            : 'Cloud Stream Link'
                        }</span>
                      </span>
                    ) : isInspectingArchive ? (
                      <span className="text-[11px] text-sky-300 bg-sky-500/10 border border-sky-400/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                        <span className="animate-spin text-xs">⏳</span>
                        <span>Inspecting Archive.org stream...</span>
                      </span>
                    ) : archiveUrlInput.trim() ? (
                      <span className="text-[11px] text-sky-300 bg-sky-500/10 border border-sky-400/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                        <Cloud className="w-3.5 h-3.5 text-sky-400" />
                        <span>Archive.org link ready (will auto-link on publish)</span>
                      </span>
                    ) : selectedFile ? (
                      <span className="text-[11px] text-sky-300 bg-sky-500/10 border border-sky-400/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                        <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                        <span>Will link selected video: {selectedFile.name}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Please choose a video file or stream URL</span>
                      </span>
                    )
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 shrink-0">
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
              </div>

            </form>
          )}

        </LiquidGlassCard>
      </div>
    </div>
  );
};
