# Spinoza Ethics Reader

A modern React application for exploring Spinoza's Ethics with interactive text and logical reasoning capabilities.

## Features

- **Book-like Typography**: Elegant serif typography with Charter font for an authentic reading experience
- **Interactive Text Elements**: Click on definitions, axioms, propositions, proofs, corollaries, and notes
- **Logical Relationship Exploration**: Discover citations and logical connections between elements
- **N3 Knowledge Graph Integration**: Loads formal logical structure from N3 triples
- **Responsive Design**: Works on desktop and mobile devices
- **Future EYE-js Integration**: Prepared for advanced logical reasoning with EYE reasoner

## Architecture

### Components

- **App.tsx**: Main application with data loading and state management
- **BookView.tsx**: Book-like text display with interactive elements
- **ReasoningPanel.tsx**: Side panel showing logical analysis of selected elements
- **InteractiveText.tsx**: Component for advanced text interaction (future enhancement)

### Data Sources

- **ethica_1.xml**: Original XML markup of Spinoza's Ethics Part I
- **ethica-logic.n3**: N3 triples representing logical relationships

### Technologies

- React 18 with TypeScript
- N3.js for RDF/N3 processing
- fast-xml-parser for XML processing
- Charter font for book-like typography
- CSS Grid and Flexbox for layout
- Prepared for EYE-js reasoning integration

## Getting Started

```bash
cd spinoza-reader
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Usage

1. **Reading**: Scroll through the beautifully formatted text of Spinoza's Ethics
2. **Exploration**: Hover over elements to see interactive hints
3. **Analysis**: Click on any definition, axiom, or proposition to see its logical relationships
4. **Discovery**: Use the reasoning panel to understand citations and dependencies

## Available Scripts

### `npm start`

Runs the app in development mode at [http://localhost:3000](http://localhost:3000).

### `npm test`

Launches the test runner in interactive watch mode.

### `npm run build`

Builds the app for production to the `build` folder.

## Current State & EYE-js Integration

### What's Working Now ✅
- **Hybrid Architecture**: N3.js for efficient data querying + EYE-js for automated reasoning
- **True EYE-js Reasoning**: Active inference rules automatically discover new logical relationships
- **Visual Distinction**: Original relationships (blue) vs. inferred relationships (purple with 🔍 badge)
- **Interactive Exploration**: Click elements to see citations, dependencies, and logical connections
- **Weight Analysis**: Computational analysis of how "load-bearing" elements are in the philosophical structure
- **Robust Error Handling**: Application works even if reasoning fails

### EYE-js Integration Architecture
The application uses a **clean separation of concerns**:

**N3.js (Data Layer)**:
- Efficient indexed querying of base facts from `ethica-logic.n3`
- Fast relationship lookup with `getQuads(subject, predicate, object, graph)`
- Standard RDF/JS compatibility

**EYE-js (Reasoning Layer)**:
- Processes active inference rules from `ethica-logic-eye.n3`
- Automatically discovers transitive dependencies, circular arguments, and implicit relationships
- Returns new facts as standard RDF/JS quads

**Active Reasoning Rules Include**:
```n3
# Transitivity across relationship types
{ ?x ethics:necessarilyFollows ?y . ?y ethics:appliesResultFrom ?z }
    => { ?x ethics:transitivelyDependsOn ?z } .

# Citation implies dependency
{ ?x ethics:cites ?y } => { ?x ethics:dependsUpon ?y } .

# Circular argument detection
{ ?x ethics:refutedByAbsurdity ?y . ?y ethics:refutedByAbsurdity ?x }
    => { ?x ethics:circularArgument ?y } .
```

### Benefits Realized
- **Automatic Discovery**: EYE-js finds logical connections not explicitly mapped
- **Formal Validation**: Reasoning engine validates Spinoza's argument structure  
- **Extensible Rules**: Easy to add new inference patterns for deeper analysis
- **Performance**: N3 Store provides efficient querying while EYE-js handles complex reasoning

## Future Enhancements

### Immediate Priorities
- **Performance Optimization**: Optimize EYE-js reasoning for larger datasets

### Content Expansion  
- **Parts II-V**: Currently only Part I ("Concerning God") is implemented
  - Part II: Of the Nature and Origin of the Mind
  - Part III: On the Origin and Nature of the Emotions
  - Part IV: Of Human Bondage, or the Strength of the Emotions  
  - Part V: Of the Power of the Understanding, or of Human Freedom
- **Cross-Part Navigation**: Logical relationships span across all five parts
- **Complete Logical Graph**: Full Ethics as integrated knowledge system

### Multilingual & Comparative Analysis
- **Original Latin Text Integration**: Side-by-side with Elwes English translation
- **Cross-linguistic Cross-linking**: Connect corresponding elements between Latin and English
- **Comparative Reasoning**: Analyze how translation choices affect logical relationships
- **Scholarly Apparatus**: Support for multiple translations and critical editions

### Advanced Features
- Advanced text selection and annotation
- Export functionality for citations and analysis
- Search and filtering capabilities across all parts
- Visual graph representation of logical relationships
- Automated consistency checking across the complete system

This application transforms Spinoza's systematic philosophy into an interactive digital experience, enabling scholars and students to explore the logical structure with modern computational tools.
