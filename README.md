# Ethica

An interactive reader for Spinoza's *Ethics* built in React and TypeScript.

The project combines:

- structured XML editions of the text
- a Latin-aligned parallel text layer keyed to the same passage ids
- an explicit N3 graph of logical relationships
- lightweight rule-based inferred relationships
- a corpus generation step that keeps XML and graph data aligned
- a reader UI designed for navigation, cross-reference tracing, and close reading

Live site: [rdaum.github.io/ethica](https://rdaum.github.io/ethica/)

## What It Does

The reader currently supports Parts I-V of the *Ethics* in the Elwes translation, with:

- ordered reading flow rather than a flat “demo app” section dump
- support for nested material such as physical axioms, lemmas, postulates, notes, explanations, and appendix sections
- passage selection with logical analysis in a side panel
- cross-navigation between cited and related passages
- URL deep-linking to individual passages
- part-local search
- inferred dependency and transitive relationship display

## Architecture

The app has three main layers:

1. Text layer
   XML files in `public/ethica_1.xml` through `public/ethica_5.xml` are parsed into a typed in-memory reader model.
   Latin alignment files in `public/ethica_la_1.json` through `public/ethica_la_5.json` attach bilingual text to the same canonical ids.

2. Graph layer
   `public/ethica-logic.n3` contains explicit graph data.
   `public/ethica-logic-eye.n3` contains both explicit triples and rule-based inference input.

3. Reader layer
   React components render the ordered text, section navigation, search, and analysis panel.

## Important Source Files

```text
src/
├── App.tsx                       # Application shell, loading, navigation, selection state
├── types.ts                      # Shared reader and analysis types
├── lib/
│   ├── ethica.ts                 # XML parsing, labels, section summaries, graph helpers
│   ├── ethica.test.ts            # Parser-focused tests
│   ├── readerGraph.ts            # Supplemental graph generation from parsed text
│   └── readerGraph.test.ts       # Supplemental graph tests
└── components/
    ├── BookView.tsx              # Main reading surface
    └── ReasoningPanel.tsx        # Logical analysis panel
```

```text
scripts/
├── generate-corpus.mjs           # Regenerates Parts I-V XML and the explicit graph
└── generate-latin.mjs            # Aligns Latin Library text to the canonical corpus ids
```

```text
public/
├── ethica_1.xml                  # Part I markup
├── ethica_2.xml                  # Part II markup
├── ethica_3.xml                  # Part III markup
├── ethica_4.xml                  # Part IV markup
├── ethica_5.xml                  # Part V markup
├── ethica_la_1.json              # Part I Latin alignment
├── ethica_la_2.json              # Part II Latin alignment
├── ethica_la_3.json              # Part III Latin alignment
├── ethica_la_4.json              # Part IV Latin alignment
├── ethica_la_5.json              # Part V Latin alignment
├── ethica-logic.n3               # Explicit graph
├── ethica-logic-eye.n3           # Explicit triples + inference rules
└── spinoza-signet.png            # Reader branding asset
```

## Development

```bash
npm install
npm start
```

Useful commands:

```bash
npm run generate:corpus
npx tsc --noEmit
CI=true npm test -- --watchAll=false
npm run build
```

## Data Model Notes

The reader now treats the generated explicit graph as the primary source of structural and citation relationships.

The canonical passage structure is now Latin-governed. In practice that means:

- the English XML is the reader's structural source
- the Latin alignment script validates that this structure can be walked in the order signaled by the original Latin
- obvious English-only editorial additions are preserved, but marked as editorial rather than treated as authorial structure
- Part IV appendix chapters follow the Latin `CAPUT` structure instead of anonymous synthetic argument buckets

At runtime it still builds a supplemental graph from the parsed XML in order to provide backfill only when the canonical graph lacks a relationship. That backfill covers:

- structural relationships such as `partOf`, `provedBy`, `hasCorollary`, and `hasNote`
- citation coverage extracted from prose references when an explicit triple is absent

In other words:

- canonical graph facts come from the generated corpus files in `public/`
- supplemental facts are reader-side backfill for structurally obvious parent-child links and prose citations whose targets already exist in the parsed part data
- the reader should not invent references to passages that are absent from the currently loaded corpus model

The canonical graph files are regenerated from the corpus, so the XML and N3 layers no longer drift independently.

## Current State

What is in relatively good shape:

- Parts I-V render in reading order
- Parts I-V are generated into XML from `ethica.txt`
- Parts I-V also have Latin parallel text aligned to the same passage ids
- the explicit graph is regenerated from the corpus instead of being maintained only as ad hoc hand-edited triples
- build, tests, and TypeScript checks pass
- the analysis payload is much smaller than before due to lightweight local inference
- the reader UI is no longer structured like a prototype shell

What is still incomplete:

- the graph is much more coherent, but it is still a reader-oriented reference graph rather than a full scholarly critical apparatus
- inference remains useful but is not yet a polished scholarly model
- there is not yet a dedicated editorial normalization pipeline for harmonizing every source-text edge case across all five parts

## Next Work

The highest-value next steps are:

- improve passage-level metadata and editorial annotations
- add better tests around navigation and analysis behavior
- consider replacing the aging CRA/CRACO stack with a more current frontend toolchain

## Text Attribution

Uses the English translation by R.H.M. Elwes (1883) from [Project Gutenberg #3800](https://www.gutenberg.org/files/3800/3800-h/3800-h.htm). The text is public domain.
