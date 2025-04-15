import React, { useState, useRef, useEffect } from 'react';
import './FileUploader.css';

const FileUploader = ({ 
  type, 
  files = [], 
  onFilesSelected, 
  onFilesDirectorySelected,
  onClear, 
  accept = "*",
  multiple = false,
  directory = false,
  title,
  allowDirectory = false
}) => {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const directoryInputRef = useRef(null);

  const handleClick = () => {
    if (directory && directoryInputRef.current) {
      directoryInputRef.current.click();
    } else if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
    onFilesSelected(type, selectedFiles);
    }
  };
  
  const handleDirectoryChange = (e) => {
    if (!e.target.files || e.target.files.length === 0) {
      console.log('没有选择文件夹或文件夹为空');
      return;
    }
    
    try {
      // 将FileList转换为数组，但不使用Array.from直接转换，而是遍历复制
      const selectedFiles = [];
      for (let i = 0; i < e.target.files.length; i++) {
        selectedFiles.push(e.target.files[i]);
      }
      
      console.log('文件夹选择:', selectedFiles.length, '个文件');
      
      if (selectedFiles.length > 0 && onFilesDirectorySelected) {
        // 添加更多调试信息
        console.log('第一个文件示例:', {
          名称: selectedFiles[0].name,
          类型: selectedFiles[0].type,
          大小: selectedFiles[0].size,
          路径: selectedFiles[0].webkitRelativePath || '无路径'
        });
        
        onFilesDirectorySelected(selectedFiles);
      }
    } catch (error) {
      console.error('处理文件夹选择时出错:', error);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    try {
      const items = e.dataTransfer.items;
      if (!items || items.length === 0) {
        console.log('拖放内容为空');
        return;
      }
      
      console.log('拖放文件:', items.length, '个项目');
      
      // 检查是否有文件夹
      let hasDirectory = false;
      for (let i = 0; i < items.length; i++) {
        if (!items[i].webkitGetAsEntry) {
          console.warn('WebkitGetAsEntry API不可用，无法识别文件夹');
          continue;
        }
        
        const entry = items[i].webkitGetAsEntry();
        if (entry && entry.isDirectory) {
          hasDirectory = true;
          console.log('检测到文件夹:', entry.name);
          break;
        }
      }
      
      // 如果是文件夹且支持文件夹处理
      if (hasDirectory && onFilesDirectorySelected) {
        const fileEntries = [];
        let pendingEntries = 0;
        
        const traverseDirectory = (entry, path = '') => {
          if (!entry) {
            console.warn('无效的文件系统条目');
            return;
          }
          
          if (entry.isFile) {
            pendingEntries++;
            entry.file(file => {
              try {
                // 创建新的文件对象，完全脱离原始对象
                const reader = new FileReader();
                reader.onload = function(event) {
                  try {
                    const blob = new Blob([event.target.result], {type: file.type || 'application/octet-stream'});
                    const newFile = new File([blob], file.name, {
                      type: file.type || 'application/octet-stream',
                      lastModified: file.lastModified
                    });
                    
                    // 添加自定义路径属性
                    Object.defineProperty(newFile, 'customPath', {
                      value: path + file.name,
                      writable: true,
                      enumerable: true,
                      configurable: true
                    });
                    
                    // 添加文件夹路径属性
                    Object.defineProperty(newFile, 'folderPath', {
                      value: path,
                      writable: true,
                      enumerable: true,
                      configurable: true
                    });
                    
                    // 添加模拟的webkitRelativePath属性
                    Object.defineProperty(newFile, 'webkitRelativePath', {
                      value: path + file.name,
                      writable: true,
                      enumerable: true,
                      configurable: true
                    });
                    
                    fileEntries.push(newFile);
                  } catch (error) {
                    console.error('创建新文件对象时出错:', error);
                  }
                  
                  pendingEntries--;
                  // 所有文件处理完毕
                  if (pendingEntries === 0) {
                    console.log('文件夹遍历完成，共找到', fileEntries.length, '个文件');
                    if (fileEntries.length > 0) {
                      onFilesDirectorySelected(fileEntries);
                    } else {
                      console.warn('未找到有效文件');
                    }
                  }
                };
                
                reader.onerror = function() {
                  console.error(`读取文件 ${file.name} 失败`);
                  pendingEntries--;
                };
                
                // 开始读取文件
                reader.readAsArrayBuffer(file);
              } catch (error) {
                console.error('处理文件时出错:', error);
                pendingEntries--;
              }
            }, error => {
              console.error('获取文件信息失败:', error);
              pendingEntries--;
            });
          } else if (entry.isDirectory) {
            try {
              const dirReader = entry.createReader();
              pendingEntries++;
              
              const readEntries = () => {
                dirReader.readEntries(entries => {
                  try {
                    if (entries.length > 0) {
                      for (let i = 0; i < entries.length; i++) {
                        traverseDirectory(entries[i], path + entry.name + '/');
                      }
                      readEntries(); // 继续读取，直到所有条目都被读取
                    } else {
                      pendingEntries--;
                    }
                  } catch (error) {
                    console.error('读取目录条目时出错:', error);
                    pendingEntries--;
                  }
                }, error => {
                  console.error('读取目录失败:', error);
                  pendingEntries--;
                });
              };
              
              readEntries();
            } catch (error) {
              console.error('处理目录时出错:', error);
              pendingEntries--;
            }
          }
        };
        
        // 开始处理每个项目
        for (let i = 0; i < items.length; i++) {
          if (!items[i].webkitGetAsEntry) {
            console.warn(`项目 ${i} 不支持webkitGetAsEntry API`);
            continue;
          }
          
          const entry = items[i].webkitGetAsEntry();
          if (entry) {
            traverseDirectory(entry);
          } else {
            console.warn(`无法获取项目 ${i} 的文件系统条目`);
          }
        }
      } else {
        // 普通文件处理
        const droppedFiles = [];
        // 手动遍历FileList以避免可能的Illegal invocation
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          droppedFiles.push(e.dataTransfer.files[i]);
        }
        
        if (droppedFiles.length > 0) {
          console.log('拖放了 ', droppedFiles.length, ' 个普通文件');
          onFilesSelected(type, droppedFiles);
        } else {
          console.log('没有有效的拖放文件');
        }
      }
    } catch (error) {
      console.error('处理拖放操作时出错:', error);
    }
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else if (onFilesSelected) {
      onFilesSelected(type, []);
    }
    
    // 重置input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (directoryInputRef.current) {
      directoryInputRef.current.value = '';
    }
  };

  const getDisplayText = () => {
    if (files.length === 0) {
      switch (type) {
        case 'covers':
          return '上传封面图';
        case 'backgrounds':
          return '上传背景图';
        case 'excel':
          return '上传Excel文件';
        default:
          return '上传文件';
      }
    } else {
      if (files.length === 1) {
        return files[0].name || '未命名文件';
      } else {
        return `已选择 ${files.length} 个文件`;
      }
    }
  };

  // 格式化文件大小
  const formatFileSize = (size) => {
    if (size === 0) return "未知大小";
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(2) + " KB";
    return (size / 1024 / 1024).toFixed(2) + " MB";
  };

  const getAcceptTypes = () => {
    if (accept) {
      return accept;
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
        return allowDirectory ? '上传封面图片（支持文件夹）' : '上传封面图片';
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

  const handleSelectFolder = () => {
    console.log("===== 手动选择文件夹按钮点击 =====");
    
    // 确保在macOS上使用专用文件夹输入元素
    if (directoryInputRef.current) {
      console.log("使用专用文件夹输入元素");
      try {
        // 确保webkitdirectory属性已设置
        directoryInputRef.current.setAttribute('webkitdirectory', '');
        directoryInputRef.current.setAttribute('directory', '');
        directoryInputRef.current.click();
      } catch (error) {
        console.error("选择文件夹时出错:", error);
      }
    }
  };

  const getUploadText = () => {
    if (allowDirectory) {
      return "点击或拖拽文件/文件夹到此处";
    }
    return "点击或拖拽文件到此处";
  };

  // 获取文件夹路径
  const getFileFolder = (file) => {
    if (file.webkitRelativePath) {
      const parts = file.webkitRelativePath.split('/');
      return parts.length > 1 ? parts[0] : '';
    }
    return '';
  };

  // 根据文件夹组织文件
  const groupFilesByFolder = () => {
    if (!files || files.length === 0 || !allowDirectory) {
      return null;
    }
    
    // 检查是否有文件夹路径 - 改用循环检查而不是调用some方法
    let hasWebkitRelativePath = false;
    let hasCustomMetadata = false;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.webkitRelativePath) {
        hasWebkitRelativePath = true;
      }
      if (file.__metadata__) {
        hasCustomMetadata = true;
      }
      // 如果两者都找到了，就可以提前结束循环
      if (hasWebkitRelativePath && hasCustomMetadata) {
        break;
      }
    }
    
    if ((hasWebkitRelativePath || hasCustomMetadata) && allowDirectory) {
      // 按文件夹分组或按自定义元数据分组
      const folders = {};
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let groupKey = '_root';
        
        // 优先使用自定义元数据
        if (file.__metadata__ && file.__metadata__.customGroup) {
          groupKey = file.__metadata__.customGroup;
        } else {
          // 尝试使用webkitRelativePath
          const folder = getFileFolder(file);
          if (folder) {
            groupKey = folder;
          }
        }
        
        if (!folders[groupKey]) {
          folders[groupKey] = [];
        }
        folders[groupKey].push(file);
      }
      
      // 转换为数组格式
      return Object.entries(folders).map(([folderName, folderFiles]) => ({
        name: folderName === '_root' ? '根目录' : folderName,
        files: folderFiles,
        count: folderFiles.length
      }));
    }
    
    // 普通文件列表
    return null;
  };

  const folderGroups = groupFilesByFolder();

  const renderFileList = () => {
    if (!files || files.length === 0) return null;
    
    return (
      <div className="file-list">
        <h4>已选择的文件：</h4>
        <ul>
          {files.map((file, index) => (
            <li key={index}>
              {file.name} 
              {file.webkitRelativePath && ` (${file.webkitRelativePath})`} 
              - {(file.size / 1024).toFixed(2)} KB
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="file-uploader">
    <div 
        className={`uploader-area ${files.length > 0 ? 'has-files' : ''}`}
        onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
        <div className="upload-icon">
          <i className="fas fa-upload"></i>
        </div>
        <div className="upload-text">
          {getDisplayText()}
        {files.length > 0 && (
            <div className="file-count">
              {files.length} 个文件
            </div>
          )}
        </div>
      </div>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        accept={getAcceptTypes()}
        multiple={getMultiple()}
      />
      
      {directory && (
        <input
          type="file"
          ref={directoryInputRef}
          onChange={handleDirectoryChange}
          style={{ display: 'none' }}
          webkitdirectory="true"
          directory="true"
          mozdirectory="true"
        />
      )}

      {files.length > 0 && (
        <button className="clear-button" onClick={handleClear}>
          清除
        </button>
      )}
    </div>
  );
};

export default FileUploader; 