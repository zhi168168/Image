import React, { useState } from 'react';

const FileUploader = ({ type, onFilesSelected, files, onClear }) => {
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
    switch (type) {
      case 'covers':
      case 'backgrounds':
        return 'image/*';
      case 'excel':
        return '.xlsx,.xls,.csv';
      default:
        return '';
    }
  };

  const getMultiple = () => {
    return type === 'covers' || type === 'backgrounds';
  };

  const getTitle = () => {
    switch (type) {
      case 'covers':
        return '上传封面图片';
      case 'backgrounds':
        return '上传背景素材图片';
      case 'excel':
        return '上传表格文件';
      default:
        return '';
    }
  };

  const handleClearExcel = (e) => {
    e.preventDefault();
    onClear();
    localStorage.removeItem('savedExcel');
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
            onClick={type === 'excel' ? handleClearExcel : onClear}
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
        <span className="upload-text">点击或拖拽文件到此处</span>
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