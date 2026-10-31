# Spinoza Ethics Markup Project

The goal of this project is a machine-readable model of Spinoza's *Ethics* that captures its geometric structure, so the argument can be read, analyzed and navigated. This document records what exists and what remains an idea. For how to work on the code, see the [README](README.md).

## What is built

| Goal | Where |
| --- | --- |
| Structural markup of all five parts | `public/ethica_1.xml` to `ethica_5.xml`, generated from `ethica.txt` |
| Latin aligned to the same passage ids | `public/ethica_la_1.json` to `ethica_la_5.json` |
| Graph of logical relationships | `public/ethica-logic.n3` |
| Inference of direct and transitive dependencies | `src/lib/inference.ts`, `src/lib/analysis.ts` |
| Hypertext reading interface | `src/` |
| Validation of structure and logical consistency | `src/lib/corpus.integrity.test.ts`, `src/lib/graph.integrity.test.ts` |

### Graph vocabulary

The namespace is `http://spinoza.org/ethics#`.

| Predicate | Meaning |
| --- | --- |
| `cites` | The passage's own text refers to the target |
| `provedBy` | A proposition, lemma or corollary and its proof |
| `hasCorollary` | A proposition or lemma and its corollary |
| `hasNote` | A passage and its note or explanation |
| `partOf` | A passage and the passage it belongs to |

Inference adds `dependsUpon`, and transitive dependencies are found by walking it. This runs in TypeScript rather than through an N3 reasoner such as EYE, which keeps the reader's payload small.

## Ideas not yet built

- **Typed citations.** The first design distinguished predicates such as `clearlyfollowsFrom`, `groundedIn` and `appliesResultFrom`. Telling these apart means classifying Spinoza's prose, which pattern matching can't do reliably, so every citation is currently a plain `cites`.
- **Citations from Latin.** The Latin states its citations explicitly and sometimes more fully than Elwes. It could supplement the English, or be used to flag differences.
- **Other translations.** The shared passage ids should make further languages and translations straightforward to add.
- **Graph exports and visualization.** JSON-LD, GraphML or DOT exports, and network views of the argument.
- **Analysis tools.** Comparing argument structures, finding gaps in demonstrations, or tracing the influence of particular definitions.
- **Reader features.** Bookmarks, personal notes and shareable annotations, as sketched in the design mockup.
- **Wider connections.** Links to other works, guided paths for students, and machine learning on the argument's structure.
