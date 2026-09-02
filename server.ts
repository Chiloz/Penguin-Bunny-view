import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Default archive keys provided for instant usability, overridden by env if present
const ARCHIVE_ACCESS_KEY = process.env.ARCHIVE_S3_ACCESS_KEY || 'XgsBgjpbB8qhGCak';
const ARCHIVE_SECRET_KEY = process.env.ARCHIVE_S3_SECRET_KEY || 's0pBbUEfuqXG1crR';

// Middleware for parsing JSON and urlencoded data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Setup multer memory storage for streaming video uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 * 2 } // 2GB limit
});

// API Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check Archive.org status
app.get('/api/archive/status', (req: Request, res: Response) => {
  res.json({
    configured: Boolean(ARCHIVE_ACCESS_KEY && ARCHIVE_SECRET_KEY),
    provider: 'Internet Archive S3',
    accessKeyPreview: ARCHIVE_ACCESS_KEY ? `${ARCHIVE_ACCESS_KEY.slice(0, 4)}...` : null
  });
});

// Method B: Inspect any Archive.org item link and extract streamable videos
app.post('/api/archive/inspect', async (req: Request, res: Response) => {
  try {
    const { urlOrId } = req.body;
    if (!urlOrId || typeof urlOrId !== 'string') {
      res.status(400).json({ error: 'URL or item identifier is required' });
      return;
    }

    // Extract identifier from URL like https://archive.org/details/ITEM_ID or direct identifier
    let identifier = urlOrId.trim();
    if (identifier.includes('archive.org/details/')) {
      const parts = identifier.split('archive.org/details/');
      identifier = parts[1].split('/')[0].split('?')[0];
    } else if (identifier.includes('archive.org/download/')) {
      const parts = identifier.split('archive.org/download/');
      identifier = parts[1].split('/')[0].split('?')[0];
    }

    if (!identifier) {
      res.status(400).json({ error: 'Invalid Archive.org URL or identifier' });
      return;
    }

    // Fetch public metadata from Archive.org
    const metaResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
    if (!metaResponse.ok) {
      res.status(404).json({ error: `Archive.org item "${identifier}" not found or is private.` });
      return;
    }

    const data: any = await metaResponse.json();
    const metadata = data.metadata || {};
    const files: any[] = data.files || [];

    // Filter for streamable video files (.mp4, .mkv, .webm, .m4v)
    const videoFiles = files.filter(f => {
      if (!f.name) return false;
      const lower = f.name.toLowerCase();
      const isVideoExt = lower.endsWith('.mp4') || lower.endsWith('.mkv') || lower.endsWith('.webm') || lower.endsWith('.m4v');
      // Exclude internal IA files or torrents
      const isInternal = lower.includes('_ia.mp4') || lower.endsWith('_thumb.jpg');
      return isVideoExt && !isInternal;
    });

    // Natural sort video files (Episode 1, Episode 2...)
    videoFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const serverPrefix = `https://archive.org/download/${identifier}/`;

    const mappedFiles = videoFiles.map((f, idx) => ({
      name: f.name,
      title: f.title || f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
      episodeNumber: idx + 1,
      streamUrl: `${serverPrefix}${encodeURIComponent(f.name)}`,
      downloadUrl: `${serverPrefix}${encodeURIComponent(f.name)}`,
      sizeBytes: f.size ? parseInt(f.size, 10) : undefined,
      duration: f.length ? parseFloat(f.length) : undefined,
      format: f.format || 'MP4'
    }));

    // Find thumbnail if available
    let posterUrl = '';
    const thumbFile = files.find(f => f.name && (f.name.endsWith('.jpg') || f.name.endsWith('.png')));
    if (thumbFile) {
      posterUrl = `${serverPrefix}${encodeURIComponent(thumbFile.name)}`;
    }

    res.json({
      success: true,
      identifier,
      title: metadata.title || identifier,
      description: metadata.description || '',
      year: metadata.year ? parseInt(metadata.year, 10) : undefined,
      posterUrl,
      filesCount: mappedFiles.length,
      files: mappedFiles
    });
  } catch (error: any) {
    console.error('Archive inspect error:', error);
    res.status(500).json({ error: error.message || 'Failed to inspect Archive.org link' });
  }
});

// Method A: Upload video or image directly to Internet Archive S3
app.post('/api/archive/upload', upload.any(), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    const file = files && files.length > 0 ? files[0] : req.file;
    const { title, seriesName, seasonNumber, episodeNumber, mediaType } = req.body;

    if (!file) {
      res.status(400).json({ error: 'No file provided for upload' });
      return;
    }

    if (!ARCHIVE_ACCESS_KEY || !ARCHIVE_SECRET_KEY) {
      res.status(500).json({ error: 'Archive.org S3 credentials are not configured.' });
      return;
    }

    const isImage = file.mimetype.startsWith('image/');
    const archiveMediaType = isImage ? 'image' : 'movies';
    const archiveCollection = isImage ? 'opensource_image' : 'opensource_movies';

    // Generate safe item identifier on Archive.org
    // Format: penguin-view-[name]-[timestamp]
    const baseSlug = (seriesName || title || (isImage ? 'poster' : 'video'))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 30);
    
    const timestamp = Date.now().toString(36);
    const identifier = `penguin-view-${baseSlug}-${timestamp}`;

    // Clean filename
    const cleanFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Url = `https://s3.us.archive.org/${identifier}/${encodeURIComponent(cleanFilename)}`;

    console.log(`Starting Archive.org S3 upload (${archiveMediaType}) to: ${s3Url}`);

    // Upload to Archive.org using their S3 protocol PUT
    const s3Response = await fetch(s3Url, {
      method: 'PUT',
      headers: {
        'Authorization': `LOW ${ARCHIVE_ACCESS_KEY}:${ARCHIVE_SECRET_KEY}`,
        'x-archive-auto-make-bucket': '1',
        'x-archive-meta-mediatype': archiveMediaType,
        'x-archive-meta-collection': archiveCollection,
        'x-archive-meta-title': title || seriesName || (isImage ? 'Penguin View Poster' : 'Penguin View Video'),
        'x-archive-meta-creator': 'Penguin View Community',
        'Content-Type': file.mimetype || (isImage ? 'image/jpeg' : 'video/mp4'),
        'Content-Length': file.size.toString()
      },
      body: file.buffer
    });

    if (!s3Response.ok) {
      const errorText = await s3Response.text();
      console.error('Archive.org S3 error response:', s3Response.status, errorText);
      res.status(s3Response.status).json({
        error: `Archive.org upload failed (${s3Response.status}): ${errorText.slice(0, 300)}`
      });
      return;
    }

    // Direct permanent stream and download URL
    const streamUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(cleanFilename)}`;

    res.json({
      success: true,
      identifier,
      filename: cleanFilename,
      streamUrl,
      downloadUrl: streamUrl,
      isImage,
      mediaType: mediaType || (isImage ? 'image' : 'movie'),
      seasonNumber: seasonNumber ? parseInt(seasonNumber, 10) : 1,
      episodeNumber: episodeNumber ? parseInt(episodeNumber, 10) : 1
    });
  } catch (error: any) {
    console.error('Archive upload error:', error);
    res.status(500).json({ error: error.message || 'Server error during Archive.org upload' });
  }
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
