# Spinoza Ethics Knowledge Graph

A comprehensive N3/RDF representation of Part I of Spinoza's *Ethics* (Elwes translation) with interactive exploration tools using N3.js.

## 📁 Files Overview

- **`ethica_1.xml`** - Complete XML markup of Part I with semantic structure
- **`ethica-logic.n3`** - N3 knowledge graph with citations and logical relationships
- **`ethics-explorer.js`** - Node.js script for command-line graph exploration
- **`web-explorer.html`** - Interactive web interface for graph exploration
- **`package.json`** - Node.js dependencies

## 🚀 Quick Start

### Command Line Exploration

```bash
# Install dependencies
npm install

# Run the interactive explorer
node ethics-explorer.js
```

### Web Interface

```bash
# Serve the files (any web server)
python3 -m http.server 8000

# Open browser to http://localhost:8000/web-explorer.html
```

## 🧠 What You Can Explore

### 1. Citation Analysis
- **What does Proposition 14 cite?** → Def. 6, Prop. 11, Prop. 5
- **Most cited elements** → Find foundational definitions and key propositions
- **Citation chains** → Trace logical dependencies

### 2. Logical Relationships
- **What necessarily follows from Definition 6?** → Multiple propositions about divine nature
- **What is grounded in Axiom 1?** → Elements that build upon basic existence principles
- **Reductio ad absurdum arguments** → Propositions using proof by contradiction

### 3. Argument Structure
- **Propositions with multiple proofs** → Prop. 11 has 3 different proofs
- **Semantic relationship statistics** → Count types of logical connections
- **Document hierarchy** → Part → Sections → Elements → Sub-elements

### 4. Advanced Queries

```javascript
// Find all elements that depend on Definition 3 (substance)
const dependencies = store.getQuads(
    null,
    namedNode('http://spinoza.org/ethics#cites'),
    namedNode('http://spinoza.org/ethics#I.def.3')
);

// Find elements using specific reasoning patterns
const deductiveArgs = store.getQuads(
    null,
    namedNode('http://spinoza.org/ethics#necessarilyFollows'),
    null
);
```

## 📊 Graph Statistics

- **1,270+ triples** capturing complete logical structure
- **8 Definitions, 7 Axioms, 36 Propositions** with full hierarchy
- **80+ citation relationships** mapping textual references
- **180+ semantic relationships** classifying argument types
- **Complete appendix structure** modeling Spinoza's refutation of teleological thinking

## 🎯 Use Cases

### Academic Research
- **Argument analysis** - Identify patterns in Spinoza's reasoning
- **Dependency mapping** - Understand foundational vs. derived concepts
- **Cross-reference validation** - Verify citation accuracy and completeness

### Educational Tools
- **Interactive learning** - Explore philosophical arguments step-by-step
- **Visual navigation** - Follow logical pathways through the text
- **Concept mapping** - See relationships between ideas

### Digital Humanities
- **Computational philosophy** - Apply graph analysis to philosophical texts
- **Structural analysis** - Compare argument patterns across works
- **Knowledge representation** - Model complex philosophical systems

## 🏗️ N3 Graph Structure

### Two-Layer Architecture
1. **Physical References** - Exact textual citations (`ethics:cites`)
2. **Semantic Relationships** - Types of logical connections (`ethics:necessarilyFollows`, `ethics:groundedIn`, etc.)

### Hierarchy Modeling
- **Macro-structure** - Part I → Sections → Elements
- **Micro-structure** - Elements → Proofs → Corollaries → Notes

### Semantic Predicates
- `ethics:clearlyfollowsFrom` - "This is clear from..."
- `ethics:necessarilyFollows` - "necessarily follows"
- `ethics:refutedByAbsurdity` - Reductio ad absurdum
- `ethics:appliesResultFrom` - "by the last Prop"
- `ethics:demonstratedBy` - "as demonstrated by..."

## 🔮 Future Extensions

### Multi-Part Coverage
- Extend to Parts II-V of the Ethics
- Cross-part citation analysis
- Complete argument pathway tracing

### Multi-Language Support
- Latin original text alignment
- Multiple English translations comparison
- Cross-linguistic concept mapping

### Advanced Analytics
- Graph theory analysis (centrality, clustering)
- Machine learning on argument patterns
- Automated consistency checking

### Visualization Tools
- Interactive network graphs
- Argument pathway diagrams
- Hierarchical concept maps

## 📚 Technical Details

- **Format**: N3 (Notation3) / Turtle RDF
- **Ontology**: Custom ethics vocabulary with standard RDF predicates
- **Library**: N3.js for JavaScript parsing and querying
- **Validation**: Custom syntax and semantic validators included

## 🤝 Contributing

This project demonstrates formal knowledge representation for philosophical texts. Extensions, improvements, and applications to other philosophical works are welcome!

---

*"The order and connection of ideas follows the order and connection of things."* - Spinoza, Ethics Part II, Proposition 7