export interface ChunkUploadOptions {
  file: File;
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
  const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let completedBytes = 0;
  let lastTrackerTime = Date.now();
  let lastTrackerBytes = 0;

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

    let attempt = 0;
    const maxRetries = 3;
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

            // If an auth redirect occurred or proxy HTML was returned, trigger a retry
            if (isHtml) {
              reject(new Error(
                xhr.status === 413
                  ? 'Chunk size exceeded proxy limits.'
                  : `Server connection refreshed (${xhr.status}). Retrying chunk...`
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
            reject(new Error('Network error during file upload. Retrying...'));
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
        if (attempt > maxRetries) {
          throw lastChunkError || new Error(`Upload failed at chunk ${chunkIndex + 1} of ${totalChunks}`);
        }
        // Exponential backoff before retry (500ms, 1000ms, 1500ms)
        await new Promise(r => setTimeout(r, 500 * attempt));
      }
    }

    if (!chunkSuccess) {
      throw lastChunkError || new Error(`Failed to upload chunk ${chunkIndex + 1} after ${maxRetries} attempts.`);
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
