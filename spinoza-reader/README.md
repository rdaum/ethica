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

## Future Enhancements

- Full EYE-js integration for advanced logical reasoning
- Multi-part support (currently Part I only)
- Advanced text selection and annotation
- Export functionality for citations and analysis
- Search and filtering capabilities
- Cross-reference navigation

This application transforms Spinoza's systematic philosophy into an interactive digital experience, enabling scholars and students to explore the logical structure with modern computational tools.
