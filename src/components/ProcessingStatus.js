import React, { useState, useEffect } from 'react';

const ProcessingStatus = ({ status, progress, zipUrl, fileName, resetDownloadStatus }) => {
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  useEffect(() => {
    if (resetDownloadStatus) {
      setDownloadSuccess(false);
    }
  }, [resetDownloadStatus]);

  const handleDownload = () => {
    if (zipUrl) {
      const link = document.createElement('a');
      link.href = zipUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadSuccess(true);
    }
  };

  return (
    <div className="processing-status">
      {status && progress !== 100 && (
        <div className="status-text">
          {status}
        </div>
      )}
      
      {progress !== undefined && (
        progress === 100 ? (
          <div className="download-section">
            <button 
              onClick={handleDownload}
              className="download-button"
            >
              下载文件
            </button>
            {downloadSuccess && (
              <span className="download-success">下载成功</span>
            )}
          </div>
        ) : (
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
            <span className="progress-text">{progress}%</span>
          </div>
        )
      )}
    </div>
  );
};

export default ProcessingStatus; 