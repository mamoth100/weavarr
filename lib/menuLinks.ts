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
  { id: 'library', label: 'Library', kind: 'link', href: '/library' },
  { id: 'status', label: 'Status', kind: 'link', href: '/status' },
  { id: 'readyToWatch', label: 'Watch', kind: 'link', href: '/ready-to-watch' },
  { id: 'requests', label: 'Requests', kind: 'link', href: '/requests' },
  { id: 'calendar', label: 'Calendar', kind: 'link', href: '/calendar' },
];

export const DEFAULT_LINK_IDS = MENU_LINK_CATALOG.map((l) => l.id);
