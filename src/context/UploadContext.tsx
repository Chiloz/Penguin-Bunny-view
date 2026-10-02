import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, cleanForFirestore } from '../firebase';
import { MediaItem } from '../types';
import confetti from 'canvas-confetti';
import { uploadFileInChunks } from '../utils/chunkedUpload';
import { storeLocalVideo } from '../utils/localVideoStorage';

export interface UploadJob {
  id: string;
  title: string;
  fileName: string;
  fileSize: number; // in bytes
  loadedBytes: number;
  progress: number; // 0 to 100
  speedMBs: number;
  timeRemainingSec?: number;
  status: 'uploading' | 'publishing' | 'completed' | 'error';
  error?: string;
  streamUrl?: string;
  mediaItemPayload: Partial<MediaItem>;
  file?: File;
  createdAt: number;
}

interface UploadContextType {
  jobs: UploadJob[];
  activeCount: number;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  startUpload: (file: File, mediaPayload: Partial<MediaItem>) => string;
  retryUpload: (jobId: string) => void;
  convertToLocalJob: (jobId: string) => Promise<void>;
  cancelUpload: (jobId: string) => void;
  clearCompleted: () => void;
  getJobForTitle: (title: string) => UploadJob | undefined;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const activeCount = jobs.filter(j => j.status === 'uploading' || j.status === 'publishing').length;

  const cancelUpload = useCallback((jobId: string) => {
    const controller = abortControllersRef.current.get(jobId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(jobId);
    }

    setJobs(prev => prev.filter(j => j.id !== jobId));
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status === 'uploading' || j.status === 'publishing'));
  }, []);

  const getJobForTitle = useCallback((title: string) => {
    return jobs.find(j => j.title.toLowerCase() === title.trim().toLowerCase());
  }, [jobs]);

  const runUpload = useCallback((file: File, mediaPayload: Partial<MediaItem>, existingJobId?: string) => {
    const jobId = existingJobId || `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobTitle = mediaPayload.title || file.name.replace(/\.[^/.]+$/, '');

    const initialJob: UploadJob = {
      id: jobId,
      title: jobTitle,
      fileName: file.name,
      fileSize: file.size,
      loadedBytes: 0,
      progress: 0,
      speedMBs: 0,
      status: 'uploading',
      error: undefined,
      mediaItemPayload: {
        ...mediaPayload,
        title: jobTitle
      },
      file,
      createdAt: Date.now()
    };

    setJobs(prev => {
      const exists = prev.some(j => j.id === jobId);
      if (exists) {
        return prev.map(j => (j.id === jobId ? initialJob : j));
      }
      return [initialJob, ...prev];
    });

    // Automatically open the drawer so user sees active progress
    setIsDrawerOpen(true);

    const abortController = new AbortController();
    abortControllersRef.current.set(jobId, abortController);

    // Launch resilient chunked upload
    (async () => {
      try {
        const result = await uploadFileInChunks({
          file,
          uploadId: jobId,
          title: jobTitle,
          mediaType: mediaPayload.type || 'movie',
          description: mediaPayload.description,
          signal: abortController.signal,
          onProgress: (loadedBytes, totalBytes, speedMBs, etaSeconds) => {
            const progress = Math.min(99, Math.round((loadedBytes / totalBytes) * 100));
            setJobs(prev =>
              prev.map(j => {
                if (j.id !== jobId) return j;
                return {
                  ...j,
                  loadedBytes,
                  progress,
                  speedMBs: speedMBs > 0 ? speedMBs : j.speedMBs,
                  timeRemainingSec: etaSeconds > 0 ? etaSeconds : j.timeRemainingSec
                };
              })
            );
          }
        });

        abortControllersRef.current.delete(jobId);

        const finalStreamUrl = result.streamUrl || result.localStreamUrl;

        // Transition to publishing state
        setJobs(prev =>
          prev.map(j => (j.id === jobId ? { ...j, progress: 100, status: 'publishing' } : j))
        );

        // Save directly to Firestore media_items
        const itemDocRef = mediaPayload.id
          ? doc(db, 'media_items', mediaPayload.id)
          : doc(collection(db, 'media_items'));

        const finalDocData = {
          ...mediaPayload,
          id: itemDocRef.id,
          title: jobTitle,
          type: mediaPayload.type || 'movie',
          streamUrl: finalStreamUrl,
          storageProvider: 'archive_org',
          createdAt: mediaPayload.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        await setDoc(itemDocRef, cleanForFirestore(finalDocData), { merge: true });

        // Update job to completed
        setJobs(prev =>
          prev.map(j =>
            j.id === jobId
              ? {
                  ...j,
                  status: 'completed',
                  progress: 100,
                  streamUrl: finalStreamUrl
                }
              : j
          )
        );

        // Joyful celebration and notification
        try {
          confetti({
            particleCount: 70,
            spread: 60,
            origin: { y: 0.8 }
          });
        } catch {}

        window.dispatchEvent(
          new CustomEvent('penguin-in-app-notification', {
            detail: {
              title: '🎬 Movie Live in Catalog!',
              body: `"${jobTitle}" has finished uploading and is now available to stream!`,
              icon: '🍿',
              tag: 'Media Catalog'
            }
          })
        );
      } catch (err: any) {
        abortControllersRef.current.delete(jobId);
        if (err.message === 'Upload cancelled') {
          setJobs(prev => prev.filter(j => j.id !== jobId));
          return;
        }

        console.error('Upload failed:', err);
        setJobs(prev =>
          prev.map(j =>
            j.id === jobId
              ? {
                  ...j,
                  status: 'error',
                  error: err.message || 'Upload interrupted. Please try again.'
                }
              : j
          )
        );
      }
    })();

    return jobId;
  }, []);

  const startUpload = useCallback((file: File, mediaPayload: Partial<MediaItem>): string => {
    return runUpload(file, mediaPayload);
  }, [runUpload]);

  const retryUpload = useCallback((jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || !job.file) return;
    runUpload(job.file, job.mediaItemPayload, jobId);
  }, [jobs, runUpload]);

  const convertToLocalJob = useCallback(async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    try {
      if (job.file) {
        await storeLocalVideo(job.fileName, job.file);
      }

      const localStreamUrl = `local://${job.fileName}`;
      const itemDocRef = job.mediaItemPayload.id
        ? doc(db, 'media_items', job.mediaItemPayload.id)
        : doc(collection(db, 'media_items'));

      const finalDocData = {
        ...job.mediaItemPayload,
        id: itemDocRef.id,
        title: job.title,
        type: job.mediaItemPayload.type || 'movie',
        streamUrl: localStreamUrl,
        storageProvider: 'local',
        createdAt: job.mediaItemPayload.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(itemDocRef, cleanForFirestore(finalDocData), { merge: true });

      setJobs(prev =>
        prev.map(j =>
          j.id === jobId
            ? {
                ...j,
                status: 'completed',
                progress: 100,
                streamUrl: localStreamUrl,
                error: undefined
              }
            : j
        )
      );

      try {
        confetti({ particleCount: 60, spread: 50, origin: { y: 0.8 } });
      } catch {}

      window.dispatchEvent(
        new CustomEvent('penguin-in-app-notification', {
          detail: {
            title: '🎬 Instant Local Movie Published!',
            body: `"${job.title}" is ready in your catalog for synchronized watch parties!`,
            icon: '🐧',
            tag: 'Media Catalog'
          }
        })
      );
    } catch (err: any) {
      console.error('Failed to convert to local movie:', err);
    }
  }, [jobs]);

  return (
    <UploadContext.Provider
      value={{
        jobs,
        activeCount,
        isDrawerOpen,
        setIsDrawerOpen,
        startUpload,
        retryUpload,
        convertToLocalJob,
        cancelUpload,
        clearCompleted,
        getJobForTitle
      }}
    >
      {children}
    </UploadContext.Provider>
  );
};

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};
