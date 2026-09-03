import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { MediaItem } from '../types';
import confetti from 'canvas-confetti';

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
  createdAt: number;
}

interface UploadContextType {
  jobs: UploadJob[];
  activeCount: number;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  startUpload: (file: File, mediaPayload: Partial<MediaItem>) => string;
  cancelUpload: (jobId: string) => void;
  clearCompleted: () => void;
  getJobForTitle: (title: string) => UploadJob | undefined;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const UploadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const xhrMapRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const speedTrackerRef = useRef<Map<string, { lastBytes: number; lastTime: number }>>(new Map());

  const activeCount = jobs.filter(j => j.status === 'uploading' || j.status === 'publishing').length;

  const cancelUpload = useCallback((jobId: string) => {
    const xhr = xhrMapRef.current.get(jobId);
    if (xhr) {
      xhr.abort();
      xhrMapRef.current.delete(jobId);
    }
    speedTrackerRef.current.delete(jobId);

    setJobs(prev => prev.filter(j => j.id !== jobId));
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status === 'uploading' || j.status === 'publishing'));
  }, []);

  const getJobForTitle = useCallback((title: string) => {
    return jobs.find(j => j.title.toLowerCase() === title.trim().toLowerCase());
  }, [jobs]);

  const startUpload = useCallback((file: File, mediaPayload: Partial<MediaItem>): string => {
    const jobId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
      mediaItemPayload: {
        ...mediaPayload,
        title: jobTitle
      },
      createdAt: Date.now()
    };

    setJobs(prev => [initialJob, ...prev]);
    // Automatically open or show the upload indicator
    setIsDrawerOpen(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', jobTitle);
    formData.append('mediaType', mediaPayload.type || 'movie');
    if (mediaPayload.description) formData.append('description', mediaPayload.description);

    const xhr = new XMLHttpRequest();
    xhrMapRef.current.set(jobId, xhr);
    speedTrackerRef.current.set(jobId, { lastBytes: 0, lastTime: Date.now() });

    // Progress handler with percentage and speed calculation
    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (!event.lengthComputable) return;

      const loaded = event.loaded;
      const total = event.total;
      const progress = Math.min(99, Math.round((loaded / total) * 100));

      const now = Date.now();
      const tracker = speedTrackerRef.current.get(jobId) || { lastBytes: 0, lastTime: now };
      const deltaBytes = loaded - tracker.lastBytes;
      const deltaTime = (now - tracker.lastTime) / 1000; // in seconds

      let speedMBs = 0;
      let timeRemainingSec = 0;

      if (deltaTime >= 0.5 && deltaBytes > 0) {
        speedMBs = parseFloat(((deltaBytes / (1024 * 1024)) / deltaTime).toFixed(1));
        const remainingBytes = total - loaded;
        if (speedMBs > 0) {
          timeRemainingSec = Math.round(remainingBytes / (speedMBs * 1024 * 1024));
        }
        speedTrackerRef.current.set(jobId, { lastBytes: loaded, lastTime: now });
      }

      setJobs(prev =>
        prev.map(j => {
          if (j.id !== jobId) return j;
          return {
            ...j,
            loadedBytes: loaded,
            progress,
            speedMBs: speedMBs > 0 ? speedMBs : j.speedMBs,
            timeRemainingSec: timeRemainingSec > 0 ? timeRemainingSec : j.timeRemainingSec
          };
        })
      );
    };

    // On Upload Complete
    xhr.onload = async () => {
      xhrMapRef.current.delete(jobId);
      speedTrackerRef.current.delete(jobId);

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const resData = JSON.parse(xhr.responseText);
          const finalStreamUrl = resData.streamUrl || resData.localStreamUrl;

          // Update status to publishing
          setJobs(prev =>
            prev.map(j => (j.id === jobId ? { ...j, progress: 100, status: 'publishing' } : j))
          );

          // Save directly to Firestore media_items so friends and uploader immediately see it!
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

          await setDoc(itemDocRef, finalDocData, { merge: true });

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

          // Trigger joyful celebration and in-app notification
          try {
            confetti({
              particleCount: 70,
              spread: 60,
              origin: { y: 0.8 }
            });
          } catch {
            // Ignore if confetti fails
          }

          window.dispatchEvent(
            new CustomEvent('penguin-in-app-notification', {
              detail: {
                title: '🎬 Movie Live in Catalog!',
                body: `"${jobTitle}" has finished uploading and is now available for you and your friends to stream!`,
                icon: '🍿',
                tag: 'Media Catalog'
              }
            })
          );
        } catch (err: any) {
          console.error('Error finalizing uploaded media document:', err);
          setJobs(prev =>
            prev.map(j =>
              j.id === jobId
                ? {
                    ...j,
                    status: 'error',
                    error: err.message || 'Failed to publish to catalog.'
                  }
                : j
            )
          );
        }
      } else {
        let errorMsg = `Server error ${xhr.status}`;
        try {
          const errData = JSON.parse(xhr.responseText);
          if (errData.error) errorMsg = errData.error;
        } catch {
          // ignore
        }
        setJobs(prev =>
          prev.map(j => (j.id === jobId ? { ...j, status: 'error', error: errorMsg } : j))
        );
      }
    };

    // On Upload Error / Abort
    xhr.onerror = () => {
      xhrMapRef.current.delete(jobId);
      speedTrackerRef.current.delete(jobId);
      setJobs(prev =>
        prev.map(j =>
          j.id === jobId
            ? { ...j, status: 'error', error: 'Network error occurred during upload.' }
            : j
        )
      );
    };

    xhr.open('POST', '/api/archive/upload', true);
    xhr.send(formData);

    return jobId;
  }, []);

  return (
    <UploadContext.Provider
      value={{
        jobs,
        activeCount,
        isDrawerOpen,
        setIsDrawerOpen,
        startUpload,
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
