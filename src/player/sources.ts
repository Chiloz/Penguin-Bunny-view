/**
 * Source resolution for the player.
 *
 * A "stream URL" stored on a room/media item can be many things (Drive link, Archive.org file,
 * HLS playlist, plain MP4...). Instead of betting everything on one URL, we expand it into an
 * ordered list of CANDIDATES. The engine tries them in order and moves to the next one when a
 * candidate fails to decode or load. That chain is what makes playback survive phones whose
 * codecs, networks or browsers reject the first choice.
 */

import { canPlayNativeHls, isMobile } from './device';

export type SourceKind = 'blob' | 'proxy' | 'archive' | 'hls' | 'direct' | 'embed';

export interface Candidate {
  url: string;
  kind: SourceKind;
  /** Short human label, shown in the "try another source" UI. */
  label: string;
}

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

const DRIVE_ID_RE = /(?:file\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/;

export function getGoogleDriveId(rawUrl: string): string | null {
  if (!rawUrl) return null;
  if (rawUrl.includes('drive.google.com') || rawUrl.includes('docs.google.com') || rawUrl.includes('drive.usercontent.google.com')) {
    const m = rawUrl.match(DRIVE_ID_RE);
    return m ? m[1] : null;
  }
  if (rawUrl.includes('/api/drive/stream')) {
    const m = rawUrl.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
    return m ? m[1] : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Archive.org
// ---------------------------------------------------------------------------

const ARCHIVE_NON_H264_EXT = /\.(mkv|avi|mov|wmv|flv|mpg|mpeg|ts|m2ts|ogv|3gp)(\?.*)?$/i;

export function isArchiveUrl(url: string): boolean {
  return /(^|\/\/|\.)archive\.org\//i.test(url);
}

export function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(url);
}

/** Archive.org keeps a web-safe H.264 derivative next to most originals: "<name>.ia.mp4". */
export function archiveH264Variant(url: string): string | null {
  if (/\.ia\.mp4(\?|#|$)/i.test(url)) return null;
  if (/\.mp4(\?|#|$)/i.test(url)) return url.replace(/\.mp4(\?.*)?$/i, '.ia.mp4$1');
  if (ARCHIVE_NON_H264_EXT.test(url)) return url.replace(ARCHIVE_NON_H264_EXT, '.ia.mp4$2');
  return null;
}

export function archiveOriginalVariant(url: string): string | null {
  return /\.ia\.mp4(\?|#|$)/i.test(url) ? url.replace(/\.ia\.mp4/i, '.mp4') : null;
}

// ---------------------------------------------------------------------------
// Server API availability
// ---------------------------------------------------------------------------

let apiProbe: Promise<boolean> | null = null;

/**
 * Is the Node streaming server (/api/*) actually behind this origin?
 * On static hosting (Firebase Hosting / Netlify) every unknown path is rewritten to index.html, so
 * /api/drive/stream would "succeed" with an HTML page and the <video> would die with a decode error.
 * We detect that once and skip proxy candidates instead.
 */
export function isServerApiAvailable(): Promise<boolean> {
  if (!apiProbe) {
    apiProbe = (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return false;
        const type = res.headers.get('content-type') || '';
        if (!type.includes('json')) return false;
        const body = await res.json();
        return body?.status === 'ok';
      } catch {
        return false;
      }
    })();
  }
  return apiProbe;
}

/** Test hook / manual refresh. */
export function resetServerApiProbe(): void {
  apiProbe = null;
}

// ---------------------------------------------------------------------------
// Candidate building
// ---------------------------------------------------------------------------

export function upgradeToHttps(url: string): string {
  if (typeof location !== 'undefined' && location.protocol === 'https:' && /^http:\/\//i.test(url)) {
    return url.replace(/^http:\/\//i, 'https://');
  }
  return url;
}

export function addCacheBust(url: string): string {
  if (!/^https?:|^\/api\//i.test(url)) return url;
  const clean = url.replace(/([?&])_pv=\d+&?/g, '$1').replace(/[?&]$/, '');
  return `${clean}${clean.includes('?') ? '&' : '?'}_pv=${Date.now()}`;
}

export function stripCacheBust(url: string): string {
  return url.replace(/([?&])_pv=\d+&?/g, '$1').replace(/[?&]$/, '');
}

export function driveEmbedUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`;
}

/**
 * Expand a stored stream URL into an ordered, de-duplicated candidate list.
 * Pure + synchronous so it can be unit tested; the caller supplies `apiAvailable`.
 */
export function buildCandidates(rawUrl: string, opts: { apiAvailable: boolean; mobile?: boolean } = { apiAvailable: true }): Candidate[] {
  const raw = (rawUrl || '').trim();
  if (!raw) return [];
  const mobile = opts.mobile ?? isMobile;
  const out: Candidate[] = [];
  const push = (c: Candidate) => {
    if (!out.some((x) => x.url === c.url)) out.push(c);
  };

  if (raw.startsWith('blob:')) {
    return [{ url: raw, kind: 'blob', label: 'Local file' }];
  }

  const driveId = getGoogleDriveId(raw);
  if (driveId) {
    if (opts.apiAvailable) {
      push({ url: `/api/drive/stream?id=${driveId}`, kind: 'proxy', label: 'Drive (fast proxy)' });
    }
    push({
      url: `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`,
      kind: 'direct',
      label: 'Drive (direct)',
    });
    push({ url: driveEmbedUrl(driveId), kind: 'embed', label: 'Drive player (no sync)' });
    return out;
  }

  const url = upgradeToHttps(raw);

  if (isHlsUrl(url)) {
    push({ url, kind: 'hls', label: 'HLS stream' });
    return out;
  }

  if (isArchiveUrl(url)) {
    const h264 = archiveH264Variant(url);
    const original = archiveOriginalVariant(url);
    // Phones: lead with the universally decodable H.264 derivative; originals are often HEVC/MKV.
    // Desktop: lead with the original for quality, fall back to H.264.
    if (mobile && h264) {
      push({ url: h264, kind: 'archive', label: 'Archive.org H.264' });
      push({ url, kind: 'archive', label: 'Archive.org original' });
    } else if (original) {
      push({ url: original, kind: 'archive', label: 'Archive.org original' });
      push({ url, kind: 'archive', label: 'Archive.org H.264' });
    } else {
      push({ url, kind: 'archive', label: 'Archive.org original' });
      if (h264) push({ url: h264, kind: 'archive', label: 'Archive.org H.264' });
    }
    return out;
  }

  if (url.startsWith('/api/')) {
    push({ url, kind: opts.apiAvailable ? 'proxy' : 'direct', label: 'Server stream' });
    return out;
  }

  push({ url, kind: 'direct', label: 'Direct link' });
  return out;
}

/** Backwards-compatible helper used by older call sites. */
export function resolvePlayableStreamUrl(rawUrl: string): string {
  const first = buildCandidates(rawUrl, { apiAvailable: true }).find((c) => c.kind !== 'embed');
  return first ? first.url : rawUrl || '';
}

export function usesNativeHls(): boolean {
  return canPlayNativeHls();
}
