import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ProjectValidationError } from '@pinforge/schema';
import {
  buildHtml,
  create,
  exportGame,
  inlineAssets,
  openProject,
  readRuntimeBundle,
} from '../src/index.js';

const EXAMPLE = new URL('../../../examples/first-game', import.meta.url).pathname;
const STARTER = new URL('../templates/starter', import.meta.url).pathname;
const workspace = mkdtempSync(join(tmpdir(), 'pinforge-cli-'));

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

describe('opening a project', () => {
  it('opens the example game', () => {
    const opened = openProject(EXAMPLE);

    expect(opened.project.meta.name).toBe('Coin Run');
    expect(opened.project.scenes).toHaveLength(2);
    expect(opened.migrations).toEqual([]);
  });

  it('opens the starter the new command copies', () => {
    expect(openProject(STARTER).project.scenes).toHaveLength(1);
  });

  it('says which file is not JSON rather than throwing a parser error', () => {
    const broken = join(workspace, 'game.pinforge.json');
    writeFileSync(broken, '{ not json');

    expect(() => openProject(broken)).toThrow(/not valid JSON/);
  });

  it('reports what a project points at that does not exist', () => {
    const broken = join(workspace, 'broken.pinforge.json');
    const project = JSON.parse(readFileSync(join(EXAMPLE, 'game.pinforge.json'), 'utf8'));
    project.settings.startScene = 'level-nine';
    writeFileSync(broken, JSON.stringify(project));

    expect(() => openProject(broken)).toThrow(ProjectValidationError);
    expect(() => openProject(broken)).toThrow(/level-nine/);
  });
});

describe('exporting', () => {
  it('turns every asset into a data URI', () => {
    const opened = openProject(EXAMPLE);
    const inlined = inlineAssets(opened.project, opened.directory);

    expect(inlined.assets).toHaveLength(opened.project.assets.length);
    for (const asset of inlined.assets) expect(asset.source.startsWith('data:')).toBe(true);
  });

  it('explains which asset is missing instead of writing a broken game', () => {
    const opened = openProject(EXAMPLE);
    const project = {
      ...opened.project,
      assets: [{ id: 'gone', kind: 'image' as const, source: 'assets/gone.png' }],
    };

    expect(() => inlineAssets(project, opened.directory)).toThrow(/assets\/gone\.png is missing/);
  });

  it('writes one HTML file that asks the network for nothing', () => {
    const file = exportGame(EXAMPLE, join(workspace, 'coin-run.html'));
    const html = readFileSync(file, 'utf8');

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('window.PINFORGE_PROJECT');
    expect(html).not.toMatch(/(src|href)="https?:/);
    // The page has to stand alone, so the only URLs in it are inlined data.
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('never lets project text close the script tag it sits in', () => {
    const opened = openProject(EXAMPLE);
    const project = {
      ...opened.project,
      meta: { ...opened.project.meta, description: '</script><script>alert(1)</script>' },
    };
    const html = buildHtml(project, readRuntimeBundle());

    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
  });
});

describe('starting a new game', () => {
  it('copies a playable project, art included, and can rename it', () => {
    const directory = join(workspace, 'my-game');
    const file = create(directory, 'Hello world');
    const opened = openProject(file);

    expect(opened.project.meta.name).toBe('Hello world');
    expect(opened.project.assets.length).toBeGreaterThan(0);
    // The art came with it, so the game can be exported straight away.
    expect(() => inlineAssets(opened.project, opened.directory)).not.toThrow();
  });

  it('refuses to write over a game that is already there', () => {
    const directory = join(workspace, 'my-game');

    expect(() => create(directory, undefined)).toThrow(/already a game/);
  });
});
