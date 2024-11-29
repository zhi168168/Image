import React, { useState, useEffect } from 'react';
import FileUploader from './components/FileUploader';
import ProcessingControl from './components/ProcessingControl';
import ProcessingStatus from './components/ProcessingStatus';
import { ImageProcessor } from './services/imageProcessor';
import './App.css';

function App() {
  const [files, setFiles] = useState({
    covers: [],
    backgrounds: [],
    excel: null
  });
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [processingStatus, setProcessingStatus] = useState({
    status: '',
    progress: 0,
    zipUrl: null,
    fileName: ''
  });

  // 在组件加载时检查是否有保存的Excel文件和文件名
  useEffect(() => {
    const savedExcel = localStorage.getItem('savedExcel');
    const savedExcelName = localStorage.getItem('savedExcelName');
    if (savedExcel && savedExcelName) {
      try {
        const excelFile = new File(
          [Buffer.from(savedExcel, 'base64')], 
          savedExcelName,
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        );
        setFiles(prev => ({ ...prev, excel: excelFile }));
      } catch (error) {
        console.error('Error loading saved excel file:', error);
      }
    }
  }, []);

  const handleFilesSelected = (type, selectedFiles) => {
    setFiles(prev => {
      const newFiles = {
        ...prev,
        [type]: type === 'excel' ? selectedFiles[0] : selectedFiles
      };

      // 如果是Excel文件，保存到localStorage
      if (type === 'excel' && selectedFiles[0]) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          localStorage.setItem('savedExcel', base64);
          localStorage.setItem('savedExcelName', selectedFiles[0].name);
        };
        reader.readAsDataURL(selectedFiles[0]);
      }

      // 如果是上传新的背景素材，重置下载状态
      if (type === 'backgrounds') {
        setProcessingStatus(prev => ({
          ...prev,
          status: '',
          zipUrl: null,
          fileName: ''
        }));
      }

      return newFiles;
    });
    setValidationMessage('');
  };

  const handleClearExcel = () => {
    setFiles(prev => ({ ...prev, excel: null }));
    localStorage.removeItem('savedExcel');
    localStorage.removeItem('savedExcelName');
  };

  const validateFiles = () => {
    if (!files.covers.length) {
      setValidationMessage('请上传封面图片');
      return false;
    }
    if (!files.backgrounds.length) {
      setValidationMessage('请上传背景素材图片');
      return false;
    }
    if (!files.excel) {
      setValidationMessage('请上传表格文件');
      return false;
    }
    if (files.covers.length !== files.backgrounds.length) {
      setValidationMessage('背景素材图片的数量和封面图片的数量必须保持一致');
      return false;
    }
    if (!files.covers.every(file => file.type.startsWith('image/'))) {
      setValidationMessage('所有封面图片必须是图片格式');
      return false;
    }
    if (!files.backgrounds.every(file => file.type.startsWith('image/'))) {
      setValidationMessage('所有背景素材图片必须是图片格式');
      return false;
    }
    if (!['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'].includes(files.excel.type)) {
      setValidationMessage('表格文件格式不正确');
      return false;
    }
    return true;
  };

  const handleStartProcessing = async () => {
    if (!validateFiles()) return;
    
    try {
      setIsProcessing(true);
      setProcessingStatus({
        status: '准备开始处理...',
        progress: 0,
        zipUrl: null,
        fileName: ''
      });

      const result = await ImageProcessor.processImages(
        files.covers,
        files.backgrounds,
        files.excel,
        (progress, status) => {
          setProcessingStatus(prev => ({
            ...prev,
            status: status || prev.status,
            progress: Math.round(progress)
          }));
        }
      );

      // 创建下载链接
      const zipUrl = URL.createObjectURL(result.blob);
      setProcessingStatus(prev => ({
        ...prev,
        status: '处理完成',
        progress: 100,
        zipUrl,
        fileName: result.fileName
      }));
      setIsProcessing(false);

    } catch (error) {
      setProcessingStatus(prev => ({
        ...prev,
        status: `处理失败: ${error.message}`,
        progress: 0
      }));
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setFiles(prev => ({
      ...prev,
      covers: [],
      backgrounds: [],
      // 不清除excel文件
    }));
    setIsProcessing(false);
    setValidationMessage('');
    setProcessingStatus({
      status: '',
      progress: 0,
      zipUrl: null,
      fileName: ''
    });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>图文处理工具</h1>
      </header>
      
      <main className="app-main">
        <div className="uploaders-container">
          <FileUploader 
            type="covers" 
            onFilesSelected={handleFilesSelected}
            files={files.covers}
            onClear={() => handleFilesSelected('covers', [])}
          />
          <FileUploader 
            type="backgrounds" 
            onFilesSelected={handleFilesSelected}
            files={files.backgrounds}
            onClear={() => handleFilesSelected('backgrounds', [])}
          />
          <FileUploader 
            type="excel" 
            onFilesSelected={handleFilesSelected}
            files={files.excel ? [files.excel] : []}
            onClear={handleClearExcel}
          />
        </div>

        <div className="control-panel">
          <ProcessingControl
            onStartProcessing={handleStartProcessing}
            onClear={handleClear}
            isValid={!validationMessage}
            validationMessage={validationMessage}
            isProcessing={isProcessing}
            showClearButton={false}
          />

          {(isProcessing || processingStatus.zipUrl) && (
            <ProcessingStatus
              status={processingStatus.status}
              progress={processingStatus.progress}
              zipUrl={processingStatus.zipUrl}
              fileName={processingStatus.fileName}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App; 