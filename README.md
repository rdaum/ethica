# Ethica

An interactive reader for Spinoza's *Ethics* built in React and TypeScript.

The project combines:

- structured XML editions of the text
- an explicit N3 graph of logical relationships
- EYE-based inferred relationships
- a reader UI designed for navigation, cross-reference tracing, and close reading

Live site: [rdaum.github.io/ethica](https://rdaum.github.io/ethica/)

## What It Does

The reader currently supports Parts I and II of the *Ethics* in the Elwes translation, with:

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
   XML files in `public/ethica_1.xml` and `public/ethica_2.xml` are parsed into a typed in-memory reader model.

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
public/
├── ethica_1.xml                  # Part I markup
├── ethica_2.xml                  # Part II markup
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
npx tsc --noEmit
CI=true npm test -- --watchAll=false
npm run build
```

## Data Model Notes

The reader does not rely only on the hand-authored N3 files.

It also generates a supplemental graph from the parsed XML in order to provide:

- structural relationships such as `partOf`, `provedBy`, `hasCorollary`, and `hasNote`
- fallback citation coverage extracted from prose references
- better analysis behavior when the older graph files are incomplete

This is a pragmatic bridge, not the final scholarly data model.

## Current State

What is in relatively good shape:

- Parts I and II render in reading order
- build, tests, and TypeScript checks pass
- the main bundle is much smaller than before due to lazy loading of inference work
- the reader UI is no longer structured like a prototype shell

What is still incomplete:

- only Parts I and II are present
- the source graph files still contain uneven coverage, especially in Part II
- inference remains useful but is not yet a polished scholarly model
- there is not yet a dedicated editorial pipeline for maintaining XML and N3 together

## Next Work

The highest-value next steps are:

- normalize and expand the source graph data instead of relying on fallback extraction
- add Parts III-V
- improve passage-level metadata and editorial annotations
- add better tests around navigation and analysis behavior
- consider replacing the aging CRA/CRACO stack with a more current frontend toolchain

## Text Attribution

Uses the English translation by R.H.M. Elwes (1883) from [Project Gutenberg #3800](https://www.gutenberg.org/files/3800/3800-h/3800-h.htm). The text is public domain.
