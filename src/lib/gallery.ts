/**
 * Shape of a photo in the boat gallery.
 *
 * Split out of `lib/data.ts` because the viewer is a client component and
 * `data.ts` is `server-only` — importing the id constant from there would drag
 * the whole server module into the browser bundle and fail the build. Same
 * split as `weather.ts` (pure) against `weather-data.ts` (server).
 */

export type GalleryPhoto = {
  /** The `media` row id, or `HERO_PHOTO_ID` for a hero with no media row. */
  id: string;
  /** Storage key inside the `media` bucket — what promoting to hero writes. */
  path: string;
  url: string;
  caption: string | null;
  isHero: boolean;
};

/**
 * The hero photo is set from settings and written to `boats.photo_path`, which
 * is a storage path and not a `media` row — so it needs an id of its own to be
 * addressable in the viewer. It is also the one photo the viewer cannot delete,
 * and this id is how that is decided.
 */
export const HERO_PHOTO_ID = "hero";
