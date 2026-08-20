# Contributing to PinForge

Thank you for looking. PinForge is developed in the open by PinStudio, and
contributions of every size are welcome.

Before writing code, please read [the architecture notes](docs/architecture.md).
They explain the package boundaries and the handful of decisions that everything
else follows from, and they will save you a rewrite.

## Getting set up

You need Node 22 or newer and pnpm.

```bash
pnpm install
pnpm check          # format, typecheck and every test. Run this before pushing.
```

Other commands:

```bash
pnpm test           # tests only
pnpm typecheck      # types only, including tests and scripts
pnpm build          # compile every package
pnpm generate       # regenerate the JSON Schema and the events reference
pnpm format         # apply formatting
```

Continuous integration runs all of that, and then runs `pnpm generate` again and
fails if anything changed. A generated file that has drifted from its source is a
bug, not a merge conflict.

## The one rule about dependencies

Every new dependency has to be justified in the commit message that adds it. Not
because dependencies are bad, but because this project is meant to be readable by
people who are new to programming, and every package added is another thing they
have to understand before they can help.

The current set is TypeScript, Vitest, Prettier and Zod. Zod earns its place by
being the single source of truth for the format: types, validation and JSON
Schema all come out of the same definitions.

## The one rule about package boundaries

```
schema  <-  core  <-  cli
   ^         ^
   |         |
   +--  editor, mcp
```

`schema` depends on nothing inside PinForge. `core` never imports from `editor`,
and knows nothing about the DOM beyond the `Renderer` interface. `editor` and
`mcp` both depend on `schema` and `core`. If a change needs one of those arrows
reversed, it needs a discussion first.

## Code

- TypeScript in strict mode. No `any` outside code that is clearly marked as a
  boundary, and a boundary needs a comment saying why it is one.
- Full words. `movement`, not `mvmt`. This applies to the user interface most of
  all: no jargon, no abbreviations, and tooltips that explain the idea rather
  than restating the label.
- Comments explain why, not what. The code already says what.
- Formatting is Prettier's problem. Do not argue with it.

## Tests

- Anything about the runtime simulation is tested deterministically: a starting
  state, a scripted sequence of inputs, and an assertion about the exact state
  after a fixed number of steps.
- **Every reported movement bug becomes a simulation test before it is fixed.**
  A test that fails for the right reason is the only proof the bug was
  understood.
- The format has golden files: a project file goes in, and the exact loaded
  result is committed. Changing a default value shows up there as a diff somebody
  has to agree with. Run with `UPDATE_GOLDEN=1` after a deliberate change.

## Documentation

Documentation is a deliverable, not an afterthought. It is written with the code
that needs it, never batched at the end.

Style: clear and direct, no marketing voice, no exclamation marks. Assume a smart
reader who is new to game development. Short paragraphs, concrete examples.

**Every code sample must actually run.** Where a sample is large, wire it into a
test rather than trusting it. The complete example in the format reference is
loaded by the test suite on every run for exactly this reason.

## Changing the format

The project file format is the contract between every package, so changes to it
are deliberate.

1. Change the Zod definitions in `packages/schema/src`.
2. Add a migration in `packages/schema/src/migrate.ts` with `from`, `to` and a
   one line description, and raise `CURRENT_FORMAT_VERSION`.
3. Add a golden file: the old shape as input, the migrated result as the
   expectation.
4. Run `pnpm generate` to update the JSON Schema and the events reference.
5. Update `docs/project-format.md`, and the changelog.

Adding a trigger, condition or action is smaller but has the same shape: the
schema variant, an entry in the catalog with a label, a summary, the movement
modes it applies to and a working example, and whatever referential check it
needs in `validate.ts`. The tests will tell you if you missed one of those, and
`pnpm generate` writes the reference page for you.

## Commits and pull requests

Small, focused commits with messages that say why. A commit that adds a
dependency says what it is for. A commit that fixes a bug references the test
that now covers it.
