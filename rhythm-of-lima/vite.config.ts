import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const arcgisAssetsDir = fileURLToPath(
  new URL("./node_modules/@arcgis/core/assets", import.meta.url)
);

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
            const relFromAssets = path.relative(arcgisAssetsDir, fullPath).split(path.sep).join("/");
            const nestedDepth = path.relative(process.cwd(), path.dirname(fullPath)).split(path.sep).length;
            return "../".repeat(nestedDepth) + relFromAssets;
          }
        }
      ]
    })
  ]
});
