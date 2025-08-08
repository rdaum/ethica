#!/usr/bin/env python3
"""
Simple N3 syntax validator - checks basic syntax without requiring external libraries
"""

import re
import sys

def validate_n3_syntax(filename):
    """Basic N3 syntax validation"""
    errors = []
    warnings = []
    
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    in_triple = False
    triple_buffer = ""
    line_num = 0
    
    for line in lines:
        line_num += 1
        line = line.strip()
        
        # Skip comments and empty lines
        if not line or line.startswith('#'):
            continue
            
        # Check for basic N3 patterns
        # Prefix declarations
        if line.startswith('@prefix'):
            if not line.endswith(' .'):
                errors.append(f"Line {line_num}: @prefix must end with ' .'")
            continue
            
        # Check for basic triple patterns
        if re.search(r'\w+:\w+\s+\w+:\w+\s+', line):
            # Basic subject predicate object pattern
            if not (line.endswith(' .') or line.endswith(' ;') or line.endswith(' ,')):
                if '{' not in line and '}' not in line:  # Allow inference rules
                    warnings.append(f"Line {line_num}: Triple may be missing terminator")
        
        # Check for unmatched brackets
        open_brackets = line.count('{')
        close_brackets = line.count('}')
        
        # Check for common syntax issues
        if ';;' in line:
            errors.append(f"Line {line_num}: Double semicolon found")
            
        if '..' in line and not '...' in line:
            errors.append(f"Line {line_num}: Double period found")
            
        # Check for missing spaces around operators
        if re.search(r'\w+:\w+[;,]\w+:\w+', line):
            warnings.append(f"Line {line_num}: Missing space around separator")
            
        # Check for URI syntax
        if '<' in line and '>' in line:
            uris = re.findall(r'<([^>]+)>', line)
            for uri in uris:
                if not (uri.startswith('http') or uri.startswith('file') or uri.startswith('urn')):
                    warnings.append(f"Line {line_num}: Unusual URI scheme: {uri}")
    
    return errors, warnings

def main():
    if len(sys.argv) != 2:
        print("Usage: python3 simple_n3_validator.py <file.n3>")
        sys.exit(1)
        
    filename = sys.argv[1]
    
    try:
        errors, warnings = validate_n3_syntax(filename)
        
        print(f"N3 Syntax Validation Report for: {filename}")
        print("=" * 50)
        
        if errors:
            print(f"\nERRORS ({len(errors)}):")
            for error in errors:
                print(f"  ❌ {error}")
        else:
            print("\n✅ No syntax errors found!")
            
        if warnings:
            print(f"\nWARNINGS ({len(warnings)}):")
            for warning in warnings:
                print(f"  ⚠️  {warning}")
        else:
            print("\n✅ No syntax warnings found!")
            
        print(f"\nSummary: {len(errors)} errors, {len(warnings)} warnings")
        
        if errors:
            sys.exit(1)
            
    except FileNotFoundError:
        print(f"Error: File '{filename}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()