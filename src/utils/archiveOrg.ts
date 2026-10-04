/**
 * Utility for direct client-side Internet Archive (Archive.org) interaction.
 * Works seamlessly in both static environments (e.g. Firebase Hosting)
 * and server environments, because Archive.org metadata and search APIs
 * support CORS (access-control-allow-origin: *).
 */

export interface ArchiveVideoFile {
  name: string;
  title?: string;
  size?: number;
  duration?: number;
  streamUrl: string;
  downloadUrl: string;
  isOriginal: boolean;
  format?: string;
}

export interface ArchiveInspectResult {
  identifier: string;
  title: string;
  description: string;
  posterUrl: string;
  backdropUrl: string;
  year?: number;
  files: ArchiveVideoFile[];
  autoCorrected?: boolean;
  isDark?: boolean;
  suggestions?: { identifier: string; title: string; mediatype?: string }[];
}

export function extractArchiveIdentifier(urlOrId: string): { identifier: string; preferredFilename?: string } {
  const trimmed = (urlOrId || '').trim();
  if (!trimmed) return { identifier: '' };

  // e.g. https://archive.org/details/supergirl-480-p
  // e.g. https://archive.org/download/supergirl-480-p/Supergirl_480P.mp4
  // e.g. https://archive.org/embed/supergirl-480-p
  const detailsMatch = trimmed.match(/archive\.org\/(?:details|embed|metadata)\/([^/?#]+)/i);
  if (detailsMatch) {
    return { identifier: decodeURIComponent(detailsMatch[1]) };
  }

  const downloadMatch = trimmed.match(/archive\.org\/download\/([^/?#]+)(?:\/(.*))?/i);
  if (downloadMatch) {
    return {
      identifier: decodeURIComponent(downloadMatch[1]),
      preferredFilename: downloadMatch[2] ? decodeURIComponent(downloadMatch[2].split('?')[0]) : undefined
    };
  }

  // Raw identifier or search text
  const cleanId = trimmed.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].trim();
  return { identifier: cleanId };
}

export function isArchiveVideoFile(file: any): boolean {
  if (!file || !file.name) return false;
  const name = file.name.toLowerCase();
  const format = (file.format || '').toLowerCase();

  const isVideoExt = name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.webm') || name.endsWith('.m4v');
  const isVideoFormat = format.includes('mpeg4') || format.includes('matroska') || format.includes('webm') || format.includes('video') || format.includes('h.264');

  // Filter out system thumbnails, torrents, animated gifs, xml metadata
  if (name.endsWith('.xml') || name.endsWith('.sqlite') || name.endsWith('.torrent') || name.endsWith('.gif') || name.endsWith('.jpg') || name.endsWith('.png')) {
    return false;
  }

  return isVideoExt || isVideoFormat;
}

/**
 * Searches Archive.org for active movie items matching a search query.
 */
export async function searchArchiveMovies(query: string, rows: number = 8): Promise<{ identifier: string; title: string; mediatype?: string; downloads?: number }[]> {
  const clean = query.trim().replace(/[^a-zA-Z0-9 _-]/g, '');
  if (!clean) return [];

  try {
    const encoded = encodeURIComponent(clean);
    // Search movies collection with download count sorting
    const url = `https://archive.org/advancedsearch.php?q=(${encoded})+AND+mediatype:movies&fl[]=identifier,title,mediatype,downloads&sort[]=downloads+desc&output=json&rows=${rows}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];

    const data = await res.json();
    const docs = data?.response?.docs || [];
    return docs.map((d: any) => ({
      identifier: d.identifier,
      title: d.title || d.identifier,
      mediatype: d.mediatype || 'movies',
      downloads: typeof d.downloads === 'number' ? d.downloads : 0
    }));
  } catch (err) {
    console.warn('Archive.org client search failed:', err);
    return [];
  }
}

/**
 * Direct client-side Archive.org metadata inspector.
 * Bypasses server requirements, working flawlessly on Firebase Hosting,
 * static sites, and Cloud Run alike.
 */
export async function inspectArchiveItem(urlOrId: string): Promise<ArchiveInspectResult> {
  const { identifier: rawIdentifier, preferredFilename } = extractArchiveIdentifier(urlOrId);
  const identifier = rawIdentifier.trim();

  if (!identifier) {
    throw new Error('Please enter a valid Archive.org URL or identifier.');
  }

  let data: any = null;
  let isDark = false;

  try {
    const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
      headers: { Accept: 'application/json' }
    });
    if (metaRes.ok) {
      data = await metaRes.json();
      if (data?.is_dark) {
        isDark = true;
      }
    }
  } catch (netErr) {
    console.warn('Direct Archive.org metadata fetch failed, trying proxy if available:', netErr);
    // If browser fetch was blocked by network/adblocker, attempt backend API
    try {
      const proxyRes = await fetch('/api/archive/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlOrId: identifier })
      });
      if (proxyRes.ok) {
        const proxyText = await proxyRes.text();
        if (!proxyText.trim().startsWith('<')) {
          return JSON.parse(proxyText);
        }
      }
    } catch {}
  }

  let files: any[] = data?.files || [];
  let videoFiles = files.filter(isArchiveVideoFile);
  let resolvedIdentifier = identifier;
  let autoCorrected = false;
  let suggestions: { identifier: string; title: string; mediatype?: string }[] = [];

  // If item is dark/restricted or has 0 video files, search for working candidates!
  if (isDark || videoFiles.length === 0) {
    const cleanSearch = identifier.replace(/[^a-zA-Z0-9_-]/g, '').trim();
    if (cleanSearch.length >= 3) {
      suggestions = await searchArchiveMovies(cleanSearch, 6);

      // Check if top candidate has streamable video files
      if (suggestions.length > 0) {
        for (const candidate of suggestions.slice(0, 3)) {
          if (candidate.identifier === identifier) continue;
          try {
            const candRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(candidate.identifier)}`);
            if (candRes.ok) {
              const candData = await candRes.json();
              if (!candData.is_dark) {
                const candVideos = (candData.files || []).filter(isArchiveVideoFile);
                if (candVideos.length > 0) {
                  resolvedIdentifier = candidate.identifier;
                  data = candData;
                  files = candData.files || [];
                  videoFiles = candVideos;
                  autoCorrected = true;
                  break;
                }
              }
            }
          } catch {}
        }
      }
    }
  }

  if (videoFiles.length === 0) {
    if (isDark) {
      throw new Error(
        `This Archive.org item ("${identifier}") is restricted or removed by Archive.org. Please select an active video item below.`
      );
    }
    throw new Error(
      `No streamable video files found for "${identifier}". Please verify the URL or select a suggested video below.`
    );
  }

  const meta = data?.metadata || {};

  // Sort video files:
  // 1. Preferred filename if specified
  // 2. Web-compatible H.264 IA (.ia.mp4) first to avoid browser decode errors with HEVC/H.265
  // 3. Universal .mp4 files
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
    if (aIsMp4 && !bIsMp4) return -1;
    if (!aIsMp4 && bIsMp4) return 1;

    const aIsOriginal = a.source === 'original';
    const bIsOriginal = b.source === 'original';
    if (aIsOriginal && !bIsOriginal) return -1;
    if (!aIsOriginal && bIsOriginal) return 1;

    return (b.size || 0) - (a.size || 0);
  });

  const parsedVideos: ArchiveVideoFile[] = videoFiles.map(f => {
    const rawStreamUrl = `https://archive.org/download/${resolvedIdentifier}/${encodeURIComponent(f.name)}`;
    return {
      name: f.name,
      title: f.title || f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '),
      size: typeof f.size === 'string' ? parseInt(f.size, 10) : f.size,
      duration: typeof f.length === 'string' ? parseFloat(f.length) : f.length,
      streamUrl: rawStreamUrl,
      downloadUrl: rawStreamUrl,
      isOriginal: f.source === 'original',
      format: f.format
    };
  });

  let year: number | undefined;
  const dateStr = meta.year || meta.date || meta.publicdate;
  if (dateStr) {
    const match = String(dateStr).match(/\b(19\d\d|20\d\d)\b/);
    if (match) year = parseInt(match[1], 10);
  }

  const posterUrl = `https://archive.org/services/img/${resolvedIdentifier}`;

  return {
    identifier: resolvedIdentifier,
    title: meta.title || resolvedIdentifier.replace(/[_-]/g, ' '),
    description: meta.description || '',
    posterUrl,
    backdropUrl: posterUrl,
    year,
    files: parsedVideos,
    autoCorrected,
    isDark,
    suggestions
  };
}
