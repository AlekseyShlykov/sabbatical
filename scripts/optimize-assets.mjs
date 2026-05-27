#!/usr/bin/env node
/**
 * Compress raster assets: WebP (primary) + light fallbacks (JPEG or PNG).
 * Also writes data/assets.json manifest so the client skips HEAD probes.
 * Run: npm install && npm run optimize-assets
 */
import sharp from "sharp";
import { readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {Record<string, { maxWidth?: number; maxHeight?: number; webpQuality?: number; jpegQuality?: number }>} */
const FILE_RULES = {
  "assets/map/player.png": { maxWidth: 320, maxHeight: 480, webpQuality: 82 },
  "assets/map/mark.png": { maxWidth: 160, maxHeight: 160, webpQuality: 82 },
  "assets/map/tomap.png": { maxWidth: 160, maxHeight: 160, webpQuality: 82 },
  "assets/map/dot1.png": { maxWidth: 64, maxHeight: 64, webpQuality: 78 },
};

/** Меньше пиксели + ниже качество = быстрее загрузка локаций без заметной потери. */
/** @type {Record<string, { maxWidth?: number; maxHeight?: number; webpQuality?: number; jpegQuality?: number }>} */
const DIR_RULES = {
  "assets/backgrounds": { maxWidth: 1280, maxHeight: 1280, webpQuality: 72, jpegQuality: 78 },
  "assets/intro": { maxWidth: 1280, maxHeight: 1280, webpQuality: 72, jpegQuality: 78 },
  "assets/characters": { maxWidth: 768, maxHeight: 1152, webpQuality: 76, jpegQuality: 80 },
  "assets/map": { maxWidth: 1402, maxHeight: 1122, webpQuality: 78, jpegQuality: 82 },
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
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    webpQuality = 75,
    jpegQuality = 80,
  } = rulesFor(rel);
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
  await pipeline.clone().webp({ quality: webpQuality, effort: 5 }).toFile(webpPath);
  const webpSize = (await stat(webpPath)).size;

  let fallbackSize = 0;
  let fallbackExt = "";
  if (hasAlpha) {
    await pipeline
      .clone()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(absPath + ".opt.tmp");
    const { rename } = await import("fs/promises");
    await rename(absPath + ".opt.tmp", absPath);
    fallbackSize = (await stat(absPath)).size;
    fallbackExt = ".png";
  } else {
    const jpgPath = absPath.replace(/\.png$/i, ".jpg");
    const tmpJpg = jpgPath + ".opt.tmp";
    await pipeline
      .clone()
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toFile(tmpJpg);
    const { rename } = await import("fs/promises");
    await rename(tmpJpg, jpgPath);
    fallbackSize = (await stat(jpgPath)).size;
    fallbackExt = ".jpg";
    if (/\.png$/i.test(absPath)) {
      try {
        await unlink(absPath);
      } catch {
        /* already removed */
      }
    }
  }

  return { rel, before, fallbackSize, webpSize, hasAlpha, fallbackExt };
}

async function main() {
  const assetsDir = path.join(ROOT, "assets");
  const files = await walk(assetsDir);
  let totalBefore = 0;
  let totalFallback = 0;
  let totalWebp = 0;

  /** key (asset path without extension) → ordered list of available extensions */
  const manifest = {};

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

      const key = r.rel.replace(/\.(png|jpe?g|webp)$/i, "");
      const exts = new Set(manifest[key] || []);
      exts.add(".webp");
      if (r.fallbackExt) exts.add(r.fallbackExt);
      manifest[key] = [".webp", ".jpg", ".png"].filter((e) => exts.has(e));
    } catch (err) {
      console.error(`FAIL ${path.relative(ROOT, file)}:`, err.message);
    }
  }

  const manifestPath = path.join(ROOT, "data", "assets.json");
  await writeFile(
    manifestPath,
    JSON.stringify({ version: 1, files: manifest }, null, 2) + "\n",
    "utf8"
  );
  console.log(`\nManifest written: ${path.relative(ROOT, manifestPath)}`);

  console.log(
    `\nTotal: ${fmtMb(totalBefore)} → fallbacks ${fmtMb(totalFallback)} + WebP ${fmtMb(totalWebp)}`
  );
}

main();
