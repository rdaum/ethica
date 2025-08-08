#!/usr/bin/env python3
"""
N3 Structure Checker - Manual validation for Spinoza Ethics project
"""

import re

def check_n3_structure(filename):
    """Check the structure of our N3 file manually"""
    
    with open(filename, 'r') as f:
        content = f.read()
    
    # Count elements
    definitions = len(re.findall(r'ethics:I\.def\.\d+', content))
    axioms = len(re.findall(r'ethics:I\.ax\.\d+', content))
    propositions = len(re.findall(r'ethics:I\.prop\.\d+', content))
    proofs = len(re.findall(r'ethics:I\.prop\.\d+\.proof', content))
    corollaries = len(re.findall(r'ethics:I\.prop\.\d+\.corollary', content))
    notes = len(re.findall(r'ethics:I\.prop\.\d+\.note', content))
    
    # Count citations
    cites_lines = re.findall(r'ethics:cites[^;]+', content)
    total_citations = 0
    for line in cites_lines:
        # Count comma-separated citations in each line
        citations_in_line = len([c.strip() for c in line.split('ethics:cites')[1].split(',') if c.strip()])
        total_citations += citations_in_line
    
    # Count semantic relationships
    semantic_rels = [
        'ethics:clearlyfollowsFrom',
        'ethics:necessarilyFollows', 
        'ethics:groundedIn',
        'ethics:evidentFrom',
        'ethics:refutedByAbsurdity',
        'ethics:appliesResultFrom',
        'ethics:demonstratedBy',
        'ethics:provedBy',
        'ethics:buildsUpon'
    ]
    
    semantic_counts = {}
    for rel in semantic_rels:
        count = len(re.findall(re.escape(rel), content))
        semantic_counts[rel] = count
    
    # Check for expected patterns
    print("N3 Structure Analysis")
    print("=" * 50)
    
    print("\nSTRUCTURAL ELEMENTS:")
    print(f"  📖 Definitions: {definitions} (expected: 8)")
    print(f"  📏 Axioms: {axioms} (expected: 7)")
    print(f"  📋 Propositions: {propositions} (expected: 36)")
    print(f"  🔍 Proofs: {proofs}")
    print(f"  📄 Corollaries: {corollaries}")
    print(f"  📝 Notes: {notes}")
    
    print(f"\nCITATION ANALYSIS:")
    print(f"  🔗 Total citation relationships: {len(cites_lines)}")
    print(f"  🔗 Total individual citations: {total_citations}")
    
    print(f"\nSEMANTIC RELATIONSHIPS:")
    for rel, count in semantic_counts.items():
        rel_name = rel.replace('ethics:', '')
        if count > 0:
            print(f"  🧠 {rel_name}: {count}")
    
    total_semantic = sum(semantic_counts.values())
    print(f"  🧠 Total semantic relationships: {total_semantic}")
    
    # Basic validation
    print(f"\nVALIDATION:")
    issues = []
    
    if definitions != 8:
        issues.append(f"Expected 8 definitions, found {definitions}")
    if axioms != 7:
        issues.append(f"Expected 7 axioms, found {axioms}")  
    if propositions != 36:
        issues.append(f"Expected 36 propositions, found {propositions}")
        
    if issues:
        print("  ❌ ISSUES FOUND:")
        for issue in issues:
            print(f"    - {issue}")
    else:
        print("  ✅ Basic structure looks good!")
        
    # Look for specific patterns we know should exist
    print(f"\nKNOWN PATTERN CHECKS:")
    
    # Check if Prop 1 cites Definitions 3 and 5
    prop1_pattern = r'ethics:I\.prop\.1[^#]*ethics:cites[^#]*ethics:I\.def\.3[^#]*ethics:I\.def\.5'
    if re.search(prop1_pattern, content, re.DOTALL):
        print("  ✅ Prop 1 correctly cites Def 3 and 5")
    else:
        print("  ❌ Prop 1 citation pattern not found")
        
    # Check if there are inference rules
    if 'ethics:transitivelyDependsOn' in content:
        print("  ✅ Inference rules present")
    else:
        print("  ❌ No inference rules found")
        
    # Check basic syntax
    unclosed_braces = content.count('{') - content.count('}')
    if unclosed_braces != 0:
        print(f"  ❌ Unmatched braces: {unclosed_braces}")
    else:
        print("  ✅ Braces balanced")

def main():
    import sys
    if len(sys.argv) != 2:
        print("Usage: python3 n3_structure_check.py <file.n3>")
        sys.exit(1)
        
    try:
        check_n3_structure(sys.argv[1])
    except FileNotFoundError:
        print(f"Error: File '{sys.argv[1]}' not found")
        sys.exit(1)

if __name__ == "__main__":
    main()