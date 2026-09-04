import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Setup uploads directory on disk
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Temporary directory for chunked uploads
const CHUNKS_TEMP_DIR = path.join(UPLOADS_DIR, 'temp_chunks');
if (!fs.existsSync(CHUNKS_TEMP_DIR)) {
  fs.mkdirSync(CHUNKS_TEMP_DIR, { recursive: true });
}

// Default archive keys provided for instant usability, overridden by env if present
const ARCHIVE_ACCESS_KEY = process.env.ARCHIVE_S3_ACCESS_KEY || 'XgsBgjpbB8qhGCak';
const ARCHIVE_SECRET_KEY = process.env.ARCHIVE_S3_SECRET_KEY || 's0pBbUEfuqXG1crR';

// Middleware for parsing JSON and urlencoded data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Setup multer disk storage for high performance streaming video uploads
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniquePrefix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    cb(null, `${uniquePrefix}_${cleanName}`);
  }
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 1024 * 1024 * 1024 * 5 } // 5GB limit
});

// Setup multer for individual chunks (8-16MB per chunk, well within nginx 32MB limit)
const chunkStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, CHUNKS_TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    cb(null, `chunk_${unique}.part`);
  }
});

const chunkUpload = multer({
  storage: chunkStorage,
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB max per chunk
});

// API Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Guard API chunk upload for non-POST methods to prevent falling through to Vite HTML
app.all('/api/archive/upload-chunk', (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST') {
    return next();
  }
  res.status(405).json({ error: 'Method Not Allowed. Use POST for chunk uploads.' });
});

// Check Archive.org status
app.get('/api/archive/status', (req: Request, res: Response) => {
  res.json({
    configured: Boolean(ARCHIVE_ACCESS_KEY && ARCHIVE_SECRET_KEY),
    provider: 'Internet Archive S3',
    accessKeyPreview: ARCHIVE_ACCESS_KEY ? `${ARCHIVE_ACCESS_KEY.slice(0, 4)}...` : null
  });
});

// Helper to detect streamable video files from Archive.org
function isArchiveVideoFile(f: any): boolean {
  if (!f || !f.name) return false;
  const lowerName = f.name.toLowerCase();
  const lowerFormat = (f.format || '').toLowerCase();

  // Exclude non-video files & preview image contact sheets
  if (
    lowerName.endsWith('_thumb.jpg') ||
    lowerName.endsWith('.xml') ||
    lowerName.endsWith('.sqlite') ||
    lowerName.endsWith('.torrent') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.json') ||
    lowerName.endsWith('.gif') ||
    lowerName.endsWith('.png')
  ) {
    return false;
  }

  const videoExts = ['.mp4', '.mkv', '.webm', '.m4v', '.avi', '.mov', '.wmv', '.flv', '.mpg', '.mpeg', '.ts', '.m2ts', '.ogv', '.3gp'];
  const hasExt = videoExts.some(ext => lowerName.endsWith(ext));
  const hasFormat = (
    lowerFormat.includes('h.264') ||
    lowerFormat.includes('mpeg') ||
    lowerFormat.includes('video') ||
    lowerFormat.includes('matroska') ||
    lowerFormat.includes('webm') ||
    lowerFormat.includes('mp4')
  );

  return hasExt || hasFormat;
}

// Helper to extract clean identifier and optional preferred filename from user input
function extractArchiveIdentifier(rawInput: string): { identifier: string; preferredFilename?: string } {
  let input = rawInput.trim();
  // Strip protocol
  input = input.replace(/^[a-zA-Z]+:\/\//, '');

  // Extract from archive.org domain patterns (e.g. archive.org/details/..., archive.org/download/..., archive.org/embed/..., archive.org/stream/...)
  const domainPattern = /(?:(?:www|ia[0-9]+)\.)?archive\.org\/(?:details|download|embed|stream)\/([^/?#]+)(?:\/([^?#]+))?/i;
  const match = input.match(domainPattern);

  if (match) {
    const id = decodeURIComponent(match[1].trim());
    let preferredFilename = match[2] ? decodeURIComponent(match[2].trim()) : undefined;
    if (preferredFilename && !isArchiveVideoFile({ name: preferredFilename })) {
      preferredFilename = undefined;
    }
    return { identifier: id, preferredFilename };
  }

  // If identifier or direct slug was given
  let id = input.split('?')[0].split('#')[0].replace(/\/+$/, '');
  if (id.includes('/')) {
    const parts = id.split('/');
    id = parts[0] || parts[parts.length - 1];
  }
  id = decodeURIComponent(id).trim();

  // If user passed filename like identifier/filename.mp4 or identifier.mp4
  if (isArchiveVideoFile({ name: id })) {
    id = id.replace(/\.[^/.]+$/, '');
  }

  return { identifier: id };
}

// Method B: Inspect any Archive.org item link and extract streamable videos
app.post('/api/archive/inspect', async (req: Request, res: Response) => {
  try {
    const { urlOrId } = req.body;
    if (!urlOrId || typeof urlOrId !== 'string') {
      res.status(400).json({ error: 'URL or item identifier is required' });
      return;
    }

    const { identifier: rawIdentifier, preferredFilename } = extractArchiveIdentifier(urlOrId);
    let identifier = rawIdentifier;

    if (!identifier) {
      res.status(400).json({ error: 'Invalid Archive.org URL or identifier' });
      return;
    }

    // Step 1: Fetch public metadata from Archive.org
    let metaResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
      headers: { 'User-Agent': 'PenguinView/2.0' }
    });

    let data: any = metaResponse.ok ? await metaResponse.json() : null;
    let files: any[] = data?.files || [];
    let videoFiles = files.filter(isArchiveVideoFile);
    let autoCorrected = false;
    let resolvedIdentifier = identifier;
    let suggestions: { identifier: string; title: string; mediatype?: string }[] = [];

    // Step 2: Fallback search if item is not found or has 0 video streams (e.g. typo, truncated identifier like 'supergirl-48' instead of 'supergirl-480-p')
    if (!metaResponse.ok || videoFiles.length === 0) {
      const cleanSearch = identifier.replace(/[^a-zA-Z0-9_-]/g, '').trim();
      if (cleanSearch.length >= 3) {
        try {
          const searchUrl = `https://archive.org/advancedsearch.php?q=(identifier:*${encodeURIComponent(cleanSearch)}*+OR+title:*${encodeURIComponent(cleanSearch)}*)&fl[]=identifier,title,mediatype,publicdate,downloads&sort[]=downloads+desc&output=json&rows=6`;
          const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': 'PenguinView/2.0' } });
          if (searchRes.ok) {
            const searchData: any = await searchRes.json();
            const docs: any[] = searchData?.response?.docs || [];
            
            // Collect suggestions
            suggestions = docs.map(d => ({
              identifier: d.identifier,
              title: d.title || d.identifier,
              mediatype: d.mediatype
            }));

            // Filter for video/movie candidate
            const movieDocs = docs.filter(d => 
              d.mediatype === 'movies' || 
              d.identifier?.toLowerCase().includes('480') || 
              d.identifier?.toLowerCase().includes('720') || 
              d.identifier?.toLowerCase().includes('1080') || 
              d.identifier?.toLowerCase().includes('video')
            );
            const candidate = movieDocs[0] || docs.find(d => d.identifier !== identifier);

            if (candidate && candidate.identifier) {
              const candRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(candidate.identifier)}`, {
                headers: { 'User-Agent': 'PenguinView/2.0' }
              });
              if (candRes.ok) {
                const candData: any = await candRes.json();
                const candFiles = (candData.files || []).filter(isArchiveVideoFile);
                if (candFiles.length > 0) {
                  // Found matching item with video streams!
                  resolvedIdentifier = candidate.identifier;
                  data = candData;
                  files = candData.files || [];
                  videoFiles = candFiles;
                  autoCorrected = true;
                }
              }
            }
          }
        } catch (searchErr) {
          console.warn('Archive fallback search failed:', searchErr);
        }
      }
    }

    if (videoFiles.length === 0) {
      res.status(404).json({
        error: `Could not find any streamable video files for Archive.org item "${identifier}".`,
        identifier,
        suggestions
      });
      return;
    }

    const metadata = data?.metadata || {};

    // Sort video files:
    // If user provided a specific filename, put it first.
    // Otherwise prioritize original uploaded master files over IA-transcoded derivatives,
    // and prefer standard .mp4 over other formats for maximum browser compatibility.
    videoFiles.sort((a, b) => {
      if (preferredFilename) {
        if (a.name === preferredFilename) return -1;
        if (b.name === preferredFilename) return 1;
      }

      const aIsDeriv = a.name.toLowerCase().includes('.ia.mp4') || a.name.toLowerCase().includes('_ia.mp4') || a.source === 'derivative';
      const bIsDeriv = b.name.toLowerCase().includes('.ia.mp4') || b.name.toLowerCase().includes('_ia.mp4') || b.source === 'derivative';
      if (aIsDeriv !== bIsDeriv) {
        return aIsDeriv ? 1 : -1; // Original upload first
      }

      const aIsMp4 = a.name.toLowerCase().endsWith('.mp4');
      const bIsMp4 = b.name.toLowerCase().endsWith('.mp4');
      if (aIsMp4 !== bIsMp4) {
        return aIsMp4 ? -1 : 1;
      }

      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    const serverPrefix = `https://archive.org/download/${resolvedIdentifier}/`;

    const mappedFiles = videoFiles.map((f, idx) => ({
      name: f.name,
      title: f.title || f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
      episodeNumber: idx + 1,
      streamUrl: `${serverPrefix}${encodeURIComponent(f.name)}`,
      downloadUrl: `${serverPrefix}${encodeURIComponent(f.name)}`,
      sizeBytes: f.size ? parseInt(f.size, 10) : undefined,
      duration: f.length ? parseFloat(f.length) : undefined,
      format: f.format || 'MP4',
      isOriginal: f.source !== 'derivative' && !f.name.toLowerCase().includes('.ia.mp4')
    }));

    // Find thumbnail if available
    let posterUrl = '';
    const thumbFile = files.find(f => f.name && (f.name.endsWith('.jpg') || f.name.endsWith('.png') || f.name.endsWith('.webp')));
    if (thumbFile) {
      posterUrl = `${serverPrefix}${encodeURIComponent(thumbFile.name)}`;
    } else if (metadata.identifier) {
      posterUrl = `https://archive.org/services/img/${encodeURIComponent(resolvedIdentifier)}`;
    }

    res.json({
      success: true,
      identifier: resolvedIdentifier,
      originalIdentifier: autoCorrected ? rawIdentifier : undefined,
      autoCorrected,
      title: metadata.title || resolvedIdentifier,
      description: metadata.description || '',
      year: metadata.year ? parseInt(metadata.year, 10) : metadata.date ? parseInt(metadata.date.slice(0, 4), 10) : undefined,
      posterUrl,
      filesCount: mappedFiles.length,
      files: mappedFiles,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    });
  } catch (error: any) {
    console.error('Archive inspect error:', error);
    res.status(500).json({ error: error.message || 'Failed to inspect Archive.org link' });
  }
});

// High-performance video streaming endpoint with HTTP 206 Partial Content (Range requests)
app.get('/api/videos/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).send('Video file not found on server');
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Determine mime type
  const ext = path.extname(filename).toLowerCase();
  let contentType = 'video/mp4';
  if (ext === '.webm') contentType = 'video/webm';
  else if (ext === '.mkv') contentType = 'video/x-matroska';
  else if (ext === '.ogg') contentType = 'video/ogg';
  else if (ext === '.mov') contentType = 'video/quicktime';
  else if (ext === '.avi') contentType = 'video/x-msvideo';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
      return;
    }

    const chunksize = (end - start) + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };

    res.writeHead(206, head);
    fileStream.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// Upload video or media directly with instant streaming and optional Archive.org sync
app.post('/api/archive/upload', upload.any(), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const file = files && files.length > 0 ? files[0] : req.file;
    const { title, seriesName, seasonNumber, episodeNumber, mediaType } = req.body;

    if (!file) {
      res.status(400).json({ error: 'No file provided for upload' });
      return;
    }

    const isImage = file.mimetype.startsWith('image/');
    // Direct stream endpoint served by Penguin View with HTTP 206 seekable ranges
    const localStreamUrl = `/api/videos/${encodeURIComponent(file.filename)}`;

    // Prepare Archive.org item identifier if keys exist
    let archiveStreamUrl = '';
    const canUploadArchive = Boolean(ARCHIVE_ACCESS_KEY && ARCHIVE_SECRET_KEY);

    if (canUploadArchive) {
      const archiveMediaType = isImage ? 'image' : 'movies';
      const archiveCollection = isImage ? 'opensource_image' : 'opensource_movies';

      const baseSlug = (seriesName || title || (isImage ? 'poster' : 'video'))
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 30);
      
      const timestamp = Date.now().toString(36);
      const identifier = `penguin-view-${baseSlug}-${timestamp}`;
      const cleanFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const s3Url = `https://s3.us.archive.org/${identifier}/${encodeURIComponent(cleanFilename)}`;
      archiveStreamUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(cleanFilename)}`;

      // Asynchronously upload to Archive.org in the background without blocking client
      (async () => {
        try {
          const fileStream = fs.createReadStream(file.path);
          await fetch(s3Url, {
            method: 'PUT',
            headers: {
              'Authorization': `LOW ${ARCHIVE_ACCESS_KEY}:${ARCHIVE_SECRET_KEY}`,
              'x-archive-auto-make-bucket': '1',
              'x-archive-meta-mediatype': archiveMediaType,
              'x-archive-meta-collection': archiveCollection,
              'x-archive-meta-title': title || seriesName || (isImage ? 'Penguin View Poster' : 'Penguin View Video'),
              'x-archive-meta-creator': 'Penguin View Community',
              'Content-Type': file.mimetype || 'video/mp4',
              'Content-Length': file.size.toString()
            },
            // @ts-ignore
            body: fileStream,
            duplex: 'half'
          });
          console.log(`Archive.org upload finished successfully for ${file.filename}`);
        } catch (s3Err) {
          console.warn('Archive.org background upload notice:', s3Err);
        }
      })();
    }

    // Return instant ready streaming URL
    res.json({
      success: true,
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      streamUrl: localStreamUrl,
      localStreamUrl: localStreamUrl,
      downloadUrl: localStreamUrl,
      archiveStreamUrl: archiveStreamUrl || null,
      isImage,
      mediaType: mediaType || (isImage ? 'image' : 'movie'),
      seasonNumber: seasonNumber ? parseInt(seasonNumber, 10) : 1,
      episodeNumber: episodeNumber ? parseInt(episodeNumber, 10) : 1
    });
  } catch (error: any) {
    console.error('Upload handler error:', error);
    res.status(500).json({ error: error.message || 'Server error during upload' });
  }
});

// Resilient Chunked Upload: Receives 5-8MB chunks, bypassing proxy limits (e.g., 32MB max body size)
app.post('/api/archive/upload-chunk', (req: Request, res: Response) => {
  chunkUpload.single('chunk')(req, res, async (multerErr: any) => {
    if (multerErr) {
      console.error('Multer chunk upload error:', multerErr);
      return res.status(400).json({ error: multerErr.message || 'Failed to process file chunk' });
    }

    try {
      const file = req.file;
      const { uploadId, chunkIndex, totalChunks, fileName, fileSize, title, seriesName, seasonNumber, episodeNumber, mediaType } = req.body;

      if (!file) {
        return res.status(400).json({ error: 'No chunk file received' });
      }

      if (!uploadId || chunkIndex === undefined || !totalChunks) {
        if (file.path && fs.existsSync(file.path)) {
          try { fs.unlinkSync(file.path); } catch {}
        }
        return res.status(400).json({ error: 'Missing chunk metadata (uploadId, chunkIndex, totalChunks)' });
      }

      const cIndex = parseInt(chunkIndex, 10);
      const tChunks = parseInt(totalChunks, 10);
      const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '');

      const uploadTempDir = path.join(CHUNKS_TEMP_DIR, safeUploadId);
      if (!fs.existsSync(uploadTempDir)) {
        fs.mkdirSync(uploadTempDir, { recursive: true });
      }

      const targetChunkPath = path.join(uploadTempDir, `part_${cIndex}`);
      // Move uploaded chunk into position
      fs.renameSync(file.path, targetChunkPath);

      // If more chunks are pending, acknowledge receipt
      if (cIndex < tChunks - 1) {
        return res.json({
          success: true,
          chunkIndex: cIndex,
          totalChunks: tChunks,
          received: true
        });
      }

      // FINAL CHUNK: Assemble complete file
      const cleanOriginalName = (fileName || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniquePrefix = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const finalFilename = `${uniquePrefix}_${cleanOriginalName}`;
      const finalFilePath = path.join(UPLOADS_DIR, finalFilename);

      const writeStream = fs.createWriteStream(finalFilePath);

      for (let i = 0; i < tChunks; i++) {
        const partPath = path.join(uploadTempDir, `part_${i}`);
        if (!fs.existsSync(partPath)) {
          writeStream.destroy();
          if (fs.existsSync(finalFilePath)) {
            try { fs.unlinkSync(finalFilePath); } catch {}
          }
          return res.status(400).json({ error: `Missing chunk ${i} during assembly. Please retry upload.` });
        }
        
        // Stream chunk file safely with backpressure handling (constant RAM usage)
        await new Promise<void>((resolve, reject) => {
          const readStream = fs.createReadStream(partPath);
          readStream.on('error', reject);
          readStream.on('end', () => resolve());
          readStream.pipe(writeStream, { end: false });
        });
      }
      
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
        writeStream.end();
      });

      // Clean up temporary chunk folder
      try {
        fs.rmSync(uploadTempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn('Could not clean temp chunk dir:', e);
      }

      const stat = fs.statSync(finalFilePath);
      const localStreamUrl = `/api/videos/${encodeURIComponent(finalFilename)}`;

      // Optional background sync to Archive.org
      let archiveStreamUrl = '';
      const canUploadArchive = Boolean(ARCHIVE_ACCESS_KEY && ARCHIVE_SECRET_KEY);

      if (canUploadArchive) {
        const archiveMediaType = 'movies';
        const archiveCollection = 'opensource_movies';

        const baseSlug = (seriesName || title || 'video')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 30);

        const timestamp = Date.now().toString(36);
        const identifier = `penguin-view-${baseSlug}-${timestamp}`;
        const cleanFilename = cleanOriginalName;
        const s3Url = `https://s3.us.archive.org/${identifier}/${encodeURIComponent(cleanFilename)}`;
        archiveStreamUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(cleanFilename)}`;

        (async () => {
          try {
            const fileStream = fs.createReadStream(finalFilePath);
            await fetch(s3Url, {
              method: 'PUT',
              headers: {
                'Authorization': `LOW ${ARCHIVE_ACCESS_KEY}:${ARCHIVE_SECRET_KEY}`,
                'x-archive-auto-make-bucket': '1',
                'x-archive-meta-mediatype': archiveMediaType,
                'x-archive-meta-collection': archiveCollection,
                'x-archive-meta-title': title || seriesName || 'Penguin View Video',
                'x-archive-meta-creator': 'Penguin View Community',
                'Content-Type': 'video/mp4',
                'Content-Length': stat.size.toString()
              },
              // @ts-ignore
              body: fileStream,
              duplex: 'half'
            });
            console.log(`Archive.org background upload completed for ${finalFilename}`);
          } catch (s3Err) {
            console.warn('Archive.org background upload notice:', s3Err);
          }
        })();
      }

      return res.json({
        success: true,
        filename: finalFilename,
        originalName: fileName || cleanOriginalName,
        size: stat.size,
        streamUrl: localStreamUrl,
        localStreamUrl: localStreamUrl,
        downloadUrl: localStreamUrl,
        archiveStreamUrl: archiveStreamUrl || null,
        isImage: false,
        mediaType: mediaType || 'movie',
        seasonNumber: seasonNumber ? parseInt(seasonNumber, 10) : 1,
        episodeNumber: episodeNumber ? parseInt(episodeNumber, 10) : 1
      });
    } catch (error: any) {
      console.error('Chunk upload handler error:', error);
      return res.status(500).json({ error: error.message || 'Server error during chunked upload' });
    }
  });
});

// Check upload status and existing chunks for instant resumption
app.get('/api/archive/upload-status/:uploadId', (req: Request, res: Response) => {
  const safeUploadId = req.params.uploadId.replace(/[^a-zA-Z0-9_-]/g, '');
  const uploadTempDir = path.join(CHUNKS_TEMP_DIR, safeUploadId);
  if (!fs.existsSync(uploadTempDir)) {
    return res.json({ exists: false, receivedChunks: [] });
  }

  try {
    const files = fs.readdirSync(uploadTempDir);
    const receivedChunks: number[] = [];
    for (const f of files) {
      if (f.startsWith('part_')) {
        const idx = parseInt(f.replace('part_', ''), 10);
        if (!isNaN(idx)) receivedChunks.push(idx);
      }
    }
    res.json({ exists: true, receivedChunks });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to inspect chunk state' });
  }
});

// Delete/abort temp chunks if user cancels
app.delete('/api/archive/upload-chunk/:uploadId', (req: Request, res: Response) => {
  const safeUploadId = req.params.uploadId.replace(/[^a-zA-Z0-9_-]/g, '');
  const uploadTempDir = path.join(CHUNKS_TEMP_DIR, safeUploadId);
  if (fs.existsSync(uploadTempDir)) {
    try {
      fs.rmSync(uploadTempDir, { recursive: true, force: true });
    } catch {}
  }
  res.json({ success: true });
});

// Catch-all API error handler to ensure JSON responses and prevent HTML leaks
app.use('/api', (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error intercepted:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error on API route' });
});

// Non-existent API routes return 404 JSON instead of HTML
app.use('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.baseUrl}` });
});

// Setup Vite middleware or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Penguin View Server running on port ${PORT}`);
  });
}

startServer();
