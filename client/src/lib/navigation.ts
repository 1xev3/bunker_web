export type AppRoute =
  | { type: 'game' }
  | { type: 'pack-editor'; packId: string };

export function parseRoute(pathname: string): AppRoute {
  const match = pathname.match(/^\/packs\/([^/]+)\/edit\/?$/);
  return match
    ? { type: 'pack-editor', packId: decodeURIComponent(match[1]) }
    : { type: 'game' };
}

export function navigate(pathname: string) {
  window.history.pushState({}, '', pathname);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
