import React from 'react';

const ProcessingControl = ({ 
  onStartProcessing, 
  onClear,
  isValid, 
  validationMessage,
  isProcessing,
  showClearButton = false
}) => {
  return (
    <div className="processing-control">
      {!isValid && (
        <div className="validation-message error">
          {validationMessage}
        </div>
      )}
      <div className="button-group">
        <button 
          onClick={onStartProcessing}
          disabled={!isValid || isProcessing}
          className="process-button"
        >
          {isProcessing ? '处理中...' : '开始处理'}
        </button>
        {showClearButton && (
          <button 
            onClick={onClear}
            disabled={isProcessing}
            className="clear-button"
          >
            重新开始
          </button>
        )}
      </div>
    </div>
  );
};

export default ProcessingControl; 