import React from 'react';
import './BookView.css';

interface SpinozaElement {
  id: string;
  type: 'definition' | 'axiom' | 'proposition' | 'proof' | 'corollary' | 'note';
  number?: string;
  text: string;
  parentId?: string;
}

interface BookViewProps {
  elements: Map<string, SpinozaElement>;
  onElementHover: (elementId: string | null) => void;
  onElementSelect: (elementId: string | null) => void;
  selectedElement: string | null;
  hoveredElement: string | null;
}

const BookView: React.FC<BookViewProps> = ({
  elements,
  onElementHover,
  onElementSelect,
  selectedElement,
  hoveredElement
}) => {
  const formatElementLabel = (elementId: string): string => {
    // Convert technical IDs like "I.prop.17.proof" to readable labels like "Proposition XVII"
    const parts = elementId.split('.');
    
    if (parts.length < 2) return elementId;
    const type = parts[1]; // "def", "ax", "prop"
    const number = parts[2]; // "17"
    const subElement = parts[3]; // "proof", "corollary", "note"
    
    // Convert numbers to Roman numerals for formal presentation
    const toRoman = (num: number): string => {
      const values = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
      const symbols = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
      let result = '';
      
      for (let i = 0; i < values.length; i++) {
        while (num >= values[i]) {
          result += symbols[i];
          num -= values[i];
        }
      }
      return result;
    };
    
    let baseLabel = '';
    const romanNumber = number ? toRoman(parseInt(number)) : '';
    
    switch (type) {
      case 'def':
        baseLabel = `Definition ${romanNumber}`;
        break;
      case 'ax':
        baseLabel = `Axiom ${romanNumber}`;
        break;
      case 'prop':
        baseLabel = `Proposition ${romanNumber}`;
        break;
      default:
        baseLabel = `${type.charAt(0).toUpperCase() + type.slice(1)} ${romanNumber}`;
    }
    
    // Add sub-element if present
    if (subElement) {
      const subLabel = subElement === 'corollary' ? 'Corollary' :
                      subElement === 'note' ? 'Note' :
                      subElement === 'proof' ? 'Proof' :
                      subElement === 'explanation' ? 'Explanation' :
                      subElement.charAt(0).toUpperCase() + subElement.slice(1);
      
      return `${baseLabel} ${subLabel}`;
    }
    
    return baseLabel;
  };
  const renderElement = (element: SpinozaElement) => {
    const isSelected = selectedElement === element.id;
    const isHovered = hoveredElement === element.id;
    const className = `element element-${element.type} ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`;

    return (
      <div
        key={element.id}
        className={className}
        onMouseEnter={() => onElementHover(element.id)}
        onMouseLeave={() => onElementHover(null)}
        onClick={() => onElementSelect(element.id)}
        data-element-id={element.id}
      >
        <div className="element-header">
          <span className="element-type">{element.type}</span>
          <span className="element-title">{formatElementLabel(element.id)}</span>
        </div>
        <div className="element-text">
          {element.text}
        </div>
      </div>
    );
  };

  const renderSection = (title: string, type: string) => {
    const sectionElements = Array.from(elements.values())
      .filter(el => el.type === type && !el.parentId)
      .sort((a, b) => {
        const numA = parseInt(a.number || '0');
        const numB = parseInt(b.number || '0');
        return numA - numB;
      });

    if (sectionElements.length === 0) return null;

    return (
      <section className={`section section-${type}`}>
        <h2 className="section-title">{title}</h2>
        {sectionElements.map(element => (
          <div key={element.id}>
            {renderElement(element)}
            {renderSubElements(element.id)}
          </div>
        ))}
      </section>
    );
  };

  const renderSubElements = (parentId: string) => {
    const subElements = Array.from(elements.values())
      .filter(el => el.parentId === parentId)
      .sort((a, b) => {
        // Sort by type priority (proof, corollary, note) then by id
        const typeOrder = { proof: 1, corollary: 2, note: 3 };
        const priorityA = typeOrder[a.type as keyof typeof typeOrder] || 9;
        const priorityB = typeOrder[b.type as keyof typeof typeOrder] || 9;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return a.id.localeCompare(b.id);
      });

    return (
      <div className="sub-elements">
        {subElements.map(element => renderElement(element))}
      </div>
    );
  };

  return (
    <div className="book-view">
      <div className="book-content">
        <div className="part-header">
          <h1 className="part-title">Part I: Concerning God</h1>
        </div>
        {renderSection('Definitions', 'definition')}
        {renderSection('Axioms', 'axiom')}
        {renderSection('Propositions', 'proposition')}
      </div>
    </div>
  );
};

export default BookView;