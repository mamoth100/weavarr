export interface MenuLinkDef {
  id: string;
  label: string;
  /** 'tab' changes ?genre= on the dashboard itself; 'link' navigates to a separate page. */
  kind: 'tab' | 'link';
  href?: string;
}

export const MENU_LINK_CATALOG: MenuLinkDef[] = [
  { id: 'upcoming', label: 'Coming Soon', kind: 'tab' },
  { id: 'search', label: 'Search', kind: 'tab' },
  { id: 'status', label: 'Status', kind: 'link', href: '/status' },
  { id: 'readyToWatch', label: 'Ready to Watch', kind: 'link', href: '/ready-to-watch' },
  { id: 'radarrLibrary', label: 'Movies (Radarr)', kind: 'link', href: '/radarr-library' },
  { id: 'sonarrLibrary', label: 'TV (Sonarr)', kind: 'link', href: '/sonarr-library' },
];

export const DEFAULT_LINK_IDS = MENU_LINK_CATALOG.map((l) => l.id);
