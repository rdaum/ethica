#!/usr/bin/env node

/**
 * Spinoza Ethics Knowledge Graph Explorer
 * Uses N3.js to query and analyze the logical structure
 */

const fs = require('fs');
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;

class EthicsExplorer {
    constructor(n3FilePath) {
        this.store = new N3.Store();
        this.parser = new N3.Parser();
        this.n3FilePath = n3FilePath;
    }

    async loadGraph() {
        console.log('📖 Loading Spinoza Ethics N3 graph...');
        const n3Content = fs.readFileSync(this.n3FilePath, 'utf8');
        
        return new Promise((resolve, reject) => {
            this.parser.parse(n3Content, (error, quad, prefixes) => {
                if (error) {
                    reject(error);
                } else if (quad) {
                    this.store.addQuad(quad);
                } else {
                    console.log(`✅ Loaded ${this.store.size} triples`);
                    console.log('📋 Prefixes:', Object.keys(prefixes).join(', '));
                    resolve(prefixes);
                }
            });
        });
    }

    // Query 1: What does a specific proposition cite?
    getCitations(proposition) {
        console.log(`\n🔍 CITATIONS FOR ${proposition}:`);
        const citations = this.store.getQuads(
            namedNode(`http://spinoza.org/ethics#${proposition}`),
            namedNode('http://spinoza.org/ethics#cites'),
            null
        );

        citations.forEach(quad => {
            const cited = quad.object.value.replace('http://spinoza.org/ethics#', '');
            console.log(`  📖 Cites: ${cited}`);
        });

        return citations.length;
    }

    // Query 2: What follows necessarily from a definition/axiom?
    getLogicalConsequences(element) {
        console.log(`\n⚡ WHAT NECESSARILY FOLLOWS FROM ${element}:`);
        const consequences = this.store.getQuads(
            null,
            namedNode('http://spinoza.org/ethics#necessarilyFollows'),
            namedNode(`http://spinoza.org/ethics#${element}`)
        );

        consequences.forEach(quad => {
            const consequent = quad.subject.value.replace('http://spinoza.org/ethics#', '');
            console.log(`  ⚡ ${consequent} necessarily follows`);
        });

        return consequences.length;
    }

    // Query 3: Find all elements that use reductio ad absurdum
    getReductioArguments() {
        console.log(`\n💥 REDUCTIO AD ABSURDUM ARGUMENTS:`);
        const reductions = this.store.getQuads(
            null,
            namedNode('http://spinoza.org/ethics#refutedByAbsurdity'),
            null
        );

        const reductioElements = new Set();
        reductions.forEach(quad => {
            const subject = quad.subject.value.replace('http://spinoza.org/ethics#', '');
            reductioElements.add(subject);
        });

        reductioElements.forEach(element => {
            console.log(`  💥 ${element} uses reductio ad absurdum`);
        });

        return reductioElements.size;
    }

    // Query 4: Trace logical dependency chain (includes sub-elements like proofs)
    traceDependencyChain(startElement, maxDepth = 3) {
        console.log(`\n🔗 DEPENDENCY CHAIN FROM ${startElement}:`);
        const visited = new Set();
        
        const trace = (element, depth) => {
            if (depth > maxDepth || visited.has(element)) return;
            visited.add(element);

            const indent = '  '.repeat(depth);
            console.log(`${indent}📍 ${element}`);

            // Find direct dependencies
            const directDeps = this.store.getQuads(
                namedNode(`http://spinoza.org/ethics#${element}`),
                namedNode('http://spinoza.org/ethics#cites'),
                null
            );

            // If no direct dependencies, look for sub-element dependencies (proofs, corollaries, etc.)
            if (directDeps.length === 0) {
                const subElements = this.store.getQuads(
                    null,
                    namedNode('http://spinoza.org/ethics#partOf'),
                    namedNode(`http://spinoza.org/ethics#${element}`)
                );

                subElements.forEach(subQuad => {
                    const subElement = subQuad.subject.value.replace('http://spinoza.org/ethics#', '');
                    const subDeps = this.store.getQuads(
                        namedNode(`http://spinoza.org/ethics#${subElement}`),
                        namedNode('http://spinoza.org/ethics#cites'),
                        null
                    );
                    
                    if (subDeps.length > 0) {
                        console.log(`${indent}  (via ${subElement}):`);
                        subDeps.forEach(depQuad => {
                            const dependency = depQuad.object.value.replace('http://spinoza.org/ethics#', '');
                            trace(dependency, depth + 1);
                        });
                    }
                });
            } else {
                // Use direct dependencies
                directDeps.forEach(quad => {
                    const dependency = quad.object.value.replace('http://spinoza.org/ethics#', '');
                    trace(dependency, depth + 1);
                });
            }
        };

        trace(startElement, 0);
    }

    // Query 5: Find most cited elements (authority analysis)
    getMostCitedElements(topN = 10) {
        console.log(`\n👑 TOP ${topN} MOST CITED ELEMENTS:`);
        
        const citationCounts = new Map();
        
        const citations = this.store.getQuads(
            null,
            namedNode('http://spinoza.org/ethics#cites'),
            null
        );

        citations.forEach(quad => {
            const cited = quad.object.value.replace('http://spinoza.org/ethics#', '');
            citationCounts.set(cited, (citationCounts.get(cited) || 0) + 1);
        });

        const sorted = Array.from(citationCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN);

        sorted.forEach(([element, count], index) => {
            console.log(`  ${index + 1}. 👑 ${element}: ${count} citations`);
        });

        return sorted;
    }

    // Query 6: Find propositions with multiple proofs
    getPropositionsWithMultipleProofs() {
        console.log(`\n🔬 PROPOSITIONS WITH MULTIPLE PROOFS:`);
        
        const proofCounts = new Map();
        
        const proofs = this.store.getQuads(
            null,
            namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            namedNode('http://spinoza.org/ethics#Proof')
        );

        proofs.forEach(quad => {
            const proofId = quad.subject.value.replace('http://spinoza.org/ethics#', '');
            // Extract proposition from proof ID (e.g., I.prop.11.proof1 -> I.prop.11)
            const propMatch = proofId.match(/^(I\.prop\.\d+)/);
            if (propMatch) {
                const prop = propMatch[1];
                proofCounts.set(prop, (proofCounts.get(prop) || 0) + 1);
            }
        });

        const multipleProofs = Array.from(proofCounts.entries())
            .filter(([prop, count]) => count > 1)
            .sort((a, b) => b[1] - a[1]);

        multipleProofs.forEach(([prop, count]) => {
            console.log(`  🔬 ${prop}: ${count} proofs`);
        });

        return multipleProofs;
    }

    // Query 7: Analyze argument structure types
    getSemanticRelationshipStats() {
        console.log(`\n📊 SEMANTIC RELATIONSHIP STATISTICS:`);
        
        const semanticPredicates = [
            'clearlyfollowsFrom',
            'necessarilyFollows',
            'groundedIn',
            'evidentFrom',
            'refutedByAbsurdity',
            'appliesResultFrom',
            'demonstratedBy',
            'provedBy',
            'buildsUpon'
        ];

        semanticPredicates.forEach(predicate => {
            const count = this.store.getQuads(
                null,
                namedNode(`http://spinoza.org/ethics#${predicate}`),
                null
            ).length;
            
            if (count > 0) {
                console.log(`  📊 ${predicate}: ${count} relationships`);
            }
        });
    }

    // Run all demonstrations
    async demonstrate() {
        try {
            await this.loadGraph();
            
            console.log('\n' + '='.repeat(60));
            console.log('🏛️  SPINOZA ETHICS KNOWLEDGE GRAPH EXPLORER');
            console.log('='.repeat(60));

            // Demonstrate various queries
            this.getCitations('I.prop.14');
            this.getLogicalConsequences('I.def.6');
            this.getReductioArguments();
            this.traceDependencyChain('I.prop.1', 2);
            this.traceDependencyChain('I.prop.11', 2);
            this.getMostCitedElements(5);
            this.getPropositionsWithMultipleProofs();
            this.getSemanticRelationshipStats();

            console.log('\n🎯 Graph exploration complete!');
            console.log('\n💡 This demonstrates the power of formal knowledge representation');
            console.log('   for philosophical texts. The logical structure is now queryable,');
            console.log('   analyzable, and can support automated reasoning!');

        } catch (error) {
            console.error('❌ Error:', error.message);
        }
    }
}

// Run the demonstration
if (require.main === module) {
    const explorer = new EthicsExplorer('./ethica-logic.n3');
    explorer.demonstrate();
}

module.exports = EthicsExplorer;