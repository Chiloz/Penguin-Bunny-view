export interface ChunkUploadOptions {
  file: File;
  uploadId?: string;
  title?: string;
  mediaType?: string;
  seriesName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  description?: string;
  onProgress?: (loadedBytes: number, totalBytes: number, speedMBs: number, etaSeconds: number) => void;
  onXhrCreated?: (xhr: XMLHttpRequest) => void;
  signal?: AbortSignal;
}

export interface ChunkUploadResult {
  success: boolean;
  filename: string;
  originalName: string;
  size: number;
  streamUrl: string;
  localStreamUrl: string;
  downloadUrl?: string;
  archiveStreamUrl: string | null;
  isImage: boolean;
  mediaType: string;
  seasonNumber: number;
  episodeNumber: number;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk (fast transmission, well within proxy limits)

export async function uploadFileInChunks(options: ChunkUploadOptions): Promise<ChunkUploadResult> {
  const {
    file,
    title = file.name.replace(/\.[^/.]+$/, ''),
    mediaType = 'movie',
    seriesName,
    seasonNumber,
    episodeNumber,
    description,
    onProgress,
    onXhrCreated,
    signal
  } = options;

  const totalSize = file.size;
  const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
  const safeFileId = file.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  const uploadId = options.uploadId || `up_${safeFileId}_${file.size}_${file.lastModified || Date.now()}`;

  // Check if server already has partially uploaded chunks for instant resumption
  let alreadyReceived = new Set<number>();
  try {
    const statusRes = await fetch(`/api/archive/upload-status/${uploadId}`, { credentials: 'include' });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      if (Array.isArray(statusData.receivedChunks)) {
        alreadyReceived = new Set(statusData.receivedChunks);
      }
    }
  } catch {}

  let completedBytes = 0;
  for (const idx of alreadyReceived) {
    if (idx < totalChunks - 1) {
      completedBytes += CHUNK_SIZE;
    }
  }

  let lastTrackerTime = Date.now();
  let lastTrackerBytes = completedBytes;

  if (completedBytes > 0 && onProgress) {
    onProgress(completedBytes, totalSize, 0, 0);
  }

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    if (signal?.aborted) {
      // Notify server to clean up partial chunks
      try {
        fetch(`/api/archive/upload-chunk/${uploadId}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
      } catch {}
      throw new Error('Upload cancelled');
    }

    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const chunkBlob = file.slice(start, end);

    // Skip chunk if already received by server (except the last chunk which triggers assembly)
    if (alreadyReceived.has(chunkIndex) && chunkIndex < totalChunks - 1) {
      continue;
    }

    let attempt = 0;
    const maxRetries = 6;
    let chunkSuccess = false;
    let finalChunkResponse: ChunkUploadResult | null = null;
    let lastChunkError: Error | null = null;

    while (attempt <= maxRetries && !chunkSuccess) {
      attempt++;
      try {
        const resData = await new Promise<any>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new Error('Upload cancelled'));
            return;
          }

          const formData = new FormData();
          formData.append('chunk', chunkBlob, file.name);
          formData.append('uploadId', uploadId);
          formData.append('chunkIndex', chunkIndex.toString());
          formData.append('totalChunks', totalChunks.toString());
          formData.append('fileName', file.name);
          formData.append('fileSize', totalSize.toString());
          formData.append('title', title);
          formData.append('mediaType', mediaType);
          if (seriesName) formData.append('seriesName', seriesName);
          if (seasonNumber) formData.append('seasonNumber', seasonNumber.toString());
          if (episodeNumber) formData.append('episodeNumber', episodeNumber.toString());
          if (description) formData.append('description', description);

          const xhr = new XMLHttpRequest();
          // Critical for Cloud Run / iframe authentication cookies
          xhr.withCredentials = true;
          xhr.timeout = 45000; // 45 second timeout per 5MB chunk

          if (onXhrCreated) onXhrCreated(xhr);

          if (signal) {
            signal.addEventListener('abort', () => {
              try { xhr.abort(); } catch {}
              reject(new Error('Upload cancelled'));
            });
          }

          xhr.upload.onprogress = (event: ProgressEvent) => {
            if (!event.lengthComputable) return;
            const currentTotalLoaded = completedBytes + event.loaded;
            const now = Date.now();
            const deltaTime = (now - lastTrackerTime) / 1000;
            const deltaBytes = currentTotalLoaded - lastTrackerBytes;

            let speedMBs = 0;
            let etaSec = 0;

            if (deltaTime >= 0.3 && deltaBytes > 0) {
              speedMBs = parseFloat(((deltaBytes / (1024 * 1024)) / deltaTime).toFixed(1));
              const remainingBytes = totalSize - currentTotalLoaded;
              if (speedMBs > 0) {
                etaSec = Math.round(remainingBytes / (speedMBs * 1024 * 1024));
              }
              lastTrackerTime = now;
              lastTrackerBytes = currentTotalLoaded;
            }

            if (onProgress) {
              onProgress(currentTotalLoaded, totalSize, speedMBs, etaSec);
            }
          };

          xhr.onload = () => {
            const rawText = xhr.responseText || '';
            const isHtml = rawText.trim().startsWith('<') || rawText.includes('<!DOCTYPE') || rawText.includes('<html>');

            // If an auth redirect occurred or proxy HTML was returned (e.g. during server restart or cloud proxy reload)
            if (isHtml) {
              reject(new Error(
                xhr.status === 413
                  ? 'Chunk size exceeded proxy limits.'
                  : `Server connection restarting or proxy reload (${xhr.status}).`
              ));
              return;
            }

            if (xhr.status < 200 || xhr.status >= 300) {
              let errorDetail = `Upload error (${xhr.status})`;
              try {
                const parsed = JSON.parse(rawText);
                if (parsed.error) errorDetail = parsed.error;
              } catch {}
              reject(new Error(errorDetail));
              return;
            }

            try {
              const parsed = JSON.parse(rawText);
              resolve(parsed);
            } catch (err: any) {
              reject(new Error('Invalid response from server during chunk upload.'));
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network connection error during upload.'));
          };

          xhr.ontimeout = () => {
            reject(new Error('Upload chunk request timed out.'));
          };

          xhr.onabort = () => {
            reject(new Error('Upload cancelled'));
          };

          xhr.open('POST', '/api/archive/upload-chunk', true);
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send(formData);
        });

        chunkSuccess = true;
        if (chunkIndex === totalChunks - 1) {
          finalChunkResponse = resData;
        }
      } catch (err: any) {
        lastChunkError = err;
        if (signal?.aborted || err.message === 'Upload cancelled') {
          throw err;
        }

        if (attempt <= maxRetries) {
          // Adaptive backoff: 1s, 2s, 3s, 5s, 7s, 10s (gives 28s total window for server to recover)
          const delays = [1000, 2000, 3000, 5000, 7000, 10000];
          const delayMs = delays[attempt - 1] || 10000;
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }

    if (!chunkSuccess) {
      let userMsg = lastChunkError?.message || `Failed to upload chunk ${chunkIndex + 1} after ${maxRetries} attempts.`;
      if (userMsg.includes('Server connection restarting') || userMsg.includes('(200)')) {
        userMsg = 'Upload paused (server connection reset or restarted). Click Retry to continue.';
      }
      throw new Error(userMsg);
    }

    completedBytes += (end - start);
    if (onProgress) {
      onProgress(completedBytes, totalSize, 0, 0);
    }

    if (chunkIndex === totalChunks - 1 && finalChunkResponse) {
      return finalChunkResponse;
    }
  }

  throw new Error('Upload finished without final confirmation from server.');
}
