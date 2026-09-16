import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// normalizePath converts Windows backslashes to forward slashes — tinyglobby
// (used internally by vite-plugin-static-copy) treats `\` as a glob escape
// character, so an un-normalized Windows path silently matches zero files.
const arcgisAssetsDir = normalizePath(
  fileURLToPath(new URL("./node_modules/@arcgis/core/assets", import.meta.url))
);
const projectRoot = normalizePath(process.cwd());

export default defineConfig({
  base: "./",
  server: {
    port: 5173
  },
  plugins: [
    // Serves @arcgis/core's runtime assets (worker scripts, locale strings,
    // basemap style resources) from this app instead of Esri's js.arcgis.com
    // CDN, so the installed SDK version is always self-consistent. See
    // src/arcgisConfig.ts for where assetsPath is pointed at this folder.
    viteStaticCopy({
      targets: [
        {
          src: `${arcgisAssetsDir}/**/*`,
          dest: "arcgis-assets",
          // vite-plugin-static-copy nests copied files under a directory
          // structure preserved relative to the project root (e.g.
          // "node_modules/@arcgis/core/assets/esri/..."), then joins the
          // string returned here onto that same nested directory. To land
          // each file at "arcgis-assets/esri/..." instead, walk back out of
          // that auto-preserved nesting before re-descending into the path
          // relative to the assets folder itself.
          rename: (_name, _ext, fullPath) => {
            const normalizedFullPath = normalizePath(fullPath);
            const relFromAssets = path.posix.relative(arcgisAssetsDir, normalizedFullPath);
            const nestedDepth = path.posix
              .relative(projectRoot, path.posix.dirname(normalizedFullPath))
              .split("/").length;
            return "../".repeat(nestedDepth) + relFromAssets;
          }
        }
      ]
    })
  ]
});
