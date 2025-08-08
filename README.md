# Spinoza's Ethics - Interactive Reader

A React application for exploring Spinoza's *Ethics* using computational reasoning and knowledge graphs. Uses EYE-js for automated logical inference and N3.js for semantic querying.

🌐 **[Live Application](https://rdaum.github.io/ethica/)**

## Features

### Reading Interface
- Attractive reader interface
- Structured navigation through definitions, axioms, and propositions
- Interactive elements with hover and click functionality
- Spinoza's signet ring in header design

### Computational Analysis
- EYE-js integration for automated logical inference
- N3.js for RDF/N3 data querying
- Hybrid architecture combining data storage with reasoning
- Distinction between original and inferred relationships

### Logical Analysis Tools
- Weight analysis showing foundational scores and influence metrics
- Dependency mapping with relationship breakdowns
- Cross-navigation between text and analysis panel
- Transitive chain discovery

### Navigation
- Click any element to explore its logical relationships
- Relationship display with formatted predicates
- Tooltips for analytical metrics
- Smooth scrolling with element highlighting

## Development

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build

# Deploy to GitHub Pages
npm run deploy
```

## Project Structure

```
/
├── public/                 # Static assets and data files
│   ├── ethica_1.xml       # XML markup of Ethics Part I
│   ├── ethica-logic.n3    # N3 knowledge graph (data layer)
│   ├── ethica-logic-eye.n3 # N3 reasoning rules (EYE-js layer)
│   └── spinoza-signet.png # Spinoza's signet ring image
├── src/
│   ├── components/        # React components
│   │   ├── BookView.tsx   # Text display with Roman numeral formatting
│   │   └── ReasoningPanel.tsx # Relationship explorer
│   ├── App.tsx           # Main application with data loading
│   └── App.css           # Styling and typography
├── craco.config.js       # Webpack config for Node.js polyfills
└── package.json          # Dependencies and build scripts
```

## Analysis Capabilities

### Relationship Types
- Citations - textual references between elements
- Logical consequences - what follows from what
- Proofs and demonstrations - argument construction
- Foundational dependencies - conceptual building blocks

### Metrics
- Foundational Score - how fundamental an element is
- Dependency Depth - layers of logical dependencies  
- Transitive Influence - reach of an element's impact
- Inferred Relationships - EYE-js discovered connections

### Interactive Features
- Element selection shows logical context
- Navigation between related elements
- Transitive chain exploration
- Metric explanations via tooltips

## Technical Implementation

### Architecture
- React 18 with TypeScript
- Functional components with hooks
- CSS Grid and Flexbox layout

### Data Processing
- XML parsing for structured text extraction
- N3 store management for relationship queries
- EYE-js inference engine for reasoning
- Cross-referencing between text and semantic data

### Deployment
- GitHub Pages hosting
- Automated deployment from build directory
- Webpack optimization with suggested code splitting

## Current Status

- Part I: Concerning God - complete implementation
- 117 elements parsed from XML structure
- 1,270+ RDF triples capturing logical relationships
- EYE-js inference rules active
- Full cross-navigation implemented

## Future Work

### Content
- Parts II-V of the *Ethics*
- Cross-part relationship analysis
- Latin text integration

### Features  
- Search functionality
- Export capabilities
- User annotations
- Translation comparisons

### Analysis
- Graph visualization
- Argument strength quantification
- Reasoning pattern recognition

## Text Attribution

Uses the English translation by R.H.M. Elwes (1883) from [Project Gutenberg #3800](https://www.gutenberg.org/files/3800/3800-h/3800-h.htm). Original text is public domain.

## Technologies

- React 18
- TypeScript  
- EYE-js (Euler Yet another proof Engine)
- N3.js (RDF/N3 processing)
- fast-xml-parser
- CRACO (Create React App Configuration Override)
- GitHub Pages

---

*"The order and connection of ideas follows the order and connection of things."* - Spinoza, Ethics Part II, Proposition 7
