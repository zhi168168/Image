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
  const [imageFormat, setImageFormat] = useState(localStorage.getItem('imageFormat') || 'jpg');
  
  // 添加封面模式选择
  const [coverMode, setCoverMode] = useState(localStorage.getItem('coverMode') || 'single'); // single单图模式, multiple多图模式
  
  // 添加内页使用规则模式选择
  const [pageMode, setPageMode] = useState(localStorage.getItem('pageMode') || 'flexible'); // flexible宽松模式, strict严谨模式, cautious谨慎模式
  
  // 添加内页数量限制
  const [pageLimit, setPageLimit] = useState(parseInt(localStorage.getItem('pageLimit') || '0', 10)); // 0表示不限制
  
  // 添加知识拼接模式
  const [knowledgeMode, setKnowledgeMode] = useState(localStorage.getItem('knowledgeMode') === 'true'); // 默认不启用知识拼接模式
  const [knowledgeCount, setKnowledgeCount] = useState(parseInt(localStorage.getItem('knowledgeCount') || '5', 10)); // 每份文件需要的知识图片数量，0表示不需要
  const [knowledgeExcel, setKnowledgeExcel] = useState(null); // 知识Excel文件

  // 添加内页素材切割模式
  const [sliceMode, setSliceMode] = useState(localStorage.getItem('sliceMode') === 'true'); // 默认不启用切割模式
  const [sliceCount, setSliceCount] = useState(parseInt(localStorage.getItem('sliceCount') || '4', 10)); // 默认切割为4份(2x2)

  // 添加更多设置展开/收起状态
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // 在state中添加标题配置
  const [titleConfig, setTitleConfig] = useState({
    text: localStorage.getItem('titleText') || '随机标题',
    backgroundColor: localStorage.getItem('titleBackground') || '#0D6CD7'
  });

  const [resetDownloadStatus, setResetDownloadStatus] = useState(false);

  // 在state中添加topicMode状态
  const [topicMode, setTopicMode] = useState(localStorage.getItem('topicMode') === 'true'); // 添加主题模式状态

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
    console.log("开始验证文件...");
    console.log("封面图: ", files.covers.length, "张");
    console.log("背景素材: ", files.backgrounds.length, "张");
    console.log("Excel文件: ", files.excel ? files.excel.name : "无");
    console.log("封面模式: ", coverMode);
    
    // 输出封面图详细信息，用于调试
    if (files.covers.length > 0) {
      console.log("封面图详细信息:");
      files.covers.slice(0, 3).forEach((file, index) => {
        console.log(`封面图 #${index + 1}: 名称=${file.name}, 类型=${file.type || '无类型'}, 大小=${file.size}, 路径=${file.webkitRelativePath || '无路径'}`);
      });
      if (files.covers.length > 3) {
        console.log(`...还有 ${files.covers.length - 3} 张封面图`);
      }
    }
    
    // 检查必要的文件
    if (!files.backgrounds || files.backgrounds.length === 0) {
      console.log("错误: 没有上传背景素材");
      setValidationMessage('请上传背景素材图片');
      return false;
    }

    if (!files.excel) {
      console.log("错误: 没有上传表格文件");
      setValidationMessage('请上传表格文件');
      return false;
    }
    
    // 多图模式下不严格验证封面图类型，由后端处理
    if (files.covers.length && coverMode === 'single') {
      // 单图模式下使用原有验证
      console.log("检查单图模式下的封面图类型");
      
      // 判断文件是否为图片的函数
      const isImageFile = (file) => {
        console.log(`验证文件: ${file.name}, 类型: ${file.type || '无类型'}, 大小: ${file.size}字节`);
        
        // 如果有MIME类型信息，通过类型判断
        if (file.type && file.type.startsWith('image/')) {
          return true;
        }
        
        // 如果没有MIME类型信息，通过扩展名判断
        const ext = file.name.split('.').pop().toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
      };
      
      const invalidCoverFiles = files.covers.filter(file => !isImageFile(file));
      if (invalidCoverFiles.length > 0) {
        console.log("错误: 封面图包含非图片文件:", 
          invalidCoverFiles.map(f => `${f.name}(${f.type || '无类型'})`).join(', '));
        setValidationMessage('所有封面图片必须是图片格式');
        return false;
      }
    } else if (files.covers.length && coverMode === 'multi') {
      // 多图模式下输出文件夹结构信息，帮助调试
      console.log("多图模式: 检查文件夹结构");
      
      // 统计具有路径信息的文件
      const filesWithPath = files.covers.filter(f => f.webkitRelativePath);
      console.log(`${filesWithPath.length}/${files.covers.length} 个文件具有路径信息`);
      
      // 提取并显示文件夹结构
      if (filesWithPath.length > 0) {
        const folders = new Set();
        filesWithPath.forEach(f => {
          const path = f.webkitRelativePath;
          const folderPath = path.split('/').slice(0, -1).join('/');
          folders.add(folderPath);
        });
        
        console.log(`检测到 ${folders.size} 个文件夹:`);
        folders.forEach(folder => console.log(`- ${folder}`));
      }
    }
    
    console.log("检查背景素材图片类型");
    // 判断文件是否为图片的函数
    const isImageFile = (file) => {
      // 如果有MIME类型信息，通过类型判断
      if (file.type && file.type.startsWith('image/')) {
        return true;
      }
      
      // 如果没有MIME类型信息，通过扩展名判断
      const ext = file.name.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
    };
    
    const invalidBgFiles = files.backgrounds.filter(file => !isImageFile(file));
    if (invalidBgFiles.length > 0) {
      console.log("错误: 背景素材包含非图片文件:", 
        invalidBgFiles.map(f => `${f.name}(${f.type || '无类型'})`).join(', '));
      setValidationMessage('所有背景素材图片必须是图片格式');
      return false;
    }
    
    const validExcelTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
    console.log("检查Excel文件类型:", files.excel.type);
    // 允许通过扩展名判断Excel文件
    const isExcelFile = (file) => {
      if (validExcelTypes.includes(file.type)) {
        return true;
      }
      
      const ext = file.name.split('.').pop().toLowerCase();
      return ['xlsx', 'xls', 'csv'].includes(ext);
    };
    
    if (!isExcelFile(files.excel)) {
      console.log("错误: Excel文件类型不正确:", files.excel.type);
      setValidationMessage('表格文件格式不正确');
      return false;
    }
    
    // 检查知识拼接模式相关设置
    if (knowledgeMode) {
      console.log("检查知识拼接模式设置");
      if (!knowledgeExcel) {
        console.log("错误: 没有上传知识Excel文件");
        setValidationMessage('请上传知识Excel文件');
        return false;
      }
      
      if (!isExcelFile(knowledgeExcel)) {
        console.log("错误: 知识Excel文件类型不正确:", knowledgeExcel.type);
        setValidationMessage('知识Excel文件格式不正确');
        return false;
      }
    }
    
    // 验证切割模式设置
    if (sliceMode) {
      console.log("检查切割模式设置:", sliceCount);
      if (sliceCount < 2 || sliceCount > 16 || sliceCount % 2 !== 0) {
        console.log("错误: 切割份数必须是2-16之间的偶数");
        setValidationMessage('切割份数必须是2-16之间的偶数');
        return false;
      }
    }
    
    console.log("文件验证通过");
    return true;
  };

  const handleStartProcessing = async () => {
    console.log("===== 开始处理 =====");
    if (!validateFiles()) {
      console.log("文件验证失败，停止处理");
      return;
    }
    
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
      console.log("准备处理封面图:", coversToUse ? coversToUse.length : 0, "张");
      console.log("封面模式:", coverMode);

      const result = await ImageProcessor.processImages(
        coversToUse,
        files.backgrounds,
        files.excel,
        (progress, status) => {
          console.log(`处理进度: ${progress}%, 状态: ${status}`);
          setProcessingStatus(prev => ({
            ...prev,
            status: status || prev.status,
            progress: Math.round(progress)
          }));
        },
        titleConfig,
        imageFormat,
        pageMode,
        pageLimit,
        knowledgeMode,
        knowledgeCount,
        knowledgeExcel,
        sliceMode,
        sliceCount,
        coverMode,
        topicMode
      );

      console.log("处理结果:", result);

      if (result.success) {
        // 处理成功的情况
        setProcessingStatus(prev => ({
          ...prev,
          status: '处理完成',
          progress: 100,
          zipUrl: result.zipUrl,
          fileName: result.fileName
        }));
      } else {
        // 处理失败的情况
        console.error("处理失败:", result.error);
        setValidationMessage(result.error || '处理失败');
        setProcessingStatus(prev => ({
          ...prev,
          status: `处理失败: ${result.error || '未知错误'}`,
          progress: 0
        }));
      }
      
      setIsProcessing(false);
      setResetDownloadStatus(false);

    } catch (error) {
      console.error('处理失败详细信息:', error);
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

  // 处理封面图上传
  const handleCoverChange = (type, selectedFiles) => {
    console.log("===== 单文件上传封面图 =====");
    console.log("上传的文件数量:", selectedFiles.length);
    
    // 详细记录每个文件的信息
    Array.from(selectedFiles).forEach((file, index) => {
      console.log(`文件[${index}]详情:`, {
        名称: file.name,
        类型: file.type || "未知类型",
        大小: file.size,
        lastModified: new Date(file.lastModified).toLocaleString(),
        webkitRelativePath: file.webkitRelativePath || "无路径信息"
      });
      
      // 检查文件类型
      if (!file.type) {
        console.warn(`警告: 文件 ${file.name} 没有类型信息，可能是文件夹或浏览器不支持`);
      } else if (!file.type.startsWith('image/')) {
        console.error(`错误: 文件 ${file.name} 不是图片类型 (${file.type})`);
      }
    });
    
    setFiles(prev => ({ ...prev, covers: selectedFiles }));
    setValidationMessage('');
  };

  // 添加文件夹处理函数
  const handleDirectorySelected = (selectedFiles) => {
    console.log("===== 拖拽上传事件(covers) =====");
    console.log("拖拽的文件数量:", selectedFiles ? selectedFiles.length : 0);
    console.log("拖拽包含目录:", true);
    console.log("检测到拖拽文件夹，调用专用处理函数");
    
    // 检查selectedFiles是否是数组或类数组对象
    if (!selectedFiles || !selectedFiles.length || selectedFiles.length === 0) {
      console.warn("文件夹中没有有效图片文件");
      setValidationMessage('文件夹中没有有效图片文件');
      return;
    }
    
    try {
      // 确保selectedFiles是纯JavaScript数组
      const filesArray = [];
      // 手动复制文件对象到新数组，避免对DOM对象使用数组方法
      for (let i = 0; i < selectedFiles.length; i++) {
        filesArray.push(selectedFiles[i]);
      }
      console.log(`转换为纯数组后的文件数量: ${filesArray.length}`);
      
      // 为文件添加额外信息以便后续处理
      const enhancedFiles = [];
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        if (!file) {
          console.warn(`警告：第${i}个文件对象无效`);
          continue;
        }
        
        try {
          // 提取文件夹路径信息
          let folderPath = '';
          if (file.webkitRelativePath) {
            const pathParts = file.webkitRelativePath.split('/');
            if (pathParts.length > 1) {
              // 取出路径中的文件夹部分
              folderPath = pathParts.slice(0, -1).join('/');
            }
          }
          
          // 创建带有额外信息的文件对象
          const enhancedFile = {
            // 保留原始文件的基本属性
            name: file.name,
            size: file.size,
            type: file.type || '',
            lastModified: file.lastModified,
            // 添加自定义属性
            webkitRelativePath: file.webkitRelativePath || '',
            groupId: folderPath || 'default',
            groupOrder: i,
            // 添加额外路径信息
            customPath: file.webkitRelativePath || '',
            folderPath: folderPath
          };
          
          // 将File对象转换为Blob，然后创建新的File对象
          const reader = new FileReader();
          reader.onload = function(e) {
            const blob = new Blob([e.target.result], {type: file.type || 'application/octet-stream'});
            const newFile = new File([blob], file.name, {
              type: file.type || 'application/octet-stream',
              lastModified: file.lastModified
            });
            
            // 复制自定义属性到新文件
            Object.keys(enhancedFile).forEach(key => {
              if (key !== 'name' && key !== 'size' && key !== 'type' && key !== 'lastModified') {
                Object.defineProperty(newFile, key, {
                  value: enhancedFile[key],
                  writable: true,
                  enumerable: true,
                  configurable: true
                });
              }
            });
            
            enhancedFiles.push(newFile);
            
            // 当所有文件都处理完毕
            if (enhancedFiles.length === filesArray.length) {
              console.log(`已处理 ${enhancedFiles.length} 个文件，添加了分组信息`);
              
              if (enhancedFiles.length === 0) {
                console.warn("所有文件处理后为空");
                setValidationMessage('处理后没有有效的图片文件');
                return;
              }
              
              // 更新状态
              setFiles(prev => ({
                ...prev,
                covers: enhancedFiles
              }));
              setCoverMode('multi'); // 自动切换到多图模式
              setValidationMessage('');
            }
          };
          
          reader.onerror = function() {
            console.error(`读取文件 ${file.name} 失败`);
          };
          
          // 开始读取文件
          reader.readAsArrayBuffer(file);
        } catch (error) {
          console.error(`处理文件索引${i}时出错:`, error);
          // 继续处理其他文件
        }
      }
    } catch (error) {
      console.error("处理文件夹时出错:", error);
      setValidationMessage(`处理文件夹时出错: ${error.message}`);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>图文处理工具PRO版</h1>
      </header>
      
      <main className="app-main">
        <div className="uploaders-container">
          <div className="upload-section">
            <div className="upload-column">
              <h3>封面图</h3>
              <div className="cover-mode-selector">
                <label>
                  <input 
                    type="radio" 
                    name="coverMode" 
                    value="single" 
                    checked={coverMode === 'single'} 
                    onChange={() => setCoverMode('single')}
                  />
                  单图模式
                </label>
                <label>
                  <input 
                    type="radio" 
                    name="coverMode" 
                    value="multiple" 
                    checked={coverMode === 'multiple'} 
                    onChange={() => setCoverMode('multiple')}
                  />
                  多图模式
                </label>
              </div>
              <FileUploader 
                type="covers" 
                files={files.covers} 
                onFilesSelected={handleFilesSelected}
                onFilesDirectorySelected={handleDirectorySelected}
                accept="image/*"
                multiple={coverMode === 'multiple'}
                directory={coverMode === 'multiple'}
              />
            </div>
            
            <div className="upload-column">
              <h3>背景素材</h3>
              <FileUploader 
                type="backgrounds" 
                files={files.backgrounds} 
                onFilesSelected={handleFilesSelected} 
                accept="image/*"
                multiple
              />
            </div>
            
            <div className="upload-column">
              <h3>Excel文件</h3>
              <FileUploader 
                type="excel" 
                onFilesSelected={handleFilesSelected}
                files={files.excel ? [files.excel] : []}
                onClear={handleClearExcel}
              />
            </div>
          </div>

          <div className="config-section">
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
                  <span className="color-display">{titleConfig.backgroundColor}</span>
                </div>
              </div>
            </div>

            {/* 添加图片格式选择 */}
            <div className="format-config">
              <h3>输出设置</h3>
              <div className="format-inputs">
                <div className="format-section">
                  <h4>图片格式</h4>
                  <label>
                    <input
                      type="radio"
                      name="imageFormat"
                      value="jpeg"
                      checked={imageFormat === 'jpeg'}
                      onChange={() => setImageFormat('jpeg')}
                    />
                    JPG格式
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="imageFormat"
                      value="png"
                      checked={imageFormat === 'png'}
                      onChange={() => setImageFormat('png')}
                    />
                    PNG格式
                  </label>
                </div>

                <div className="format-section">
                  <h4>内页模式</h4>
                  <label>
                    <input
                      type="radio"
                      name="pageMode"
                      value="flexible"
                      checked={pageMode === 'flexible'}
                      onChange={() => setPageMode('flexible')}
                    />
                    宽松模式
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="pageMode"
                      value="strict"
                      checked={pageMode === 'strict'}
                      onChange={() => setPageMode('strict')}
                    />
                    严谨模式
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="pageMode"
                      value="cautious"
                      checked={pageMode === 'cautious'}
                      onChange={() => setPageMode('cautious')}
                    />
                    谨慎模式
                  </label>
                  <div className="mode-description">
                    {pageMode === 'flexible' && '宽松模式：背景图可重复使用，不受素材数量限制'}
                    {pageMode === 'strict' && '严谨模式：每个背景图只使用一次，需要足够的素材'}
                    {pageMode === 'cautious' && '谨慎模式：基于严谨模式，但只有第一页显示标题'}
                  </div>
                </div>

                <div className="format-section">
                  <h4>主题模式</h4>
                  <label>
                    <input
                      type="checkbox"
                      checked={topicMode}
                      onChange={(e) => {
                        setTopicMode(e.target.checked);
                        localStorage.setItem('topicMode', e.target.checked);
                      }}
                    />
                    启用主题模式
                  </label>
                  <div className="mode-description">
                    主题模式：将Excel中的每个工作表作为一个主题，实现主题分组展示
                    {topicMode && <div style={{marginTop: '5px', color: '#faad14'}}>
                      <strong>注意：</strong> 开启此选项时，请确保Excel文件包含多个工作表，每个工作表对应一个主题。
                    </div>}
                  </div>
                </div>

                <div className="page-limit-section">
                  <h4>内页数量限制</h4>
                  <div className="input-group">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={pageLimit}
                      onChange={(e) => {
                        // 确保输入值在 0-100 之间
                        const value = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                        setPageLimit(value);
                      }}
                      className="page-limit-input"
                    />
                    <span className="page-limit-description">
                      {pageLimit === 0 
                        ? '默认值0：不限制内页数量' 
                        : `限制为 ${pageLimit} 页，超出时会保留首尾页`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 更多设置区域 */}
            <div className="advanced-settings">
              <div className="advanced-toggle" onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}>
                <span className="toggle-icon">{showAdvancedSettings ? '▼' : '►'}</span>
                <h3>更多设置</h3>
              </div>
              
              {showAdvancedSettings && (
                <div className="advanced-content">
                  {/* 知识拼接模式 */}
                  <div className="knowledge-config">
                    <h4>知识拼接模式</h4>
                    <label className="knowledge-toggle">
                      <input
                        type="checkbox"
                        checked={knowledgeMode}
                        onChange={(e) => setKnowledgeMode(e.target.checked)}
                      />
                      启用知识拼接模式
                    </label>
                    <div className="mode-description">
                      知识拼接模式：根据Excel表格生成精美的知识图片，标题和内容一一对应
                    </div>

                    {knowledgeMode && (
                      <div className="knowledge-section">
                        <div className="knowledge-file-uploader">
                          <FileUploader 
                            type="knowledge" 
                            onFilesSelected={(type, files) => {
                              if (files && files.length > 0) {
                                setKnowledgeExcel(files[0]);
                              }
                            }}
                            files={knowledgeExcel ? [knowledgeExcel] : []}
                            onClear={() => setKnowledgeExcel(null)}
                            accept=".xlsx,.xls,.csv"
                            title="知识Excel文件"
                          />
                        </div>
                        <div className="input-group" style={{ marginTop: '15px' }}>
                          <label>每份文件夹需要的知识图片数量：</label>
                          <input
                            type="number"
                            min="0"
                            max="50"
                            value={knowledgeCount}
                            onChange={(e) => {
                              // 确保输入值在 0-50 之间
                              const value = Math.min(50, Math.max(0, parseInt(e.target.value) || 0));
                              setKnowledgeCount(value);
                            }}
                            className="knowledge-count-input"
                          />
                          <span className="knowledge-description">
                            {knowledgeCount === 0 
                              ? '默认值0：不生成知识图片' 
                              : `每份生成 ${knowledgeCount} 张知识图片`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* 内页素材切割模式 */}
                  <div className="slice-config">
                    <h4>内页素材切割</h4>
                    <label className="slice-toggle">
                      <input
                        type="checkbox"
                        checked={sliceMode}
                        onChange={(e) => setSliceMode(e.target.checked)}
                      />
                      启用内页素材切割
                    </label>
                    <div className="mode-description">
                      内页素材切割：将一张图片切割成多个部分使用，可大幅减少素材消耗
                    </div>

                    {sliceMode && (
                      <div className="slice-section">
                        <div className="input-group" style={{ marginTop: '15px' }}>
                          <label>切割份数（必须为偶数）：</label>
                          <input
                            type="number"
                            min="2"
                            max="16"
                            step="2"
                            value={sliceCount}
                            onChange={(e) => {
                              // 确保输入值在 2-16 之间，且为偶数
                              let value = parseInt(e.target.value) || 2;
                              // 如果不是偶数，向下取整为偶数
                              if (value % 2 !== 0) {
                                value = value - 1;
                              }
                              value = Math.min(16, Math.max(2, value));
                              setSliceCount(value);
                            }}
                            className="slice-count-input"
                          />
                          <span className="slice-description">
                            {sliceCount === 4 && '2×2网格切割（4份）'}
                            {sliceCount === 6 && '2×3或3×2网格切割（6份）'}
                            {sliceCount === 8 && '2×4或4×2网格切割（8份）'}
                            {sliceCount === 10 && '2×5或5×2网格切割（10份）'}
                            {sliceCount === 12 && '3×4或4×3网格切割（12份）'}
                            {sliceCount === 14 && '2×7或7×2网格切割（14份）'}
                            {sliceCount === 16 && '4×4网格切割（16份）'}
                            {![4, 6, 8, 10, 12, 14, 16].includes(sliceCount) && `自定义网格切割（${sliceCount}份）`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
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
        </div>
      </main>
    </div>
  );
}

export default App; 