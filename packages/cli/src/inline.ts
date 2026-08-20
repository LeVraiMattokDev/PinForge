import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { Project } from '@pinforge/schema';

const MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/**
 * Rewrites every asset source into a data URI, which is what makes an exported
 * game one file with nothing to upload alongside it.
 *
 * This is a transformation of the project format into itself, not a second
 * format: the result is still a valid project and still opens in the editor.
 */
export function inlineAssets(project: Project, directory: string): Project {
  const missing: string[] = [];
  const assets = project.assets.map((asset) => {
    if (/^(data:|https?:)/.test(asset.source)) return asset;
    if (asset.source.startsWith('builtin:')) {
      missing.push(`${asset.id}: built in assets are not available yet`);
      return asset;
    }
    const file = resolve(directory, asset.source);
    const type = MEDIA_TYPES[extname(file).toLowerCase()];
    if (!type) {
      missing.push(`${asset.id}: ${asset.source} is a kind of file PinForge cannot embed`);
      return asset;
    }
    try {
      const bytes = readFileSync(file);
      return { ...asset, source: `data:${type};base64,${bytes.toString('base64')}` };
    } catch {
      missing.push(`${asset.id}: ${asset.source} is missing`);
      return asset;
    }
  });

  if (missing.length > 0) {
    throw new Error(
      `This game cannot be exported until its assets are in place:\n${missing
        .map((line) => `  - ${line}`)
        .join('\n')}`,
    );
  }

  return { ...project, assets };
}
