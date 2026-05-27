#!/usr/bin/env node
/**
 * Compress raster assets: WebP (primary) + light fallbacks (JPEG or PNG).
 * Run: npm install && npm run optimize-assets
 */
import sharp from "sharp";
import { readdir, stat, unlink } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {Record<string, { maxWidth?: number; maxHeight?: number; webpQuality?: number }>} */
const FILE_RULES = {
  "assets/map/player.png": { maxWidth: 320, maxHeight: 480, webpQuality: 85 },
  "assets/map/mark.png": { maxWidth: 160, maxHeight: 160, webpQuality: 85 },
  "assets/map/tomap.png": { maxWidth: 160, maxHeight: 160, webpQuality: 85 },
  "assets/map/dot1.png": { maxWidth: 64, maxHeight: 64, webpQuality: 80 },
};

/** @type {Record<string, { maxWidth?: number; maxHeight?: number; webpQuality?: number }>} */
const DIR_RULES = {
  "assets/backgrounds": { maxWidth: 1536, maxHeight: 1536, webpQuality: 82 },
  "assets/intro": { maxWidth: 1536, maxHeight: 1536, webpQuality: 82 },
  "assets/characters": { maxWidth: 896, maxHeight: 1344, webpQuality: 84 },
  "assets/map": { maxWidth: 1402, maxHeight: 1122, webpQuality: 82 },
};

const RASTER = new Set([".png", ".jpg", ".jpeg"]);

function rulesFor(relPath) {
  const norm = relPath.split(path.sep).join("/");
  if (FILE_RULES[norm]) return FILE_RULES[norm];
  for (const [dir, rule] of Object.entries(DIR_RULES)) {
    if (norm.startsWith(`${dir}/`)) return rule;
  }
  return { maxWidth: 1536, maxHeight: 1536, webpQuality: 82 };
}

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (RASTER.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

function fmtMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function optimizeFile(absPath) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join("/");
  const { maxWidth = 1536, maxHeight = 1536, webpQuality = 82 } = rulesFor(rel);
  const before = (await stat(absPath)).size;

  const input = sharp(absPath).rotate();
  const meta = await input.metadata();
  const hasAlpha =
    meta.hasAlpha === true &&
    !rel.startsWith("assets/backgrounds/") &&
    !rel.startsWith("assets/intro/");

  const pipeline = input.resize(maxWidth, maxHeight, {
    fit: "inside",
    withoutEnlargement: true,
  });

  const webpPath = absPath.replace(/\.(png|jpe?g)$/i, ".webp");
  await pipeline.clone().webp({ quality: webpQuality, effort: 4 }).toFile(webpPath);
  const webpSize = (await stat(webpPath)).size;

  let fallbackSize = 0;
  if (hasAlpha) {
    await pipeline
      .clone()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(absPath + ".opt.tmp");
    const { rename } = await import("fs/promises");
    await rename(absPath + ".opt.tmp", absPath);
    fallbackSize = (await stat(absPath)).size;
  } else {
    const jpgPath = absPath.replace(/\.png$/i, ".jpg");
    await pipeline.clone().jpeg({ quality: 84, mozjpeg: true }).toFile(jpgPath);
    fallbackSize = (await stat(jpgPath)).size;
    if (/\.png$/i.test(absPath)) {
      try {
        await unlink(absPath);
      } catch {
        /* already removed */
      }
    }
  }

  return { rel, before, fallbackSize, webpSize, hasAlpha };
}

async function main() {
  const assetsDir = path.join(ROOT, "assets");
  const files = await walk(assetsDir);
  let totalBefore = 0;
  let totalFallback = 0;
  let totalWebp = 0;

  console.log(`Optimizing ${files.length} raster files…\n`);

  for (const file of files.sort()) {
    try {
      const r = await optimizeFile(file);
      totalBefore += r.before;
      totalFallback += r.fallbackSize;
      totalWebp += r.webpSize;
      const kind = r.hasAlpha ? "PNG" : "JPEG";
      const saved = ((1 - (r.fallbackSize + r.webpSize) / r.before) * 100).toFixed(0);
      console.log(
        `${r.rel}\n  ${fmtMb(r.before)} → ${kind} ${fmtMb(r.fallbackSize)} + WebP ${fmtMb(r.webpSize)} (${saved}% saved)`
      );
    } catch (err) {
      console.error(`FAIL ${path.relative(ROOT, file)}:`, err.message);
    }
  }

  console.log(
    `\nTotal: ${fmtMb(totalBefore)} → fallbacks ${fmtMb(totalFallback)} + WebP ${fmtMb(totalWebp)}`
  );
}

main();
