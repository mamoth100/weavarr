import { getRawEnvValue } from './settings';
import { LANGUAGES, REGIONS } from './regionOptions';

/**
 * Where you are and what you watch in: the three region knobs. Read off disk
 * on every call so a change in Settings applies on the next page load, no
 * restart. Each value is checked against its own list; anything unknown
 * falls back to the default rather than reaching a TMDB query.
 */

export interface RegionSettings {
  /** Country whose release dates and popularity lists browse uses. */
  discoverRegion: string;
  /** Original language the default browse filter keeps. */
  discoverLanguage: string;
  discoverLanguageLabel: string;
  /** Country the "Where to watch" providers are shown for. */
  streamingRegion: string;
  streamingRegionLabel: string;
}

function pick(raw: string | null, list: { value: string; label: string }[], fallback: string): { value: string; label: string } {
  const hit = list.find((o) => o.value === (raw ?? '').trim());
  return hit ?? list.find((o) => o.value === fallback)!;
}

let memo: { at: number; value: Promise<RegionSettings> } | null = null;

/** One page render asks a dozen times; a few seconds of memo keeps that to one file read and still feels immediate after a save. */
export function getRegionSettings(): Promise<RegionSettings> {
  if (!memo || Date.now() - memo.at > 3000) memo = { at: Date.now(), value: readRegionSettings() };
  return memo.value;
}

async function readRegionSettings(): Promise<RegionSettings> {
  const [region, language, streaming] = await Promise.all([
    getRawEnvValue('DISCOVER_REGION').catch(() => null),
    getRawEnvValue('DISCOVER_LANGUAGE').catch(() => null),
    getRawEnvValue('STREAMING_REGION').catch(() => null),
  ]);
  const lang = pick(language, LANGUAGES, 'en');
  const stream = pick(streaming, REGIONS, 'US');
  return {
    discoverRegion: pick(region, REGIONS, 'US').value,
    discoverLanguage: lang.value,
    discoverLanguageLabel: lang.label,
    streamingRegion: stream.value,
    streamingRegionLabel: stream.label,
  };
}
