import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { Readable, Transform, pipeline } from 'stream';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
app.disable('x-powered-by');
app.set('trust proxy', 1);

// A viewer closing a tab / leaving a movie mid-stream is normal. Never let it take the server down.
const BENIGN_STREAM_ERRORS = new Set(['ECONNRESET', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE', 'ERR_STREAM_DESTROYED', 'ABORT_ERR']);
process.on('uncaughtException', (err: any) => {
  if (err && BENIGN_STREAM_ERRORS.has(err.code)) return;
  console.error('[uncaughtException]', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason: any) => {
  if (reason && (BENIGN_STREAM_ERRORS.has(reason.code) || reason.name === 'AbortError')) return;
  console.error('[unhandledRejection]', reason);
});

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
const ARCHIVE_ACCESS_KEY = process.env.ARCHIVE_S3_ACCESS_KEY || 'HTrkgqZCPwTG1GkG';
const ARCHIVE_SECRET_KEY = process.env.ARCHIVE_S3_SECRET_KEY || 'HO0F2mTdXkUCtvTq';

// Middleware for parsing JSON and urlencoded data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static assets from public with proper PWA and Service Worker headers
const PUBLIC_DIR = path.join(process.cwd(), 'public');
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('manifest.json')) {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    } else if (filePath.endsWith('sw.js')) {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

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
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', server: 'penguin-view', timestamp: new Date().toISOString() });
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
const handleArchiveInspect = async (req: Request, res: Response) => {
  try {
    const rawTarget = req.body?.urlOrId || req.body?.url || req.query?.urlOrId || req.query?.url;
    const urlOrId = typeof rawTarget === 'string' ? rawTarget.trim() : '';
    if (!urlOrId) {
      res.status(400).json({ error: 'URL or item identifier is required' });
      return;
    }

    const { identifier: rawIdentifier, preferredFilename } = extractArchiveIdentifier(urlOrId);
    let identifier = rawIdentifier;

    if (!identifier) {
      res.status(400).json({ error: 'Invalid Archive.org URL or identifier' });
      return;
    }

    // Step 1: Fetch metadata from Archive.org with S3 authorization headers
    const authHeaders: Record<string, string> = { 'User-Agent': 'PenguinView/2.0' };
    if (ARCHIVE_ACCESS_KEY && ARCHIVE_SECRET_KEY) {
      authHeaders['Authorization'] = `LOW ${ARCHIVE_ACCESS_KEY}:${ARCHIVE_SECRET_KEY}`;
    }
    let metaResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
      headers: authHeaders
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
    // Prioritize web-compatible H.264 IA (.ia.mp4) first to avoid browser decode errors with HEVC/H.265
    videoFiles.sort((a, b) => {
      if (preferredFilename) {
        if (a.name === preferredFilename) return -1;
        if (b.name === preferredFilename) return 1;
      }

      const aFormat = (a.format || '').toLowerCase();
      const bFormat = (b.format || '').toLowerCase();
      const aIsH264IA = aFormat.includes('h.264') || a.name.toLowerCase().endsWith('.ia.mp4');
      const bIsH264IA = bFormat.includes('h.264') || b.name.toLowerCase().endsWith('.ia.mp4');
      if (aIsH264IA && !bIsH264IA) return -1;
      if (!aIsH264IA && bIsH264IA) return 1;

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
};

app.post('/api/archive/inspect', handleArchiveInspect);
app.get('/api/archive/inspect', handleArchiveInspect);

// Fetch items uploaded to Josaphat's Archive.org collection or any friend account
app.get('/api/archive/my-items', async (req: Request, res: Response) => {
  try {
    const rawHandle = req.query.handle ? String(req.query.handle).trim() : '';
    let queryClause = `(uploader:*josaphat* OR uploader:*Josaphatkychiloz* OR creator:*Josaphat* OR identifier:*penguin-view*)`;
    
    if (rawHandle) {
      const cleanHandle = rawHandle.replace(/[^a-zA-Z0-9_@.-]/g, '');
      queryClause = `(uploader:*${cleanHandle}* OR creator:*${cleanHandle}* OR identifier:*${cleanHandle}*)`;
    }

    const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(queryClause)}&fl[]=identifier,title,description,mediatype,publicdate,downloads&sort[]=publicdate+desc&output=json&rows=50`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'PenguinView/2.0',
        ...(ARCHIVE_ACCESS_KEY && ARCHIVE_SECRET_KEY ? { 'Authorization': `LOW ${ARCHIVE_ACCESS_KEY}:${ARCHIVE_SECRET_KEY}` } : {})
      }
    });

    if (!searchRes.ok) {
      res.json({ success: true, items: [] });
      return;
    }

    const data: any = await searchRes.json();
    const docs = data?.response?.docs || [];
    res.json({
      success: true,
      handle: rawHandle || 'josaphat_chilokoto',
      items: docs.map((d: any) => ({
        identifier: d.identifier,
        title: d.title || d.identifier,
        description: d.description || '',
        mediatype: d.mediatype || 'movies',
        publicDate: d.publicdate,
        detailsUrl: `https://archive.org/details/${d.identifier}`,
        streamUrl: `https://archive.org/details/${d.identifier}`,
        posterUrl: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list archive items' });
  }
});

const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.ogg': 'video/ogg', '.ogv': 'video/ogg', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.3gp': 'video/3gpp', '.ts': 'video/mp2t',
};

type ParsedRange = { start: number; end: number } | 'unsatisfiable' | 'ignore';

/**
 * Parse a single-range HTTP Range header against a known total size.
 * Handles "a-b", "a-" and the suffix form "-n" (which the old code turned into NaN and crashed on).
 * Malformed or multi-range requests are ignored (served as a normal 200), per RFC 9110.
 */
function parseRange(header: string | undefined, size: number): ParsedRange {
  if (!header) return 'ignore';
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'ignore';
  let start: number;
  let end: number;
  if (m[1] === '') {
    const suffix = parseInt(m[2], 10);
    if (!suffix) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : parseInt(m[2], 10);
  }
  if (start >= size || start > end) return start >= size ? 'unsatisfiable' : 'ignore';
  return { start, end: Math.min(end, size - 1) };
}

// High-performance video streaming endpoint with HTTP 206 Partial Content (Range requests)
app.get('/api/videos/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UPLOADS_DIR, filename);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    res.status(404).setHeader('X-Stream-Error', 'notfound').json({ error: 'Video file not found on server' });
    return;
  }

  const size = stat.size;
  const contentType = VIDEO_MIME[path.extname(filename).toLowerCase()] || 'video/mp4';
  const etag = `W/"${size}-${Math.floor(stat.mtimeMs)}"`;
  const common: Record<string, string | number> = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=3600',
    'Last-Modified': stat.mtime.toUTCString(),
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
  };

  const rangeHeader = req.headers.range;
  if (!rangeHeader && req.headers['if-none-match'] === etag) {
    res.writeHead(304, common);
    res.end();
    return;
  }

  const range = size === 0 ? 'ignore' : parseRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    res.writeHead(416, { ...common, 'Content-Range': `bytes */${size}` });
    res.end();
    return;
  }

  const start = range === 'ignore' ? 0 : range.start;
  const end = range === 'ignore' ? Math.max(size - 1, 0) : range.end;

  if (range === 'ignore') {
    res.writeHead(200, { ...common, 'Content-Length': size });
  } else {
    res.writeHead(206, { ...common, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
  }

  if (req.method === 'HEAD' || size === 0) {
    res.end();
    return;
  }

  const stream = fs.createReadStream(filePath, { start, end });
  // pipeline() destroys BOTH sides on any failure, so a viewer leaving never leaks a file descriptor.
  pipeline(stream, res, (err) => {
    if (err && !BENIGN_STREAM_ERRORS.has((err as any).code)) {
      console.error('Video stream error:', err);
    }
  });
});

const DRIVE_UPSTREAM = (process.env.DRIVE_UPSTREAM_BASE || 'https://drive.usercontent.google.com').replace(/\/$/, '');
const DRIVE_UPSTREAM_IS_DEFAULT = !process.env.DRIVE_UPSTREAM_BASE;
const DRIVE_HEADER_TIMEOUT_MS = 20_000;

/** Pass only bytes [start, end] of a stream that ignored our Range request (iOS Safari rejects 200 for ranges). */
function sliceStream(start: number, end: number): Transform {
  let offset = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      const chunkStart = offset;
      const chunkEnd = offset + chunk.length - 1;
      offset += chunk.length;
      if (chunkEnd < start) return cb();
      const from = Math.max(0, start - chunkStart);
      const to = Math.min(chunk.length - 1, end - chunkStart);
      if (to >= from) this.push(chunk.subarray(from, to + 1));
      if (chunkEnd >= end) this.push(null);
      cb();
    },
  });
}

/** Drive answers quota/permission problems with a 200 + HTML page. Read a little of it and say what it is. */
async function classifyDriveHtml(r: globalThis.Response): Promise<'quota' | 'private' | 'html'> {
  try {
    const reader = r.body?.getReader();
    if (!reader) return 'html';
    let text = '';
    while (text.length < 65536) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      text += Buffer.from(value).toString('utf8');
    }
    reader.cancel().catch(() => {});
    const t = text.toLowerCase();
    if (t.includes('too many users') || t.includes('quota exceeded') || t.includes('download quota')) return 'quota';
    if (t.includes('accounts.google.com') || t.includes('sign in') || t.includes('request access') || t.includes('you need access')) return 'private';
  } catch { /* fall through */ }
  return 'html';
}

// Google Drive streaming proxy with HTTP 206 Partial Content (Range requests).
// Key behaviours: aborts the upstream download the moment the viewer disconnects (so leaving a movie
// frees Google's per-file connection limit for the next one), never forwards HTML as if it were video,
// and answers Range requests with a real 206 even when Drive ignores the Range header.
app.get('/api/drive/stream', async (req: Request, res: Response) => {
  const fileId = req.query.id as string;
  const cleanId = (fileId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId) {
    res.status(400).setHeader('X-Stream-Error', 'badid').json({ error: 'Missing or invalid Google Drive file ID (?id=...)' });
    return;
  }

  const controller = new AbortController();
  let clientGone = false;
  res.on('close', () => {
    clientGone = true;
    controller.abort(); // viewer left: drop the upstream download immediately
  });

  const sendError = (status: number, tag: string, message: string) => {
    if (res.headersSent) { res.destroy(); return; }
    res.status(status).setHeader('X-Stream-Error', tag).setHeader('Cache-Control', 'no-store').json({ error: message });
  };

  const upstreamHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*',
  };
  if (req.headers.range) upstreamHeaders['Range'] = req.headers.range as string;

  const urls = [`${DRIVE_UPSTREAM}/download?id=${cleanId}&export=download&authuser=0&confirm=t`];
  if (DRIVE_UPSTREAM_IS_DEFAULT) urls.push(`https://drive.google.com/uc?export=download&id=${cleanId}&confirm=t`);

  try {
    let upstream: globalThis.Response | null = null;
    let failTag: { status: number; tag: string; message: string } | null = null;

    for (const url of urls) {
      const headerTimer = setTimeout(() => controller.abort(), DRIVE_HEADER_TIMEOUT_MS);
      let r: globalThis.Response;
      try {
        r = await fetch(url, { method: 'GET', headers: upstreamHeaders, redirect: 'follow', signal: controller.signal });
      } finally {
        clearTimeout(headerTimer);
      }
      if (clientGone) return;

      const type = (r.headers.get('content-type') || '').toLowerCase();
      if (r.status === 404) { failTag = { status: 404, tag: 'notfound', message: 'Google Drive file not found.' }; r.body?.cancel().catch(() => {}); continue; }
      if (r.status === 429) { failTag = { status: 429, tag: 'quota', message: 'Google Drive download quota reached for this file.' }; r.body?.cancel().catch(() => {}); continue; }
      if (r.status === 401 || r.status === 403) { failTag = { status: 403, tag: 'private', message: 'This Drive file is not shared as "Anyone with the link can view".' }; r.body?.cancel().catch(() => {}); continue; }
      if (!r.ok && r.status !== 206) { failTag = { status: 502, tag: 'upstream', message: `Google Drive responded with status ${r.status}.` }; r.body?.cancel().catch(() => {}); continue; }
      if (type.includes('text/html')) {
        const kind = await classifyDriveHtml(r);
        failTag = kind === 'quota'
          ? { status: 429, tag: 'quota', message: 'Google Drive is rate-limiting this file (too many recent downloads).' }
          : kind === 'private'
            ? { status: 403, tag: 'private', message: 'This Drive file is not shared as "Anyone with the link can view".' }
            : { status: 502, tag: 'html', message: 'Google Drive returned a web page instead of the video.' };
        continue;
      }
      upstream = r;
      break;
    }

    if (!upstream) {
      const f = failTag || { status: 502, tag: 'upstream', message: 'Could not reach Google Drive.' };
      sendError(f.status, f.tag, f.message);
      return;
    }

    const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase();
    // octet-stream / missing types make iOS Safari refuse to play; force a video type unless Drive gave us one.
    const contentType = upstreamType.startsWith('video/') ? upstreamType : 'video/mp4';
    const totalHeader = upstream.headers.get('content-length');
    const upstreamLen = totalHeader ? parseInt(totalHeader, 10) : NaN;

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    let body: Readable | null = null;
    if (upstream.body) {
      body = Readable.fromWeb(upstream.body as any);
    }

    if (req.method === 'HEAD' || !body) {
      if (upstream.headers.get('content-range')) res.setHeader('Content-Range', upstream.headers.get('content-range')!);
      if (totalHeader) res.setHeader('Content-Length', totalHeader);
      res.status(upstream.status).end();
      controller.abort();
      return;
    }

    const wantedRange = req.headers.range as string | undefined;
    if (upstream.status === 200 && wantedRange && isFinite(upstreamLen) && upstreamLen > 0) {
      // Drive ignored Range. Emulate a proper 206 so Safari / strict players accept the stream.
      const parsed = parseRange(wantedRange, upstreamLen);
      if (parsed === 'unsatisfiable') {
        res.status(416).setHeader('Content-Range', `bytes */${upstreamLen}`).end();
        controller.abort();
        return;
      }
      if (parsed !== 'ignore') {
        res.status(206);
        res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.end}/${upstreamLen}`);
        res.setHeader('Content-Length', parsed.end - parsed.start + 1);
        pipeline(body, sliceStream(parsed.start, parsed.end), res, (err) => {
          controller.abort();
          if (err && !BENIGN_STREAM_ERRORS.has((err as any).code) && !clientGone) console.error('Drive slice stream error:', err);
        });
        return;
      }
    }

    res.status(upstream.status);
    const range = upstream.headers.get('content-range');
    if (range) res.setHeader('Content-Range', range);
    if (totalHeader) res.setHeader('Content-Length', totalHeader);
    pipeline(body, res, (err) => {
      controller.abort();
      if (err && !BENIGN_STREAM_ERRORS.has((err as any).code) && !clientGone) console.error('Drive stream error:', err);
    });
  } catch (err: any) {
    if (clientGone || err?.name === 'AbortError') {
      if (!clientGone) sendError(504, 'timeout', 'Google Drive took too long to respond.');
      return;
    }
    console.error('Google Drive stream error:', err);
    sendError(502, 'upstream', 'Error streaming Google Drive video: ' + (err?.message || 'unknown'));
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
    // Hashed build assets never change -> cache hard. index.html must ALWAYS revalidate, otherwise phones
    // keep an old shell pointing at JS files that no longer exist after a deploy (blank screen / errors).
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));
    app.get('*', (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Penguin View Server running on port ${PORT}`);
  });
}

startServer();
