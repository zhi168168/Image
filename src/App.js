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

  // 添加图片格式选择的 state
  const [imageFormat, setImageFormat] = useState('jpeg');
  
  // 添加内页使用规则模式选择
  const [pageMode, setPageMode] = useState('flexible'); // flexible宽松模式, strict严谨模式

  // 在state中添加标题配置
  const [titleConfig, setTitleConfig] = useState({
    text: '100份外企干货',
    backgroundColor: '#1890ff'
  });

  const [resetDownloadStatus, setResetDownloadStatus] = useState(false);

  // 在组件加载时检查是否有保存的Excel文件和文件名
  useEffect(() => {
    // 加载保存的Excel文件
    const savedExcel = localStorage.getItem('savedExcel');
    const savedExcelName = localStorage.getItem('savedExcelName');
    
    // 加载保存的标题配置
    const savedTitleConfig = localStorage.getItem('titleConfig');
    if (savedTitleConfig) {
      setTitleConfig(JSON.parse(savedTitleConfig));
    }
    
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
    if (!files.backgrounds.length) {
      setValidationMessage('请上传背景素材图片');
      return false;
    }
    if (!files.excel) {
      setValidationMessage('请上传表格文件');
      return false;
    }
    
    if (files.covers.length && !files.covers.every(file => file.type.startsWith('image/'))) {
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
      setResetDownloadStatus(true);
      setProcessingStatus({
        status: '准备开始处理...',
        progress: 0,
        zipUrl: null,
        fileName: ''
      });
      // 清除之前的验证消息
      setValidationMessage('');

      const coversToUse = files.covers.length > 0 ? files.covers : null;

      const result = await ImageProcessor.processImages(
        coversToUse,
        files.backgrounds,
        files.excel,
        (progress, status) => {
          setProcessingStatus(prev => ({
            ...prev,
            status: status || prev.status,
            progress: Math.round(progress)
          }));
        },
        titleConfig,
        imageFormat,
        pageMode // 添加模式参数
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
      setResetDownloadStatus(false);

    } catch (error) {
      console.error('处理失败:', error);
      // 捕获错误并显示在界面上
      setValidationMessage(error.message);
      setProcessingStatus(prev => ({
        ...prev,
        status: `处理失败: ${error.message}`,
        progress: 0
      }));
      setIsProcessing(false);
      setResetDownloadStatus(false);
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

  // 修改标题配置的处理函数
  const handleTitleConfigChange = (newConfig) => {
    setTitleConfig(newConfig);
    // 保存到localStorage
    localStorage.setItem('titleConfig', JSON.stringify(newConfig));
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>图文处理工具PRO版</h1>
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

        <div className="title-config">
          <h3>内页标题设置</h3>
          <div className="title-inputs">
            <div className="input-group">
              <label>标题文本:</label>
              <input
                type="text"
                value={titleConfig.text}
                onChange={(e) => handleTitleConfigChange({
                  ...titleConfig,
                  text: e.target.value
                })}
                placeholder="请输入标题文本"
              />
            </div>
            <div className="input-group">
              <label>背景颜色:</label>
              <input
                type="color"
                value={titleConfig.backgroundColor}
                onChange={(e) => handleTitleConfigChange({
                  ...titleConfig,
                  backgroundColor: e.target.value
                })}
              />
            </div>
          </div>
        </div>

        {/* 添加图片格式选择 */}
        <div className="format-config">
          <h3>导出图片格式</h3>
          <div className="format-inputs">
            <div className="input-group">
              <label>
                <input
                  type="radio"
                  value="png"
                  checked={imageFormat === 'png'}
                  onChange={(e) => setImageFormat(e.target.value)}
                />
                PNG格式
              </label>
              <label style={{ marginLeft: '20px' }}>
                <input
                  type="radio"
                  value="jpeg"
                  checked={imageFormat === 'jpeg'}
                  onChange={(e) => setImageFormat(e.target.value)}
                />
                JPG格式
              </label>
            </div>
          </div>
        </div>

        {/* 添加内页使用规则选择 */}
        <div className="mode-config">
          <h3>内页使用规则</h3>
          <div className="mode-inputs">
            <div className="input-group">
              <label>
                <input
                  type="radio"
                  value="strict"
                  checked={pageMode === 'strict'}
                  onChange={(e) => setPageMode(e.target.value)}
                />
                严谨模式
              </label>
              <label style={{ marginLeft: '20px' }}>
                <input
                  type="radio"
                  value="flexible"
                  checked={pageMode === 'flexible'}
                  onChange={(e) => setPageMode(e.target.value)}
                />
                宽松模式（默认）
              </label>
            </div>
            {pageMode === 'strict' && (
              <div className="mode-description">
                严谨模式：一张内页素材只会用于一张生成的内页图片
              </div>
            )}
            {pageMode === 'flexible' && (
              <div className="mode-description">
                宽松模式：一张内页素材会被同一文件夹内的所有内页使用
              </div>
            )}
          </div>
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
              resetDownloadStatus={resetDownloadStatus}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App; 