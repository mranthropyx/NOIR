import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceIndex = path.resolve(__dirname, "index.source.html");

/** Dev keeps using the small template. GitHub Pages serves the generated index.html. */
function serveSourceIndex(): Plugin {
  return {
    name: "serve-source-index",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      handler() {
        return fs.readFileSync(sourceIndex, "utf8");
      },
    },
  };
}

const previewFiles = [
  "og.png",
  "favicon-192.png",
  "favicon-48.png",
  "favicon-32.png",
  "favicon.ico",
  "favicon.svg",
  "apple-touch-icon.png",
];

/**
 * Root paths such as /og.png point at the other site on a shared GitHub domain.
 * Keep these files next to the page, and use a full address when SITE_URL is set.
 */
function absolutePreviewUrls(): Plugin {
  return {
    name: "absolute-preview-urls",
    apply: "build",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const site = process.env.SITE_URL?.trim();
        const base = site ? (site.endsWith("/") ? site : `${site}/`) : "./";
        let next = html;
        for (const file of previewFiles) {
          const pattern = new RegExp(`(href|content)="(?:\\./|%BASE_URL%|/)${file}"`, "g");
          next = next.replace(pattern, `$1="${base}${file}"`);
        }
        return next;
      },
    },
  };
}

/** Inline module scripts must not keep Vite's crossorigin attribute. WebKit will not run them. */
function fixPublishedHtml(): Plugin {
  return {
    name: "fix-published-html",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "asset" || !item.fileName.endsWith(".html")) continue;
        const raw = typeof item.source === "string" ? item.source : Buffer.from(item.source).toString("utf8");
        if (raw.includes("location.replace") || raw.includes("http-equiv=\"refresh\"")) {
          this.error("Published HTML must not redirect or refresh");
        }
        item.source = raw.replace(
          /<script([^>]*?)\s+crossorigin(?:="[^"]*"|='[^']*'|=[^\s>]+)?([^>]*)>/gi,
          (full, before: string, after: string) => (/\ssrc\s*=/i.test(full) ? full : `<script${before}${after}>`)
        );
      }
    },
    closeBundle() {
      const outDir = path.resolve(__dirname, "docs");
      const emitted = ["index.source.html", "index.html"]
        .map((name) => path.join(outDir, name))
        .find((file) => fs.existsSync(file));
      if (!emitted) return;
      const indexPath = path.join(outDir, "index.html");
      if (emitted !== indexPath) {
        fs.copyFileSync(emitted, indexPath);
        fs.unlinkSync(emitted);
      }
      fs.copyFileSync(indexPath, path.join(outDir, "404.html"));
      fs.copyFileSync(indexPath, path.resolve(__dirname, "index.html"));
      fs.copyFileSync(indexPath, path.resolve(__dirname, "404.html"));
      for (const name of previewFiles) {
        const from = path.join(outDir, name);
        if (fs.existsSync(from)) fs.copyFileSync(from, path.resolve(__dirname, name));
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Relative URLs work on https://user.github.io/ and https://user.github.io/<repo>/.
  base: "./",
  build: {
    outDir: "docs",
    emptyOutDir: true,
    rollupOptions: {
      input: sourceIndex,
    },
  },
  plugins: [serveSourceIndex(), absolutePreviewUrls(), react(), tailwindcss(), viteSingleFile(), fixPublishedHtml()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
