#!/usr/bin/env python3
"""
N3 Semantic Validator for Spinoza Ethics project
Checks for semantic consistency in our citation graph
"""

import re
import sys
from collections import defaultdict, Counter

def parse_n3_file(filename):
    """Parse N3 file and extract triples"""
    triples = []
    prefixes = {}
    
    with open(filename, 'r') as f:
        content = f.read()
    
    # Extract prefixes
    prefix_matches = re.findall(r'@prefix\s+(\w+):\s+<([^>]+)>\s+\.', content)
    for prefix, uri in prefix_matches:
        prefixes[prefix] = uri
    
    # Extract triples (simplified parsing)
    lines = content.split('\n')
    current_subject = None
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('@prefix'):
            continue
            
        # Handle multi-line triples
        if re.match(r'^\w+:\w+.*', line):
            # New subject
            parts = line.split()
            if len(parts) >= 3:
                current_subject = parts[0]
                predicate = parts[1]
                obj = ' '.join(parts[2:]).rstrip(' ;.,')
                triples.append((current_subject, predicate, obj))
        elif line.startswith('ethics:') and current_subject:
            # Continuation with same subject
            parts = line.split(None, 1)
            if len(parts) >= 2:
                predicate = parts[0]
                obj = parts[1].rstrip(' ;.,')
                triples.append((current_subject, predicate, obj))
    
    return triples, prefixes

def validate_citations(triples):
    """Validate citation consistency"""
    errors = []
    warnings = []
    
    # Track all defined elements
    defined_elements = set()
    citations = defaultdict(list)
    element_types = defaultdict(str)
    
    for subj, pred, obj in triples:
        # Track defined elements
        if pred == 'a':
            defined_elements.add(subj)
            element_types[subj] = obj
            
        # Track citations
        if pred == 'ethics:cites':
            for cited in obj.split(','):
                cited = cited.strip()
                citations[subj].append(cited)
    
    # Check that all cited elements are defined
    for citer, cited_list in citations.items():
        for cited in cited_list:
            if cited not in defined_elements:
                errors.append(f"Element {citer} cites undefined element: {cited}")
    
    # Check for self-citations
    for citer, cited_list in citations.items():
        if citer in cited_list:
            warnings.append(f"Self-citation detected: {citer} cites itself")
    
    return errors, warnings, defined_elements, citations, element_types

def validate_hierarchy(triples):
    """Validate hierarchical relationships"""
    errors = []
    warnings = []
    
    parts = set()
    sections = set() 
    elements = set()
    part_sections = defaultdict(set)
    section_elements = defaultdict(set)
    
    for subj, pred, obj in triples:
        if pred == 'a':
            if 'Part' in obj:
                parts.add(subj)
            elif 'Section' in obj:
                sections.add(subj) 
            elif obj in ['ethics:Definition', 'ethics:Axiom', 'ethics:Proposition']:
                elements.add(subj)
        elif pred == 'ethics:partOf':
            if obj in parts:
                sections.add(subj)
                part_sections[obj].add(subj)
            elif obj in sections:
                elements.add(subj)
                section_elements[obj].add(subj)
                
    # Check that all elements have proper hierarchy
    orphaned_elements = elements - {elem for section_elems in section_elements.values() for elem in section_elems}
    if orphaned_elements:
        warnings.extend([f"Element {elem} not properly assigned to section" for elem in orphaned_elements])
        
    return errors, warnings

def generate_stats(triples, citations, element_types):
    """Generate statistics about the N3 structure"""
    stats = {
        'total_triples': len(triples),
        'total_elements': len([s for s, p, o in triples if p == 'a']),
        'total_citations': sum(len(cited) for cited in citations.values()),
        'element_type_counts': Counter(element_types.values()),
        'citation_counts': {k: len(v) for k, v in citations.items()},
        'most_cited': Counter([cited for cited_list in citations.values() for cited in cited_list])
    }
    return stats

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 n3_semantic_validator.py <file.n3>")
        sys.exit(1)
        
    filename = sys.argv[1]
    
    try:
        triples, prefixes = parse_n3_file(filename)
        
        print(f"N3 Semantic Validation Report for: {filename}")
        print("=" * 60)
        
        # Validate citations
        cite_errors, cite_warnings, defined_elements, citations, element_types = validate_citations(triples)
        
        # Validate hierarchy
        hier_errors, hier_warnings = validate_hierarchy(triples)
        
        # Generate statistics
        stats = generate_stats(triples, citations, element_types)
        
        # Report errors
        all_errors = cite_errors + hier_errors
        all_warnings = cite_warnings + hier_warnings
        
        if all_errors:
            print(f"\nERRORS ({len(all_errors)}):")
            for error in all_errors:
                print(f"  ❌ {error}")
        else:
            print("\n✅ No semantic errors found!")
            
        if all_warnings:
            print(f"\nWARNINGS ({len(all_warnings)}):")
            for warning in all_warnings:
                print(f"  ⚠️  {warning}")
        else:
            print("\n✅ No semantic warnings found!")
        
        # Statistics
        print(f"\nSTATISTICS:")
        print(f"  📊 Total triples: {stats['total_triples']}")
        print(f"  📊 Total elements: {stats['total_elements']}")
        print(f"  📊 Total citations: {stats['total_citations']}")
        
        print(f"\nELEMENT TYPE BREAKDOWN:")
        for elem_type, count in stats['element_type_counts'].most_common():
            type_name = elem_type.replace('ethics:', '')
            print(f"  📈 {type_name}: {count}")
            
        print(f"\nMOST CITED ELEMENTS:")
        for element, count in stats['most_cited'].most_common(10):
            print(f"  🔗 {element}: {count} citations")
        
        print(f"\nSummary: {len(all_errors)} errors, {len(all_warnings)} warnings")
        
        if all_errors:
            sys.exit(1)
            
    except FileNotFoundError:
        print(f"Error: File '{filename}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()