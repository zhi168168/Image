import React, { useState } from 'react';

const FileUploader = ({ type, onFilesSelected, files, onClear, acceptTypes, title }) => {
  const [dragOver, setDragOver] = useState(false);

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files);
    onFilesSelected(type, selectedFiles);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    const selectedFiles = Array.from(event.dataTransfer.files);
    onFilesSelected(type, selectedFiles);
  };

  const getAcceptTypes = () => {
    if (acceptTypes) {
      return acceptTypes;
    }
    
    switch (type) {
      case 'covers':
      case 'backgrounds':
        return 'image/*';
      case 'excel':
      case 'knowledge':
        return '.xlsx,.xls,.csv';
      default:
        return '';
    }
  };

  const getMultiple = () => {
    return type === 'covers' || type === 'backgrounds';
  };

  const getTitle = () => {
    if (title) {
      return title;
    }
    
    switch (type) {
      case 'covers':
        return '上传封面图片';
      case 'backgrounds':
        return '上传背景素材图片';
      case 'excel':
        return '上传表格文件';
      case 'knowledge':
        return '上传知识Excel文件';
      default:
        return '';
    }
  };

  const handleClearExcel = (e) => {
    e.preventDefault();
    onClear();
    if (type === 'excel') {
      localStorage.removeItem('savedExcel');
    }
  };

  return (
    <div 
      className={`file-uploader ${dragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="uploader-header">
        <h3>{getTitle()}</h3>
        {files.length > 0 && (
          <button 
            onClick={handleClearExcel}
            className="clear-button"
          >
            清除
          </button>
        )}
      </div>
      
      <label className="upload-label">
        <input
          type="file"
          onChange={handleFileChange}
          accept={getAcceptTypes()}
          multiple={getMultiple()}
          className="file-input"
        />
        {files.length > 0 ? (
          <span className="file-placeholder">
            {type === 'knowledge' ? '如需更换知识文件，请先清除当前文件' : '已选择文件'}
          </span>
        ) : (
          <span className="upload-text">点击或拖拽文件到此处</span>
        )}
      </label>

      {files.length > 0 && (
        <div className="selected-files">
          <p>已选择 {files.length} 个文件:</p>
          <ul>
            {files.map((file, index) => (
              <li key={index}>
                {file.name}
                <span className="file-size">
                  ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FileUploader; 