/** One "file imported" event from Radarr or Sonarr history, in the shape both notification and Requests code consume. */
export interface ImportHistoryItem {
  /** History record id from the arr. Unique per event within that arr; the React key and the notification key downstream. */
  historyId: number;
  title: string;
  date: string;
  episode?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  seriesId?: number;
  movieId?: number;
  /** The episode's air date (yyyy-mm-dd), Sonarr items only. Lets library checks match by date when a media server numbers seasons differently than TVDB. */
  airDate?: string | null;
}
