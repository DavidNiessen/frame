import { isMediaFilename } from './imports';

const mediaTypes: Record<string, string> = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'video/webm': 'webm', 'video/x-msvideo': 'avi', 'video/x-m4v': 'm4v', 'image/gif': 'gif',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'audio/ogg': 'ogg', 'application/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/opus': 'opus', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff',
};
export function mediaUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) throw new Error('Enter a direct HTTP or HTTPS link to a video or audio file.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid URL starting with http:// or https://.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS media URLs are supported.');
  if (url.username || url.password) throw new Error('Links with embedded login credentials are not supported.');
  url.hash = '';
  return url;
}
export function remoteFilename(url: URL, headers: Headers) {
  const type = (headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (/^(?:text\/|application\/(?:json|xml|vnd\.apple\.mpegurl|x-mpegurl)|audio\/(?:x-)?mpegurl)/.test(type)) throw new Error('This link returned a page or playlist. Use a direct video or audio file link.');
  const disposition = headers.get('content-disposition') || '';
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(disposition);
  let name = plain?.[1] || plain?.[2]?.trim() || '';
  try { if (extended) name = decodeURIComponent(extended.trim()); } catch { /* Fall back to the ordinary filename or URL path. */ }
  if (!name) { try { name = decodeURIComponent(url.pathname.split('/').at(-1) || ''); } catch { name = ''; } }
  name = name.split(/[\\/]/).at(-1)!.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/[. ]+$/g, '').trim();
  if (!isMediaFilename(name)) {
    const extension = mediaTypes[type];
    if (!extension) throw new Error('The server did not provide a supported media filename or content type. Use a direct file link.');
    name = (name || 'Downloaded media') + '.' + extension;
  }
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = 'Media_' + name;
  const dot = name.lastIndexOf('.');
  return { name: name.slice(0, dot).slice(0, 100) + name.slice(dot).toLowerCase(), type };
}
