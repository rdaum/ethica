# Ethica

An interactive reader for Spinoza's *Ethics*, built with React and TypeScript. It presents the whole work in English, French and Latin and traces the geometric argument from passage to passage.

Live site: [rdaum.github.io/ethica](https://rdaum.github.io/ethica/)

## What it does

- Reads Parts I-V in English (Elwes), French (Appuhn) or Latin, or any two side by side
- Also includes the *Political Treatise* in English (Gosset) and Latin, linked to the *Ethics* where its 1883 editor gives a reference
- Keeps the book's structure: definitions, axioms, propositions, proofs, corollaries and their proofs, notes, lemmas, postulates, prefaces and appendices
- Shows what each passage rests on and what rests on it, with shortest dependency paths you can follow step by step
- Searches within a part, across both languages
- Links directly to any part (`#III`), passage (`#III.prop.6`), chapter (`#TP.II`) or section (`#TP.II.5`), and works with the back button
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
| `npm run generate:corpus` | Regenerate the *Ethics* data in `public/` from the sources |
| `npm run generate:french` | Regenerate the French *Ethics* |
| `npm run generate:political` | Regenerate the *Political Treatise*, after downloading its English by hand |
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

### French text

`generate-french.mjs` parses Appuhn's 1913 translation from [French Wikisource](https://fr.wikisource.org/wiki/%C3%89thique_(Appuhn,_1913)) into `public/ethica_fr_N.json`, keyed by the same passage IDs as the English. Run `npm run generate:french -- --report` to see the alignment, length ratios and possible transcription slips. Generation fails if a passage or label doesn't line up. Slips confirmed against the scan of the printed edition are corrected in the script.

### Political Treatise

`generate-political.mjs` writes `public/political_N.json` and `public/political-logic.n3`, which the analysis worker loads alongside the *Ethics* graph. The English must first be downloaded by hand from the [Constitution Society](https://constitution.org/2-Authors/bs/poltreat.txt) to `.cache/political/poltreat.txt`. The Latin comes from the [Latin Wikisource](https://la.wikisource.org/wiki/Tractatus_Politicus) API. Both texts number their 211 sections alike, and generation fails if they stop lining up.

Three kinds of link are kept apart:

- **Spinoza's section references** ("per Art. 4. Cap. 2.") become `ethics:cites`. They are read from both languages. Where they disagree, the Latin wins, through a short reviewed list in the script that fails generation if anything new appears.
- **The 1883 editor's footnotes** are the only source of references to specific passages of the *Ethics*, so they become `ethics:editorCites` and the panel labels them as the editor's. Spinoza's own text says only "in our Ethics", at I.5, II.1, II.24 and VII.6, and II.24 has no footnote, so it has no link.
- **Dependencies** are not derived from the treatise at all. Its sections count as non-demonstrative, so it adds nothing to the *Ethics* dependency chains.

## Known gaps in the source text

The English source (Project Gutenberg #3800) differs from the Latin in a few places. The reader follows the source rather than supplying a translation:

- **Missing from the English:** the corollaries of II.xiii. and IV.l., and the proof of IV.lxxii. The reader shows these passages with a note in English, and their text in French and Latin. Their place in the citation graph comes from a short reviewed list in `generate-corpus.mjs`, read from the printed Latin and French.
- **Citations without a target:** II.xvii. note cites the same missing corollary of II.xiii. Two others, in the proofs of III.i. and III.xix., cite a corollary or note the proposition doesn't have. All three resolve to the proposition. `node scripts/generate-corpus.mjs --report-citations` lists them.
- **Misprint:** the proof of IV.i. prints "IV. iii." where the Latin has III.iv. The text is unchanged, and the graph follows the Latin.
- **Political Treatise, English:** this is a 1998 transcription that has not yet been compared with a scan of the 1883 edition. It misprints some references (II.15 has "Sec. 18" for 13). Its text is unchanged, and the graph follows the Latin.
- **Political Treatise, Latin:** the Wikisource page states no edition and has visible typing errors, such as "Sedi ne ii" in II.1. These are left as found. Its numbered note markers have no notes, so they are removed, and Chapter VIII's synopsis opens its first section.
- **Typography:** the source uses a long dash for ordinary hyphens, as in "self—caused". The generator hyphenates the compounds listed in `scripts/lib/compounds.mjs` and leaves every other dash as printed.

## Dependency notes

- `npm audit` reports a moderate `minimatch` advisory. It is only reachable through ESLint, which runs on this repository's own files, and the production dependencies are clean. The suggested fix would downgrade ESLint to version 4, so it has not been applied.
- TypeScript stays on 5.9 until `typescript-eslint` supports version 7.

## Project direction

[SPINOZA_MARKUP_PROJECT.md](SPINOZA_MARKUP_PROJECT.md) separates what has been built from ideas for later.

## Text attribution

The English is the translation by R.H.M. Elwes (1883) from [Project Gutenberg #3800](https://www.gutenberg.org/files/3800/3800-h/3800-h.htm). The Latin is from [The Latin Library](https://www.thelatinlibrary.com/spinoza.html). Both texts are in the public domain.

The *Political Treatise* is translated by A.H. Gosset and edited by R.H.M. Elwes (G. Bell, 1883), as transcribed by Jon Roland of the [Constitution Society](https://constitution.org/2-Authors/bs/poltreat.txt) in 1998. Its Latin is from [Latin Wikisource](https://la.wikisource.org/wiki/Tractatus_Politicus).
