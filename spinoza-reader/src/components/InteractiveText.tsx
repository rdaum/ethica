import React from 'react';

// This component will be used for more advanced text interaction features
// For now, it's a placeholder that we might expand later

interface InteractiveTextProps {
  text: string;
  elementId: string;
  onTextSelect?: (selectedText: string, elementId: string) => void;
}

const InteractiveText: React.FC<InteractiveTextProps> = ({
  text,
  elementId,
  onTextSelect
}) => {
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim() && onTextSelect) {
      onTextSelect(selection.toString().trim(), elementId);
    }
  };

  return (
    <span 
      className="interactive-text"
      onMouseUp={handleTextSelection}
    >
      {text}
    </span>
  );
};

export default InteractiveText;