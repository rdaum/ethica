# Ethica

An interactive reader for Spinoza's *Ethics*, built with React and TypeScript. It presents the whole work in English and Latin and traces the geometric argument from passage to passage.

Live site: [rdaum.github.io/ethica](https://rdaum.github.io/ethica/)

## What it does

- Reads Parts I-V in the Elwes translation, in English, Latin, or side by side
- Keeps the book's structure: definitions, axioms, propositions, proofs, corollaries and their proofs, notes, lemmas, postulates, prefaces and appendices
- Shows what each passage rests on and what rests on it, with shortest dependency paths you can follow step by step
- Searches within a part, across both languages
- Links directly to any part (`#III`) or passage (`#III.prop.6`), and works with the back button
- Works by keyboard alone and on small screens

## Development

```bash
npm install
npm start
```

| Command | Purpose |
| --- | --- |
| `npm test` | Unit and data integrity tests |
| `npm run test:e2e` | Browser tests (run `npx playwright install chromium` once first) |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm run build` | Production build into `build/` |
| `npm run generate:corpus` | Regenerate all data in `public/` from the sources |
| `npm run deploy` | Build and publish to GitHub Pages |

CI runs all of these except deployment, and fails if regenerating the English corpus changes `public/`. It skips the Latin because that needs network access; `generate-latin.mjs` caches its downloads in `.cache/latin/`.

## How it fits together

```text
ethica.txt ──────► scripts/generate-corpus.mjs ──► public/ethica_N.xml
                            │                      public/ethica-logic.n3
                            └─ scripts/lib/citations.mjs

The Latin Library ► scripts/generate-latin.mjs ──► public/ethica_la_N.json

public/ ─────────► src/App.tsx ── reader state, loading, URL
                     ├─ components/BookView.tsx        the text
                     ├─ components/ReasoningPanel.tsx  analysis of a passage
                     └─ lib/analysisClient.ts ► workers/reasoningWorker.ts
                                                  └─ lib/analysis.ts, lib/inference.ts
```

Files in `public/` are generated. Change the generators rather than editing them by hand.

### Passages

Each passage has a stable id such as `III.prop.27.corollary2.proof`, shared by the XML, the Latin and the graph. A numbered proof like `I.prop.11.proof2` is always a true alternate ("Another proof"); the proof of a corollary sits under that corollary.

### Citations and dependencies

`scripts/lib/citations.mjs` is the only place citations are read from the text. The graph records them as `cites`, alongside the structural `provedBy`, `hasCorollary`, `hasNote` and `partOf`.

`lib/inference.ts` derives `dependsUpon` from these, and `lib/analysis.ts` walks it to find transitive dependencies and paths. Only demonstrative passages create dependencies: citations in notes, explanations, prefaces and appendices stay as references, because they can legitimately look ahead. Tests assert that the resulting graph has no cycles and that no demonstration depends on a later proposition.

### Latin alignment

`generate-latin.mjs` walks the Latin in the order of the English passages. Generation fails if any Latin block is left unplaced, apart from a short reviewed list in the script.

## Known gaps in the source text

The English source (Project Gutenberg #3800) differs from the Latin in a few places. The reader follows the source rather than supplying a translation:

- **Missing from the English:** the corollaries of II.xiii. and IV.l., and the proof of IV.lxxii. Their Latin is not shown, because there is no English passage to attach it to. The passage the source labels "Proof" at IV.lxxii. translates the Latin scholium, so it appears here as a note.
- **Citations without a target:** II.xvii. note cites the same missing corollary of II.xiii. Two others, in the proofs of III.i. and III.xix., cite a corollary or note the proposition doesn't have. All three resolve to the proposition. `node scripts/generate-corpus.mjs --report-citations` lists them.
- **Misprint:** the proof of IV.i. prints "IV. iii." where the Latin has III.iv. The text is unchanged, and the graph follows the Latin.
- **Typography:** the source uses a long dash for ordinary hyphens, as in "self—caused". This is left as it is.

## Dependency notes

- `npm audit` reports a moderate `minimatch` advisory. It is only reachable through ESLint, which runs on this repository's own files, and the production dependencies are clean. The suggested fix would downgrade ESLint to version 4, so it has not been applied.
- TypeScript stays on 5.9 until `typescript-eslint` supports version 7.

## Project direction

[SPINOZA_MARKUP_PROJECT.md](SPINOZA_MARKUP_PROJECT.md) separates what has been built from ideas for later.

## Text attribution

The English is the translation by R.H.M. Elwes (1883) from [Project Gutenberg #3800](https://www.gutenberg.org/files/3800/3800-h/3800-h.htm). The Latin is from [The Latin Library](https://www.thelatinlibrary.com/spinoza.html). Both texts are in the public domain.
