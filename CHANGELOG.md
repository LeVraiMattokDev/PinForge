# Changelog

Notable changes to PinForge. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html) once it has a release.

The **project file format** has its own version, `formatVersion`, which is
independent of the version of PinForge. It changes only when the shape of a
project file changes, and every change comes with a migration.

## [Unreleased]

### Added

- `@pinforge/schema`, the project format and the contract every other package
  agrees on. Project file format version 1.
  - Zod definitions for the whole format: metadata, settings, named input
    controls, global variables, assets, tilesets, entity prototypes with sprite,
    collider, movement and text components, scenes with tile layers, entity
    instances with component overrides, three camera modes, and event rules.
  - A rule vocabulary of 16 triggers, 10 conditions and 22 actions, each tagged
    with the movement modes it applies to.
  - Referential validation: a second pass over a structurally valid project that
    reports, with a path and a plain sentence, everything that points at
    something missing or impossible.
  - A migration runner with its tests, so the first breaking change to the
    format has somewhere to go.
  - JSON Schema generated from the same definitions and committed, for tools
    that cannot import TypeScript.
- Documentation: the concepts, the authoritative format reference with a complete
  annotated example, and a generated events reference.
- A pnpm workspace with TypeScript in strict mode, Vitest and continuous
  integration that fails if generated files have drifted.
