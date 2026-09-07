export function youtubeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Укажите ссылку на видео YouTube.');
  }
  const host = url.hostname.toLowerCase();
  const youtubeHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Укажите обычную ссылку на видео YouTube.');
  }
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  if (youtubeHosts.includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw new Error('Нужна ссылка на одно видео YouTube, а не на плейлист.');
  }
  return `https://www.youtube.com/watch?v=${id}`;
}
