import path from 'path';

/**
 * Where the settings file (.env.local) lives.
 *
 * Outside Docker this is the project root, so `next dev` keeps loading the
 * same .env.local it always has. Inside Docker the image sets CONFIG_DIR to
 * /app/config, a directory the compose file bind-mounts from the host. A
 * directory mount (not a single-file mount) is deliberate: Docker creates a
 * missing bind-mount source as an empty *directory*, so mounting the file
 * itself on a fresh install produced a directory named .env.local and every
 * settings save then failed. With the directory mounted, the app simply
 * creates the file on first save.
 */
export const CONFIG_DIR = process.env.CONFIG_DIR || process.cwd();
export const ENV_FILE = path.join(CONFIG_DIR, '.env.local');
