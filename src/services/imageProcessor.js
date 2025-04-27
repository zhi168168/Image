import { read as readXLSX } from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { DBService } from './dbService';

export class ImageProcessor {
  static async processImages(coverImages, backgroundImages, excelFile, onProgress, titleConfig, imageFormat = 'png', pageMode = 'flexible', pageLimit = 0, knowledgeMode = false, knowledgeCount = 0, knowledgeExcel = null, sliceMode = false, sliceCount = 4, coverMode = 'single', topicMode = false) {
    console.log("===== 开始处理图片 =====");
    console.log("封面模式:", coverMode);
    console.log("封面图数量:", coverImages ? coverImages.length : 0);
    console.log("背景图数量:", backgroundImages.length);
    console.log("页面模式:", pageMode);
    console.log("页面限制:", pageLimit);
    console.log("切割模式:", sliceMode ? `启用 (${sliceCount}份)` : "禁用");
    console.log("知识拼接模式:", knowledgeMode ? `启用 (${knowledgeCount}份)` : "禁用");
    console.log("主题模式:", topicMode ? "启用" : "禁用");

    // 判断是否使用的是默认黑色封面
    const isUsingBlackCover = coverImages?.[0]?.name === 'black_cover.png';
    console.log("是否使用默认黑色封面:", isUsingBlackCover);

    try {
      // 解析Excel文件
      onProgress(0, '正在解析表格文件...');
      const textContent = await this.parseExcel(excelFile);
      
      // 判断是否是结构化的主题数据或普通数据
      const isStructuredData = Array.isArray(textContent) && textContent.length > 0 && 
                               typeof textContent[0] === 'object' && textContent[0].topic && 
                               Array.isArray(textContent[0].items);
      
      if (isStructuredData) {
        console.log("Excel内容解析完成，主题模式，共", textContent.length, "个主题");
      } else {
        console.log("Excel内容解析完成，普通模式，共", textContent.length, "条记录");
      }
      
      // 如果启用知识拼接模式，解析知识Excel文件
      let knowledgeData = [];
      if (knowledgeMode && knowledgeCount > 0 && knowledgeExcel) {
        onProgress(5, '正在解析知识文件...');
        knowledgeData = await this.parseKnowledgeExcel(knowledgeExcel);
        console.log("知识Excel解析完成，共", knowledgeData.length, "条记录");
        
        // 检查知识条目是否足够
        const requiredKnowledge = knowledgeCount * (coverImages?.length || 1);
        if (knowledgeData.length < requiredKnowledge) {
          console.error("知识条目不足", `需要${requiredKnowledge}条，但只有${knowledgeData.length}条`);
          throw new Error(`知识条目不足，需要${requiredKnowledge}条，但只有${knowledgeData.length}条`);
        }
      }
      
      // 处理素材切割（如果启用）
      let processedBackgrounds = [];
      if (sliceMode) {
        onProgress(10, '正在切割内页素材...');
        // 对每张背景图进行切割
        for (const backgroundImage of backgroundImages) {
          console.log(`切割背景图: ${backgroundImage.name}`);
          const slices = await this.sliceBackgroundImage(backgroundImage, sliceCount);
          processedBackgrounds = [...processedBackgrounds, ...slices];
        }
        console.log(`内页素材切割完成，共生成 ${processedBackgrounds.length} 个素材片段`);
        onProgress(15, `内页素材切割完成，共生成${processedBackgrounds.length}个素材片段`);
      } else {
        // 不切割时，直接使用原始背景图
        processedBackgrounds = backgroundImages;
        console.log("不启用切割模式，使用原始背景图", processedBackgrounds.length, "张");
      }

      // 组织封面图
      console.log("开始组织封面图...");
      const organizedCovers = await this.organizeCovers(coverImages, coverMode);
      console.log(`封面图组织完成，共识别到 ${organizedCovers.length} 个封面图组`);
      onProgress(17, `封面图组织完成，识别到${organizedCovers.length}个封面图组`);
      
      // 创建 ZIP 文件
      const zip = new JSZip();
      
      // 处理文件夹数量 - 使用封面图组数量或者1（如果没有封面图）
      const totalSteps = organizedCovers.length || 1;
      console.log(`需要处理的文件夹总数: ${totalSteps}`);

      // 背景图片索引（用于严谨模式）
      let backgroundIndex = 0;
      
      // 知识条目索引
      let knowledgeIndex = 0;

      // 处理每组图片
      for (let i = 0; i < totalSteps; i++) {
        onProgress(
          Math.round(20 + (i / totalSteps) * 75),
          `正在处理第 ${i + 1}/${totalSteps} 组图片...`
        );
        console.log(`开始处理第 ${i + 1}/${totalSteps} 组图片`);

        // 处理封面图片组 - 可能存在或不存在
        let coverGroup = organizedCovers[i] || null;
        console.log(`当前封面图组:`, coverGroup ? `包含 ${coverGroup.length} 张图片` : "无封面图");
        
        // 处理背景图片
        let backgroundCanvas;
        
        if (pageMode === 'flexible') {
          // 宽松模式：使用对应的背景图
          // 如果背景图不够，则循环使用
          const backgroundIndex = i % processedBackgrounds.length;
          
          if (sliceMode) {
            // 切割模式下，processedBackgrounds已经是Canvas对象数组
            backgroundCanvas = processedBackgrounds[backgroundIndex];
          } else {
            // 非切割模式，需要处理背景图
            backgroundCanvas = await this.processBackgroundImage(processedBackgrounds[backgroundIndex]);
          }
        }
        
        // 生成内页
        let contentPages;
        
        if (pageMode === 'flexible') {
          // 宽松模式：所有内页使用同一张背景
          contentPages = await this.generateContentPages(
            backgroundCanvas, 
            textContent,
            titleConfig,
            imageFormat,
            topicMode
          );
        } else if (pageMode === 'cautious') {
          // 谨慎模式：每个内页使用不同的背景，只有第一页显示标题
          try {
            if (sliceMode) {
              // 切割模式下，直接使用处理好的背景Canvas
              contentPages = await this.generateContentPagesCautiousWithProcessedBackgrounds(
                processedBackgrounds,
                backgroundIndex,
                textContent,
                titleConfig,
                imageFormat,
                topicMode
              );
            } else {
              // 非切割模式，使用原始背景图
              console.log(`谨慎模式: 使用从索引 ${backgroundIndex} 开始的背景图`);
              contentPages = await this.generateContentPagesCautious(
                processedBackgrounds,
                backgroundIndex,
                textContent,
                titleConfig,
                imageFormat,
                topicMode
              );
            }
            
            // 更新背景索引
            backgroundIndex += contentPages.length;
            console.log(`谨慎模式: 处理完成后背景索引更新为 ${backgroundIndex}`);
          } catch (error) {
            // 直接向上抛出错误
            console.error(`谨慎模式处理失败:`, error);
            throw error;
          }
        } else {
          // 严谨模式：每个内页使用不同的背景
          try {
            if (sliceMode) {
              // 切割模式下，直接使用处理好的背景Canvas
              contentPages = await this.generateContentPagesStrictWithProcessedBackgrounds(
                processedBackgrounds,
                backgroundIndex,
                textContent,
                titleConfig,
                imageFormat,
                topicMode
              );
            } else {
              // 非切割模式，使用原始背景图
              console.log(`严谨模式: 使用从索引 ${backgroundIndex} 开始的背景图`);
              contentPages = await this.generateContentPagesStrict(
                processedBackgrounds,
                backgroundIndex,
                textContent,
                titleConfig,
                imageFormat,
                topicMode
              );
            }
            
            // 更新背景索引
            backgroundIndex += contentPages.length;
            console.log(`严谨模式: 处理完成后背景索引更新为 ${backgroundIndex}`);
          } catch (error) {
            // 直接向上抛出错误
            console.error(`严谨模式处理失败:`, error);
            throw error;
          }
        }

        // 应用内页数量限制
        if (pageLimit > 0 && contentPages.length > pageLimit) {
          // 如果内页数量超出限制，需要保留首页和尾页，从倒数第二页开始往前删除
          const totalPages = contentPages.length;
          const pagesToRemove = totalPages - pageLimit;
          
          if (pagesToRemove > 0) {
            // 从倒数第二页开始往前删除
            // 例如: [0,1,2,3,4,5] 限制为4页 -> [0,1,4,5]
            // 需要删除的是 length-2-pagesToRemove+1 到 length-2
            const removedPages = contentPages.splice(totalPages - pagesToRemove - 1, pagesToRemove);
            
            // 要释放移除页面占用的背景图索引（只在严谨模式和谨慎模式下需要）
            if (pageMode !== 'flexible') {
              backgroundIndex -= removedPages.length;
            }
          }
        }

        // 获取文件夹编号并确保完成存储
        const nextIndex = await DBService.getNextAvailableIndex();
        await DBService.markIndexAsUsed(nextIndex);
        
        // 等待一段时间确保 IndexedDB 操作完成
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const folderName = String(nextIndex).padStart(4, '0');
        console.log(`Creating folder: ${folderName}`); // 添加日志
        
        // 创建文件夹并添加文件
        const folder = zip.folder(folderName);
        
        // 处理封面图
        if (coverGroup && !isUsingBlackCover) {
          console.log(`开始处理封面图组: ${coverGroup.length}张图片`);
          
          // 检查封面组是否有效
          if (coverGroup.length === 0) {
            console.warn("警告: 封面组为空");
          } else {
            if (coverMode === 'single') {
              // 单图模式：只使用第一张封面图
              console.log(`处理单图模式封面: ${coverGroup[0].name || '未命名文件'}`);
              try {
                const processedCover = await this.processImage(coverGroup[0], imageFormat);
                // 将封面图命名为内页1
                folder.file(`内页1.${imageFormat}`, processedCover);
                console.log(`封面图处理完成: 内页1.${imageFormat}`);
              } catch (error) {
                console.error(`处理封面图失败:`, error);
                // 创建一个简单的占位图，避免没有封面图
                try {
                  const placeholderCanvas = this.createPlaceholderImage("封面图生成失败", imageFormat);
                  const placeholderBlob = await this.canvasToBlob(placeholderCanvas, imageFormat);
                  // 将占位图命名为内页1
                  folder.file(`内页1.${imageFormat}`, placeholderBlob);
                  console.log(`已创建替代封面图，命名为内页1`);
                } catch (e) {
                  console.error("创建替代封面图也失败:", e);
                }
              }
            } else {
              // 多图模式：处理所有封面图并按顺序命名
              console.log(`处理多图模式封面组，共 ${coverGroup.length} 张图片`);
              let successCount = 0;
              let failedFiles = [];
              
              // 首先对coverGroup进行排序，确保名称的正确顺序
              coverGroup.sort((a, b) => {
                // 尝试提取文件名（不带扩展名）
                const nameA = a.name.split('.')[0].trim();
                const nameB = b.name.split('.')[0].trim();
                
                // 检查两个文件名是否都是纯数字
                const isNumericA = /^\d+$/.test(nameA);
                const isNumericB = /^\d+$/.test(nameB);
                
                // 如果两个都是数字，按数值大小排序
                if (isNumericA && isNumericB) {
                  return parseInt(nameA, 10) - parseInt(nameB, 10);
                }
                
                // 否则按字典序排序
                return nameA.localeCompare(nameB);
              });
              
              // 记录原始文件名到索引的映射，用于输出文件命名
              const fileNameMapping = {};
              coverGroup.forEach((file, index) => {
                // 不再使用原始文件名，而是使用从1开始的新索引
                fileNameMapping[index] = (index + 1).toString();
                console.log(`文件索引映射: [${index}] => ${fileNameMapping[index]} (原始文件: ${file.name})`);
              });
              
              for (let j = 0; j < coverGroup.length; j++) {
                const coverFile = coverGroup[j];
                const fileName = coverFile.name || `未命名文件_${j+1}`;
                console.log(`处理第 ${j+1} 张封面图: ${fileName}`);
                
                try {
                  // 尝试处理该封面图，最多重试2次
                  let processedCover = null;
                  let attempts = 0;
                  
                  while (attempts < 3 && !processedCover) {
                    try {
                      processedCover = await this.processImage(coverFile, imageFormat);
                      break;
                    } catch (retryError) {
                      attempts++;
                      if (attempts < 3) {
                        console.warn(`处理封面图 ${fileName} 第 ${attempts} 次尝试失败，将重试...`);
                        await new Promise(r => setTimeout(r, 100)); // 短暂延迟后重试
                      } else {
                        console.error(`处理封面图 ${fileName} 失败，已重试 ${attempts-1} 次:`, retryError);
                        throw retryError; // 超过重试次数，抛出错误
                      }
                    }
                  }
                  
                  if (processedCover) {
                    // 使用新的命名规则：所有图片按顺序命名为内页
                    const newIndex = j + 1; // 从1开始的新索引
                    folder.file(`内页${newIndex}.${imageFormat}`, processedCover);
                    console.log(`封面图处理完成: 内页${newIndex}.${imageFormat} (来自 ${fileName})`);
                    successCount++;
                  }
                } catch (error) {
                  console.error(`处理封面图 ${fileName} 失败:`, error);
                  failedFiles.push(fileName);
                  
                  // 创建一个简单的占位图，避免顺序混乱
                  try {
                    // 使用新的命名规则
                    const newIndex = j + 1; // 从1开始的新索引
                    const placeholderCanvas = this.createPlaceholderImage(`内页${newIndex}加载失败`, imageFormat);
                    const placeholderBlob = await this.canvasToBlob(placeholderCanvas, imageFormat);
                    folder.file(`内页${newIndex}.${imageFormat}`, placeholderBlob);
                    console.log(`已创建替代封面图 内页${newIndex}.${imageFormat} (来自 ${fileName})`);
                  } catch (e) {
                    console.error(`创建替代封面图 ${j+1} 也失败:`, e);
                  }
                }
              }
              
              console.log(`多图模式封面处理完成，成功处理 ${successCount}/${coverGroup.length} 张图片`);
              if (failedFiles.length > 0) {
                console.warn(`处理失败的文件: ${failedFiles.join(', ')}`);
              }
            }
          }
        } else {
          console.log(`跳过封面图处理: ${isUsingBlackCover ? "使用默认黑色封面" : "无封面组"}`);
        }
        
        // 添加内页
        contentPages.forEach((pageBlob, pageIndex) => {
          // 根据封面图数量调整内页编号
          const coverCount = coverGroup && !isUsingBlackCover ? coverGroup.length : 
                             (coverMode === 'single' && !isUsingBlackCover ? 1 : 0);
          folder.file(`内页${pageIndex + 1 + coverCount}.${imageFormat}`, pageBlob);
        });
        
        // 记录当前图片总数，用于知识图片的连续编号
        const totalImagesCount = (coverGroup && !isUsingBlackCover ? coverGroup.length : 
                               (coverMode === 'single' && !isUsingBlackCover ? 1 : 0)) + contentPages.length;
        
        // 如果启用了知识拼接模式，生成知识图片
        if (knowledgeMode && knowledgeCount > 0) {
          for (let k = 0; k < knowledgeCount; k++) {
            if (knowledgeIndex < knowledgeData.length) {
              const knowledge = knowledgeData[knowledgeIndex++];
              const knowledgeImage = await this.generateKnowledgeImage(
                knowledge.title,
                knowledge.content,
                imageFormat
              );
              folder.file(`内页${totalImagesCount + k + 1}.${imageFormat}`, knowledgeImage);
            }
          }
        }
      }
      
      // 生成 ZIP 文件
      onProgress(95, '正在生成ZIP文件...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // 创建下载链接
      const zipUrl = URL.createObjectURL(zipBlob);
      
      onProgress(100, '处理完成！');

      return {
        success: true,
        zipUrl,
        fileName: `processed_images_${ImageProcessor.formatDate(new Date())}.zip`
      };
    } catch (error) {
      console.error('Error processing images:', error);
      onProgress(0, `处理出错: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  static async processBackgroundImage(backgroundImage) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 设置画布尺寸为1242x1660
        canvas.width = 1242;
        canvas.height = 1660;

        // 绘制黑色背景
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 计算缩放比例
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        // 居中绘制图片
        const x = (canvas.width - scaledWidth) / 2;
        const y = (canvas.height - scaledHeight) / 2;

        // 设置透明度
        ctx.globalAlpha = 0.35;
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

        resolve(canvas);
      };
      img.src = URL.createObjectURL(backgroundImage);
    });
  }

  static async parseExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = readXLSX(e.target.result, { type: 'array' });
          
          // 新的解析方式：保存主题结构的数据
          const structuredData = [];
          
          // 遍历所有sheet（每个sheet作为一个主题）
          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const items = [];
            
            // 读取当前sheet的A列所有内容（子项目）
            let i = 1;
            while (sheet[`A${i}`]) {
              items.push(sheet[`A${i}`].v);
              i++;
            }
            
            // 只有当sheet包含内容时才添加到主题列表
            if (items.length > 0) {
              structuredData.push({
                topic: sheetName, // 使用sheet名称作为主题名
                items: items     // 子项目列表
              });
            }
          });
          
          // 如果没有找到任何有效数据，尝试使用旧方法兼容单sheet情况
          if (structuredData.length === 0) {
            console.warn('未找到符合多主题结构的数据，尝试使用兼容模式');
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const items = [];
            let i = 1;
            while (firstSheet[`A${i}`]) {
              items.push(firstSheet[`A${i}`].v);
              i++;
            }
            
            if (items.length > 0) {
              structuredData.push({
                topic: '默认主题',
                items: items
              });
            }
          }
          
          console.log(`Excel解析完成，共发现 ${structuredData.length} 个主题`);
          structuredData.forEach((topic, index) => {
            console.log(`主题${index+1} [${topic.topic}]: ${topic.items.length} 个子项目`);
          });
          
          resolve(structuredData);
        } catch (error) {
          console.error('解析Excel文件失败:', error);
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  static async processImage(coverImage, imageFormat = 'png') {
    // 确保文件有名称属性，没有则创建默认名称
    if (!coverImage.name) {
      const defaultName = `未命名文件_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      console.log(`在processImage中创建默认文件名: ${defaultName}`);
      try {
        // 尝试直接设置属性
        coverImage.name = defaultName;
      } catch (e) {
        // 如果直接设置失败，使用defineProperty
        try {
          Object.defineProperty(coverImage, 'name', {
            value: defaultName,
            writable: true,
            enumerable: true,
            configurable: true
          });
          console.log(`已成功为文件对象定义name属性: ${coverImage.name}`);
        } catch (defineError) {
          console.error(`无法为文件对象定义name属性:`, defineError);
          // 如果仍然失败，我们需要创建一个新的对象包装原文件
          coverImage = new Blob([coverImage], { type: coverImage.type || 'image/png' });
          coverImage.name = defaultName;
          console.log(`已创建新的Blob对象作为替代，名称: ${coverImage.name}`);
        }
      }
    }
    
    console.log(`开始处理封面图: ${coverImage.name}, 类型: ${coverImage.type || '未知'}, 大小: ${coverImage.size}字节`);
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        // 处理完毕后释放对象URL以避免内存泄漏
        URL.revokeObjectURL(img.src);
        console.log(`封面图 ${coverImage.name} 已成功加载，尺寸: ${img.width}x${img.height}`);
        
        const canvas = document.createElement('canvas');
        canvas.width = 1242;
        canvas.height = 1660;
        const ctx = canvas.getContext('2d');
        
        // 绘制封面图片
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        console.log(`封面图 ${coverImage.name} 已绘制到画布，尺寸: ${canvas.width}x${canvas.height}`);
        
        // 转换为blob
        try {
          canvas.toBlob((blob) => {
            if (blob) {
              console.log(`封面图 ${coverImage.name} 已成功转换为Blob，大小: ${blob.size}字节`);
              
              // 通过添加名称属性，确保后续处理能识别该文件
              blob.name = `${coverImage.name.split('.')[0]}_processed.${imageFormat}`;
              
              resolve(blob);
            } else {
              const error = `转换封面图 ${coverImage.name} 为Blob失败`;
              console.error(error);
              reject(new Error(error));
            }
          }, `image/${imageFormat}`, imageFormat === 'jpeg' ? 0.9 : undefined);
        } catch (error) {
          console.error(`处理封面图 ${coverImage.name} 时发生错误:`, error);
          reject(error);
        }
      };
      
      img.onerror = (error) => {
        console.error('封面图片加载失败:', error, coverImage.name);
        // 释放对象URL
        try {
          if (img.src && img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
          }
        } catch (e) {
          console.error('释放URL时出错:', e);
        }
        
        // 创建一个空白图片作为替代，避免整个处理流程失败
        console.log(`尝试创建替代图片用于封面 ${coverImage.name}`);
        const canvas = document.createElement('canvas');
        canvas.width = 1242;
        canvas.height = 1660;
        const ctx = canvas.getContext('2d');
        
        // 绘制灰色背景和错误提示
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#FF0000';
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`无法加载图片: ${coverImage.name}`, canvas.width / 2, canvas.height / 2);
        console.log(`已为封面 ${coverImage.name} 创建替代错误图片`);
        
        canvas.toBlob((blob) => {
          console.log(`替代错误图片已转换为Blob, 大小: ${blob.size}字节`);
          resolve(blob);
        }, `image/${imageFormat}`, imageFormat === 'jpeg' ? 0.9 : undefined);
      };
      
      try {
        console.log(`开始加载封面图: ${coverImage.name}`);
        
        // 检查文件对象是否有效
        if (!(coverImage instanceof Blob) && !(coverImage instanceof File)) {
          throw new Error(`封面图对象类型无效: ${typeof coverImage}`);
        }
        
        // 使用createObjectURL创建图片地址
        const objectUrl = URL.createObjectURL(coverImage);
        img.src = objectUrl;
        
        // 添加超时处理，避免图片一直处于加载状态
        setTimeout(() => {
          if (!img.complete) {
            console.warn(`加载封面图 ${coverImage.name} 超时，尝试触发错误处理`);
            img.onerror(new Error('加载超时'));
          }
        }, 10000); // 10秒超时
      } catch (error) {
        const errorMsg = `创建封面图 ${coverImage.name} 的URL失败: ${error.message}`;
        console.error(errorMsg);
        
        // 直接调用错误处理程序，而不是拒绝Promise
        setTimeout(() => {
          img.onerror(error);
        }, 0);
      }
    });
  }

  static async generateContentPages(backgroundCanvas, textContent, titleConfig, imageFormat = 'png', topicMode = false) {
    // 检查是否是结构化的主题数据
    const isStructuredData = Array.isArray(textContent) && textContent.length > 0 && 
                             typeof textContent[0] === 'object' && textContent[0].topic && 
                             Array.isArray(textContent[0].items);
    
    let processedContent;
    
    if (isStructuredData && topicMode) {
      console.log("使用主题模式处理内容");
      console.log("原始主题数据:", textContent.map(t => ({ topic: t.topic, itemCount: t.items.length })));
      // 结构化数据处理：随机打乱主题顺序，并在每个主题内部随机打乱子项目
      processedContent = [...textContent]; // 复制原始结构
      
      // 1. 随机打乱主题顺序
      processedContent = this.shuffleArray(processedContent);
      
      // 2. 对每个主题内的子项目随机打乱
      processedContent.forEach(topic => {
        topic.items = this.shuffleArray([...topic.items]);
      });
      
      console.log("主题模式内容处理完成，主题顺序和子项目顺序已随机打乱");
      console.log("处理后主题数据:", processedContent.map(t => ({ topic: t.topic, itemCount: t.items.length })));
    } else {
      // 普通模式：直接随机打乱所有内容
      if (isStructuredData) {
        // 结构化数据，但未启用主题模式，将其扁平化处理
        console.log("未启用主题模式，将结构化数据扁平化处理");
        const flatContent = [];
        textContent.forEach(topic => {
          topic.items.forEach(item => {
            flatContent.push(item);
          });
        });
        console.log(`扁平化后共有 ${flatContent.length} 个项目`);
        processedContent = this.shuffleArray([...flatContent]);
      } else {
        // 普通数组数据，直接打乱
        console.log(`普通数组数据，共有 ${textContent.length} 个项目`);
        processedContent = this.shuffleArray([...textContent]);
      }
    }
    
    const pages = [];
    let currentPage = null;
    let lineNumber = 1;
    let currentTopicIndex = 0;
    let currentItemIndex = 0;
    
    // 创建新页面
    const createNewPage = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1242;
      canvas.height = 1660;
      const ctx = canvas.getContext('2d');

      // 复制背景
      ctx.drawImage(backgroundCanvas, 0, 0);

      // 设置标题字体以计算高度
      ctx.font = '80px sans-serif';
      const titleMetrics = ctx.measureText(titleConfig.text);
      const titleHeight = titleMetrics.actualBoundingBoxAscent + titleMetrics.actualBoundingBoxDescent;
      const titleBackgroundHeight = titleHeight * 1.2;
      const titleWidth = titleMetrics.width * 1.2;

      // 计算标题背景位置
      const titleBackgroundX = (canvas.width - titleWidth) / 2;
      const cornerRadius = 10;

      // 使用配置的背景色
      ctx.fillStyle = titleConfig.backgroundColor;
      ctx.beginPath();
      ctx.moveTo(titleBackgroundX + cornerRadius, 80);
      ctx.lineTo(titleBackgroundX + titleWidth - cornerRadius, 80);
      ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80, titleBackgroundX + titleWidth, 80 + cornerRadius);
      ctx.lineTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight - cornerRadius);
      ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight, titleBackgroundX + titleWidth - cornerRadius, 80 + titleBackgroundHeight);
      ctx.lineTo(titleBackgroundX + cornerRadius, 80 + titleBackgroundHeight);
      ctx.quadraticCurveTo(titleBackgroundX, 80 + titleBackgroundHeight, titleBackgroundX, 80 + titleBackgroundHeight - cornerRadius);
      ctx.lineTo(titleBackgroundX, 80 + cornerRadius);
      ctx.quadraticCurveTo(titleBackgroundX, 80, titleBackgroundX + cornerRadius, 80);
      ctx.closePath();
      ctx.fill();

      // 绘制标题文字
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(titleConfig.text, canvas.width / 2, 80 + titleHeight);

      return {
        canvas,
        ctx,
        currentY: 80 + titleBackgroundHeight + 100,
        linesOnPage: 0
      };
    };

    // 初始化第一页
    currentPage = createNewPage();
    
    // 根据处理模式处理内容
    if (isStructuredData && topicMode) {
      // 主题模式：按主题和子项目结构处理
      while (currentTopicIndex < processedContent.length) {
        const topic = processedContent[currentTopicIndex];
        
        // 绘制主题标题
        currentPage.ctx.font = 'bold 55px sans-serif';
        currentPage.ctx.fillStyle = '#FFFFFF';
        currentPage.ctx.textAlign = 'left';
        
        // 计算绘制主题需要的空间
        const topicText = topic.topic;
        const topicLines = this.wrapText(currentPage.ctx, topicText, 55, 1082);
        
        // 检查页面剩余空间
        const topicHeight = topicLines.length * 60 + 20; // 主题高度 + 额外间距
        if (currentPage.currentY + topicHeight > 1650) {
          // 当前页空间不足，创建新页
          pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
          currentPage = createNewPage();
          
          // 在新页面上重新设置主题字体样式
          currentPage.ctx.font = 'bold 55px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
        }
        
        // 绘制主题标题（添加emoji✅，加粗，并添加下划线）
        topicLines.forEach((line, index) => {
          // 绘制文本（加前缀emoji）
          const textToDraw = index === 0 ? `✅ ${line}` : line;
          currentPage.ctx.fillText(
            textToDraw,
            80,
            currentPage.currentY
          );
          
          // 绘制下划线
          const textWidth = currentPage.ctx.measureText(textToDraw).width;
          const underlineY = currentPage.currentY + 5; // 下划线位置在文本下方5px
          currentPage.ctx.beginPath();
          currentPage.ctx.moveTo(80, underlineY);
          currentPage.ctx.lineTo(80 + textWidth, underlineY);
          currentPage.ctx.lineWidth = 2;
          currentPage.ctx.strokeStyle = '#FFFFFF';
          currentPage.ctx.stroke();
          
          currentPage.currentY += 60;
          currentPage.linesOnPage++;
        });
        
        // 主题标题后增加间距
        currentPage.currentY += 20;
        
        // 处理该主题下的所有子项目
        currentItemIndex = 0;
        while (currentItemIndex < topic.items.length) {
          const text = topic.items[currentItemIndex];
          
          // 正常字体绘制子项目
          currentPage.ctx.font = '45px sans-serif';
          
          const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
          
          // 检查当前页是否还能容纳这段文字
          const totalLinesNeeded = lines.length;
          const willExceedLimit = currentPage.currentY + (totalLinesNeeded * 60) + 10 > 1650;

          if (willExceedLimit) {
            pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
            currentPage = createNewPage();
            
            // 重要：确保新页面上使用子项目的正确字体样式
            currentPage.ctx.font = '45px sans-serif';
            currentPage.ctx.fillStyle = '#FFFFFF';
            currentPage.ctx.textAlign = 'left';
          }

          // 绘制子项目文本
          lines.forEach((line, index) => {
            if (index === 0) {
              currentPage.ctx.fillText(
                `${lineNumber}. ${line}`,
                80,
                currentPage.currentY
              );
              lineNumber++;
            } else {
              currentPage.ctx.fillText(
                line,
                80,
                currentPage.currentY
              );
            }
            currentPage.currentY += 60;
            currentPage.linesOnPage++;
          });

          currentPage.currentY += 10; // 段落间距
          currentItemIndex++;
        }
        
        // 主题之间增加额外间距
        currentPage.currentY += 30;
        currentTopicIndex++;
      }
    } else {
      // 普通模式：处理扁平化的内容
      let currentTextIndex = 0;
      while (currentTextIndex < processedContent.length) {
        const text = processedContent[currentTextIndex];
        const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
        
        // 检查当前页是否还能容纳这段文字
        const totalLinesNeeded = lines.length;
        const willExceedLimit = currentPage.linesOnPage + totalLinesNeeded > 27;

        if (willExceedLimit) {
          pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
          currentPage = createNewPage();
          
          // 重要：确保新页面上使用子项目的正确字体样式
          currentPage.ctx.font = '45px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
        }

        // 绘制文本
        currentPage.ctx.font = '45px sans-serif';
        currentPage.ctx.fillStyle = '#FFFFFF';
        currentPage.ctx.textAlign = 'left';

        lines.forEach((line, index) => {
          if (index === 0) {
            currentPage.ctx.fillText(
              `${lineNumber}. ${line}`,
              80,
              currentPage.currentY
            );
            lineNumber++;
          } else {
            currentPage.ctx.fillText(
              line,
              80,
              currentPage.currentY
            );
          }
          currentPage.currentY += 60;
          currentPage.linesOnPage++;
        });

        currentPage.currentY += 10; // 段落间距
        currentTextIndex++;
      }
    }

    // 添加最后一页
    if (currentPage && currentPage.linesOnPage > 0) {
      pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
    }

    return pages;
  }

  static wrapText(ctx, text, fontSize, maxWidth) {
    ctx.font = `${fontSize}px sans-serif`;
    
    // 先尝试简单测量，看是否整个文本能直接显示在一行
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) {
      return [text]; // 如果整个文本适合一行，直接返回
    }
    
    // 简化标点符号列表，只使用ASCII字符
    const noLeadingPunctuation = [
      ',', '.', '!', '?', ';', ':', ')', ']', '}', '"', "'"
    ];
    
    const noTrailingPunctuation = [
      '(', '[', '{', '"', "'"
    ];
    
    const chars = text.split('');
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const nextChar = i < chars.length - 1 ? chars[i + 1] : null;
      
      // 测试添加当前字符后的宽度
      const testLine = currentLine + char;
      const testMetrics = ctx.measureText(testLine);
      
      // 如果当前字符是不应该在行尾的标点，并且下一个字符存在
      if (noTrailingPunctuation.includes(char) && nextChar) {
        // 测试添加当前字符和下一个字符后的宽度
        const testWithNextChar = testLine + nextChar;
        const nextMetrics = ctx.measureText(testWithNextChar);
        
        // 如果加上下一个字符也不会超出宽度，尝试将下一个字符也加入
        if (nextMetrics.width <= maxWidth) {
          currentLine = testLine;
          continue;
        }
      }
      
      // 如果下一个字符是不应该在行首的标点
      if (nextChar && noLeadingPunctuation.includes(nextChar)) {
        // 测试添加当前字符和下一个字符后的宽度
        const testWithNextChar = testLine + nextChar;
        const nextMetrics = ctx.measureText(testWithNextChar);
        
        // 如果加上下一个字符不会超出宽度太多，尝试将下一个字符也加入
        if (nextMetrics.width <= maxWidth * 1.05) { // 允许宽度有5%的宽容度
          currentLine = testLine;
          continue;
        }
      }
      
      // 如果添加当前字符后会超出宽度
      if (testMetrics.width > maxWidth) {
        // 如果当前行非空，则换行
        if (currentLine) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          // 如果当前行为空，说明单个字符就超出了最大宽度
          lines.push(char);
          currentLine = '';
        }
      } else {
        // 如果不超出宽度，直接添加字符
        currentLine = testLine;
      }
    }
    
    // 处理最后一行
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  static shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  static async canvasToBlob(canvas, imageFormat = 'png') {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, `image/${imageFormat}`, imageFormat === 'jpeg' ? 0.9 : undefined);
    });
  }

  // 严谨模式：生成内页，每页使用不同的背景图
  static async generateContentPagesStrict(backgroundImages, startIndex, textContent, titleConfig, imageFormat = 'png', topicMode = false) {
    // 检查是否是结构化的主题数据
    const isStructuredData = Array.isArray(textContent) && textContent.length > 0 && 
                             typeof textContent[0] === 'object' && textContent[0].topic && 
                             Array.isArray(textContent[0].items);
    
    let processedContent;
    
    if (isStructuredData && topicMode) {
      console.log("严谨模式: 使用主题模式处理内容");
      console.log("严谨模式-原始主题数据:", textContent.map(t => ({ topic: t.topic, itemCount: t.items.length })));
      // 结构化数据处理：随机打乱主题顺序，并在每个主题内部随机打乱子项目
      processedContent = [...textContent]; // 复制原始结构
      
      // 1. 随机打乱主题顺序
      processedContent = this.shuffleArray(processedContent);
      
      // 2. 对每个主题内的子项目随机打乱
      processedContent.forEach(topic => {
        topic.items = this.shuffleArray([...topic.items]);
      });
      
      console.log("严谨模式-主题处理完成，主题顺序和子项目顺序已随机打乱");
      console.log("严谨模式-处理后主题数据:", processedContent.map(t => ({ topic: t.topic, itemCount: t.items.length })));
    } else {
      // 普通模式：直接随机打乱所有内容
      if (isStructuredData) {
        // 结构化数据，但未启用主题模式，将其扁平化处理
        console.log("严谨模式-未启用主题模式，将结构化数据扁平化处理");
        const flatContent = [];
        textContent.forEach(topic => {
          topic.items.forEach(item => {
            flatContent.push(item);
          });
        });
        console.log(`严谨模式-扁平化后共有 ${flatContent.length} 个项目`);
        processedContent = this.shuffleArray([...flatContent]);
      } else {
        // 普通数组数据，直接打乱
        console.log(`严谨模式-普通数组数据，共有 ${textContent.length} 个项目`);
        processedContent = this.shuffleArray([...textContent]);
      }
    }
    
    const pages = [];
    let currentPage = null;
    let lineNumber = 1;
    let currentTopicIndex = 0;
    let currentItemIndex = 0;
    let currentBackgroundIndex = startIndex;
    let currentTextIndex = 0; // 添加缺失的文本索引变量
    let shuffledContent = processedContent; // 确保正确初始化shuffledContent变量

    // 创建新页面
    const createNewPage = async () => {
      // 检查是否还有足够的背景图
      if (currentBackgroundIndex >= backgroundImages.length) {
        throw new Error('内页素材不够');
      }
      
      // 获取当前背景图并处理
      const backgroundCanvas = await this.processBackgroundImage(backgroundImages[currentBackgroundIndex]);
      currentBackgroundIndex++;
      console.log(`严谨模式-创建新页面，使用背景图索引: ${currentBackgroundIndex-1}`);

      const canvas = document.createElement('canvas');
      canvas.width = 1242;
      canvas.height = 1660;
      const ctx = canvas.getContext('2d');

      // 复制背景
      ctx.drawImage(backgroundCanvas, 0, 0);

      // 设置标题字体以计算高度
      ctx.font = '80px sans-serif';
      const titleMetrics = ctx.measureText(titleConfig.text);
      const titleHeight = titleMetrics.actualBoundingBoxAscent + titleMetrics.actualBoundingBoxDescent;
      const titleBackgroundHeight = titleHeight * 1.2;
      const titleWidth = titleMetrics.width * 1.2;

      // 计算标题背景位置
      const titleBackgroundX = (canvas.width - titleWidth) / 2;
      const cornerRadius = 10;

      // 使用配置的背景色
      ctx.fillStyle = titleConfig.backgroundColor;
      ctx.beginPath();
      ctx.moveTo(titleBackgroundX + cornerRadius, 80);
      ctx.lineTo(titleBackgroundX + titleWidth - cornerRadius, 80);
      ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80, titleBackgroundX + titleWidth, 80 + cornerRadius);
      ctx.lineTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight - cornerRadius);
      ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight, titleBackgroundX + titleWidth - cornerRadius, 80 + titleBackgroundHeight);
      ctx.lineTo(titleBackgroundX + cornerRadius, 80 + titleBackgroundHeight);
      ctx.quadraticCurveTo(titleBackgroundX, 80 + titleBackgroundHeight, titleBackgroundX, 80 + titleBackgroundHeight - cornerRadius);
      ctx.lineTo(titleBackgroundX, 80 + cornerRadius);
      ctx.quadraticCurveTo(titleBackgroundX, 80, titleBackgroundX + cornerRadius, 80);
      ctx.closePath();
      ctx.fill();

      // 绘制标题文字
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(titleConfig.text, canvas.width / 2, 80 + titleHeight);

      return {
        canvas,
        ctx,
        currentY: 80 + titleBackgroundHeight + 100,
        linesOnPage: 0
      };
    };

    // 初始化第一页
    currentPage = await createNewPage();

    if (isStructuredData && topicMode) {
      // 主题模式处理
      console.log("严谨模式-使用主题模式处理内容进行绘制");
      while (currentTopicIndex < processedContent.length) {
        const topic = processedContent[currentTopicIndex];
        console.log(`严谨模式-处理主题 ${currentTopicIndex + 1}/${processedContent.length}: ${topic.topic}`);
        
        // 绘制主题标题
        currentPage.ctx.font = 'bold 55px sans-serif';
        currentPage.ctx.fillStyle = '#FFFFFF';
        currentPage.ctx.textAlign = 'left';
        
        // 计算绘制主题需要的空间
        const topicText = topic.topic;
        const topicLines = this.wrapText(currentPage.ctx, topicText, 55, 1082);
        
        // 检查页面剩余空间
        const topicHeight = topicLines.length * 60 + 20; // 主题高度 + 额外间距
        if (currentPage.currentY + topicHeight > 1650) {
          // 当前页空间不足，创建新页
          console.log(`严谨模式-当前页面无法容纳主题标题，创建新页面`);
          pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
          currentPage = await createNewPage();
          
          // 在新页面上重新设置主题字体样式
          currentPage.ctx.font = 'bold 55px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
        }
        
        // 绘制主题标题（添加emoji✅，加粗，并添加下划线）
        topicLines.forEach((line, index) => {
          // 绘制文本（加前缀emoji）
          const textToDraw = index === 0 ? `✅ ${line}` : line;
          currentPage.ctx.fillText(
            textToDraw,
            80,
            currentPage.currentY
          );
          
          // 绘制下划线
          const textWidth = currentPage.ctx.measureText(textToDraw).width;
          const underlineY = currentPage.currentY + 5; // 下划线位置在文本下方5px
          currentPage.ctx.beginPath();
          currentPage.ctx.moveTo(80, underlineY);
          currentPage.ctx.lineTo(80 + textWidth, underlineY);
          currentPage.ctx.lineWidth = 2;
          currentPage.ctx.strokeStyle = '#FFFFFF';
          currentPage.ctx.stroke();
          
          currentPage.currentY += 60;
          currentPage.linesOnPage++;
        });
        
        // 主题标题后增加间距
        currentPage.currentY += 20;
        
        // 处理该主题下的所有子项目
        currentItemIndex = 0;
        let isProcessingItems = true; // 标记是否正在处理子项目
        
        while (currentItemIndex < topic.items.length) {
          const text = topic.items[currentItemIndex];
          console.log(`严谨模式-处理主题 "${topic.topic}" 中的项目 ${currentItemIndex + 1}/${topic.items.length}: ${text.slice(0, 20)}...`);
          
          // 正常字体绘制子项目
          currentPage.ctx.font = '45px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
          
          const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
          console.log(`严谨模式-文本被分割为 ${lines.length} 行`);
          
          // 检查当前页是否还能容纳这段文字
          const totalLinesNeeded = lines.length;
          const willExceedLimit = currentPage.currentY + (totalLinesNeeded * 60) + 10 > 1650;

          if (willExceedLimit) {
            console.log(`严谨模式-当前页面已满，创建新页面`);
            pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
            currentPage = await createNewPage();
            
            // 确保新页面上使用子项目的字体样式，而不是主题样式
            currentPage.ctx.font = '45px sans-serif';
            currentPage.ctx.fillStyle = '#FFFFFF';
            currentPage.ctx.textAlign = 'left';
          }

          // 绘制子项目文本
          lines.forEach((line, index) => {
            if (index === 0) {
              currentPage.ctx.fillText(
                `${lineNumber}. ${line}`,
                80,
                currentPage.currentY
              );
              lineNumber++;
            } else {
              currentPage.ctx.fillText(
                line,
                80,
                currentPage.currentY
              );
            }
            currentPage.currentY += 60;
            currentPage.linesOnPage++;
          });

          currentPage.currentY += 10; // 段落间距
          currentItemIndex++;
        }
        
        // 主题之间增加额外间距
        currentPage.currentY += 30;
        currentTopicIndex++;
      }
    } else {
      // 普通模式：处理扁平化的内容
      console.log(`严谨模式-使用普通模式处理内容进行绘制，共 ${shuffledContent.length} 个项目`);
      while (currentTextIndex < shuffledContent.length) {
        const text = shuffledContent[currentTextIndex];
        console.log(`严谨模式-处理文本索引 ${currentTextIndex}, 内容: ${text.slice(0, 20)}...`);
        const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
        console.log(`严谨模式-文本被分割为 ${lines.length} 行`);
        
        // 检查当前页是否还能容纳这段文字
        const totalLinesNeeded = lines.length;
        const willExceedLimit = currentPage.linesOnPage + totalLinesNeeded > 27;

        if (willExceedLimit) {
          console.log(`严谨模式-当前页面已满，当前行数: ${currentPage.linesOnPage}，需要行数: ${totalLinesNeeded}，创建新页面`);
          pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
          currentPage = await createNewPage();
        }

        // 绘制文本
        currentPage.ctx.font = '45px sans-serif'; // 字号改为45px
        currentPage.ctx.fillStyle = '#FFFFFF';
        currentPage.ctx.textAlign = 'left';

        lines.forEach((line, index) => {
          if (index === 0) {
            currentPage.ctx.fillText(
              `${lineNumber}. ${line}`,
              80, // 左边距改为80px
              currentPage.currentY
            );
            lineNumber++;
          } else {
            currentPage.ctx.fillText(
              line,
              80, // 左边距改为80px
              currentPage.currentY
            );
          }
          currentPage.currentY += 60; // 行间距改为60px
          currentPage.linesOnPage++;
        });

        currentPage.currentY += 10; // 段落间距保持不变
        currentTextIndex++;
      }
    }

    // 添加最后一页
    if (currentPage && currentPage.linesOnPage > 0) {
      console.log(`严谨模式-添加最后一页，行数: ${currentPage.linesOnPage}`);
      pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
    }

    console.log(`严谨模式-内页生成完成，共 ${pages.length} 页`);
    return pages;
  }

  // 添加新的谨慎模式函数（切割模式）：基于严谨模式，但只有第一页显示标题
  static async generateContentPagesCautious(backgroundImages, startIndex, textContent, titleConfig, imageFormat = 'png', topicMode = false) {
    // 检查是否是结构化的主题数据
    const isStructuredData = Array.isArray(textContent) && textContent.length > 0 && 
                             typeof textContent[0] === 'object' && textContent[0].topic && 
                             Array.isArray(textContent[0].items);
    
    let processedContent;
    let currentProcessingState = 'none'; // 'none', 'topic', 'item' - 标记当前处理的是主题还是子项目
    
    if (isStructuredData && topicMode) {
      console.log("谨慎模式: 使用主题模式处理内容");
      console.log("谨慎模式-原始主题数据:", textContent.map(t => ({ topic: t.topic, itemCount: t.items.length })));
      // 结构化数据处理：随机打乱主题顺序，并在每个主题内部随机打乱子项目
      processedContent = [...textContent]; // 复制原始结构
      
      // 1. 随机打乱主题顺序
      processedContent = this.shuffleArray(processedContent);
      
      // 2. 对每个主题内的子项目随机打乱
      processedContent.forEach(topic => {
        topic.items = this.shuffleArray([...topic.items]);
      });
      
      console.log("谨慎模式-主题处理完成，主题顺序和子项目顺序已随机打乱");
      console.log("谨慎模式-处理后主题数据:", processedContent.map(t => ({ topic: t.topic, itemCount: t.items.length })));
    } else {
      // 普通模式：直接随机打乱所有内容
      if (isStructuredData) {
        // 结构化数据，但未启用主题模式，将其扁平化处理
        console.log("谨慎模式-未启用主题模式，将结构化数据扁平化处理");
        const flatContent = [];
        textContent.forEach(topic => {
          topic.items.forEach(item => {
            flatContent.push(item);
          });
        });
        console.log(`谨慎模式-扁平化后共有 ${flatContent.length} 个项目`);
        processedContent = this.shuffleArray([...flatContent]);
      } else {
        // 普通数组数据，直接打乱
        console.log(`谨慎模式-普通数组数据，共有 ${textContent.length} 个项目`);
        processedContent = this.shuffleArray([...textContent]);
      }
    }
    
    const pages = [];
    let currentPage = null;
    let lineNumber = 1;
    let currentTextIndex = 0;
    let currentTopicIndex = 0; // 添加主题索引变量
    let currentItemIndex = 0;  // 添加项目索引变量
    let currentBackgroundIndex = startIndex;
    let isFirstPage = true;
    
    // 计算文本会占用的高度
    const calculateTextHeight = (ctx, text, fontSize, maxWidth) => {
      const lines = this.wrapText(ctx, text, fontSize, maxWidth);
      // 每行高度为60px，段落间距10px
      return lines.length * 60 + 10; 
    };

    // 创建新页面
    const createNewPage = async () => {
      // 检查是否还有足够的背景图
      if (currentBackgroundIndex >= backgroundImages.length) {
        throw new Error('内页素材不够');
      }
      
      // 获取当前背景图并处理
      const backgroundCanvas = await this.processBackgroundImage(backgroundImages[currentBackgroundIndex]);
      currentBackgroundIndex++;
      console.log(`谨慎模式-创建新页面，使用背景图索引: ${currentBackgroundIndex-1}, 是否为首页: ${isFirstPage}, 当前处理状态: ${currentProcessingState}`);

      const canvas = document.createElement('canvas');
      canvas.width = 1242;
      canvas.height = 1660;
      const ctx = canvas.getContext('2d');

      // 复制背景
      ctx.drawImage(backgroundCanvas, 0, 0);

      // 只在第一页显示标题
      if (isFirstPage) {
        // 设置标题字体以计算高度
        ctx.font = '80px sans-serif';
        const titleMetrics = ctx.measureText(titleConfig.text);
        const titleHeight = titleMetrics.actualBoundingBoxAscent + titleMetrics.actualBoundingBoxDescent;
        const titleBackgroundHeight = titleHeight * 1.2;
        const titleWidth = titleMetrics.width * 1.2;

        // 计算标题背景位置
        const titleBackgroundX = (canvas.width - titleWidth) / 2;
        const cornerRadius = 10;

        // 使用配置的背景色
        ctx.fillStyle = titleConfig.backgroundColor;
        ctx.beginPath();
        ctx.moveTo(titleBackgroundX + cornerRadius, 80);
        ctx.lineTo(titleBackgroundX + titleWidth - cornerRadius, 80);
        ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80, titleBackgroundX + titleWidth, 80 + cornerRadius);
        ctx.lineTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight - cornerRadius);
        ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight, titleBackgroundX + titleWidth - cornerRadius, 80 + titleBackgroundHeight);
        ctx.lineTo(titleBackgroundX + cornerRadius, 80 + titleBackgroundHeight);
        ctx.quadraticCurveTo(titleBackgroundX, 80 + titleBackgroundHeight, titleBackgroundX, 80 + titleBackgroundHeight - cornerRadius);
        ctx.lineTo(titleBackgroundX, 80 + cornerRadius);
        ctx.quadraticCurveTo(titleBackgroundX, 80, titleBackgroundX + cornerRadius, 80);
        ctx.closePath();
        ctx.fill();

        // 绘制标题文字
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(titleConfig.text, canvas.width / 2, 80 + titleHeight);

        return {
          canvas,
          ctx,
          currentY: 80 + titleBackgroundHeight + 100,
          contentStartY: 80 + titleBackgroundHeight + 100,
          linesOnPage: 0
        };
      } else {
        // 非第一页，不显示标题
        const topMargin = 80; // 保持与第一页相同的上边距
        
        // 根据当前处理状态设置正确的字体样式
        if (currentProcessingState === 'topic') {
          ctx.font = 'bold 55px sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          console.log(`谨慎模式-新页面设置主题样式`);
        } else if (currentProcessingState === 'item') {
          ctx.font = '45px sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          console.log(`谨慎模式-新页面设置子项目样式`);
        }
        
        return {
          canvas,
          ctx,
          currentY: topMargin + 80, // 增加非第一页的顶部边距，给予更多空白
          contentStartY: topMargin + 80,
          linesOnPage: 0
        };
      }
    };

    // 初始化第一页
    currentPage = await createNewPage();

    // 根据处理模式处理内容
    if (isStructuredData && topicMode) {
      // 主题模式处理
      console.log("谨慎模式-使用主题模式处理内容进行绘制");
      
      while (currentTopicIndex < processedContent.length) {
        const topic = processedContent[currentTopicIndex];
        console.log(`谨慎模式-处理主题 ${currentTopicIndex + 1}/${processedContent.length}: ${topic.topic}`);
        
        // 设置当前处理状态为主题
        currentProcessingState = 'topic';
        
        // 绘制主题标题
        currentPage.ctx.font = 'bold 55px sans-serif';
        currentPage.ctx.fillStyle = '#FFFFFF';
        currentPage.ctx.textAlign = 'left';
        
        // 计算绘制主题需要的空间
        const topicText = topic.topic;
        const topicLines = this.wrapText(currentPage.ctx, topicText, 55, 1082);
        console.log(`谨慎模式-主题标题分为 ${topicLines.length} 行`);
        
        // 检查页面剩余空间
        const topicHeight = topicLines.length * 60 + 20; // 主题高度 + 额外间距
        if (currentPage.currentY + topicHeight > 1650) {
          // 当前页空间不足，创建新页
          console.log(`谨慎模式-当前页面无法容纳主题标题，创建新页面`);
          pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
          isFirstPage = false;
          currentPage = await createNewPage();
          
          // 在新页面上重新设置主题字体样式
          currentPage.ctx.font = 'bold 55px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
        }
        
        // 绘制主题标题（添加emoji✅，加粗，并添加下划线）
        topicLines.forEach((line, index) => {
          // 绘制文本（加前缀emoji）
          const textToDraw = index === 0 ? `✅ ${line}` : line;
          currentPage.ctx.fillText(
            textToDraw,
            80,
            currentPage.currentY
          );
          
          // 绘制下划线
          const textWidth = currentPage.ctx.measureText(textToDraw).width;
          const underlineY = currentPage.currentY + 5; // 下划线位置在文本下方5px
          currentPage.ctx.beginPath();
          currentPage.ctx.moveTo(80, underlineY);
          currentPage.ctx.lineTo(80 + textWidth, underlineY);
          currentPage.ctx.lineWidth = 2;
          currentPage.ctx.strokeStyle = '#FFFFFF';
          currentPage.ctx.stroke();
          
          currentPage.currentY += 60;
          currentPage.linesOnPage++;
        });
        
        // 主题标题后增加间距
        currentPage.currentY += 20;
        
        // 处理该主题下的所有子项目
        currentItemIndex = 0;
        
        // 设置当前处理状态为子项目
        currentProcessingState = 'item';
        
        while (currentItemIndex < topic.items.length) {
          const text = topic.items[currentItemIndex];
          console.log(`谨慎模式-处理主题 "${topic.topic}" 中的项目 ${currentItemIndex + 1}/${topic.items.length}: ${text.slice(0, 20)}...`);
          
          // 每次处理子项目前设置正确样式
          currentPage.ctx.font = '45px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
          
          const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
          console.log(`谨慎模式-子项目文本被分割为 ${lines.length} 行`);
          
          // 检查当前页是否还能容纳这段文字
          const totalLinesNeeded = lines.length;
          const willExceedLimit = currentPage.currentY + (totalLinesNeeded * 60) + 10 > 1650;

          if (willExceedLimit) {
            console.log(`谨慎模式-当前页面已满，创建新页面 (处理子项目中)`);
            pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
            isFirstPage = false;
            currentPage = await createNewPage();
            
            // 确保新页面上使用子项目的字体样式
            currentPage.ctx.font = '45px sans-serif';
            currentPage.ctx.fillStyle = '#FFFFFF';
            currentPage.ctx.textAlign = 'left';
          }

          // 绘制子项目文本
          lines.forEach((line, index) => {
            if (index === 0) {
              currentPage.ctx.fillText(
                `${lineNumber}. ${line}`,
                80,
                currentPage.currentY
              );
              lineNumber++;
            } else {
              currentPage.ctx.fillText(
                line,
                80,
                currentPage.currentY
              );
            }
            currentPage.currentY += 60;
            currentPage.linesOnPage++;
          });

          currentPage.currentY += 10; // 段落间距
          currentItemIndex++;
        }
        
        // 主题之间增加额外间距
        currentPage.currentY += 30;
        currentTopicIndex++;
      }
    } else {
      // 普通模式：处理扁平化的内容
      currentProcessingState = 'none';
      console.log(`谨慎模式-使用普通模式处理内容进行绘制，共 ${processedContent.length} 个项目`);
      
      // 计算文本会占用的高度
      const calculateTextHeight = (ctx, text, fontSize, maxWidth) => {
        const lines = this.wrapText(ctx, text, fontSize, maxWidth);
        // 每行高度为60px，段落间距10px
        return lines.length * 60 + 10; 
      };
      
      while (currentTextIndex < processedContent.length) {
        const text = processedContent[currentTextIndex];
        console.log(`谨慎模式-处理文本索引 ${currentTextIndex}, 内容: ${text.slice(0, 20)}...`);
        
        // 确保使用正确的字体样式
        currentPage.ctx.font = '45px sans-serif';
        currentPage.ctx.fillStyle = '#FFFFFF';
        currentPage.ctx.textAlign = 'left';
        
        // 计算当前文本需要的高度
        const textHeight = calculateTextHeight(currentPage.ctx, text, 45, 1082);
        
        // 判断是否可以完整显示当前文本
        if (currentPage.currentY + textHeight > 1650) {
          console.log(`谨慎模式-当前页面不足以容纳文本，当前Y: ${currentPage.currentY}，需要高度: ${textHeight}，创建新页面`);
          pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
          isFirstPage = false;
          currentPage = await createNewPage();
          
          // 确保新页面上使用正确的字体样式
          currentPage.ctx.font = '45px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
        }
        
        // 绘制文本
        const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
        console.log(`谨慎模式-文本被分割为 ${lines.length} 行`);

        lines.forEach((line, index) => {
          if (index === 0) {
            currentPage.ctx.fillText(
              `${lineNumber}. ${line}`,
              80,
              currentPage.currentY
            );
            lineNumber++;
          } else {
            currentPage.ctx.fillText(
              line,
              80,
              currentPage.currentY
            );
          }
          currentPage.currentY += 60;
          currentPage.linesOnPage++;
        });

        currentPage.currentY += 10; // 段落间距
        currentTextIndex++;
      }
    }

    // 添加最后一页
    if (currentPage && currentPage.linesOnPage > 0) {
      console.log(`谨慎模式-添加最后一页，行数: ${currentPage.linesOnPage}`);
      pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
    }

    console.log(`谨慎模式-内页生成完成，共 ${pages.length} 页`);
    return pages;
  }

  // 解析知识Excel文件：A列为标题，B列为内容
  static async parseKnowledgeExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = readXLSX(e.target.result, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const data = [];
          let i = 1;
          
          // 读取A列和B列
          while (firstSheet[`A${i}`] && firstSheet[`B${i}`]) {
            data.push({
              title: firstSheet[`A${i}`].v,
              content: firstSheet[`B${i}`].v
            });
            i++;
          }
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }
  
  // 生成知识图片
  static async generateKnowledgeImage(title, content, imageFormat = 'png') {
    return new Promise(async (resolve) => {
      // 创建画布
      const canvas = document.createElement('canvas');
      canvas.width = 1242;
      canvas.height = 1660;
      const ctx = canvas.getContext('2d');

      // 绘制背景
      ctx.fillStyle = '#f0f2f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制白色卡片区域（带圆角）
      const cardX = 60;
      const cardY = 80;
      const cardWidth = canvas.width - 120;
      const cardHeight = canvas.height - 160;
      this.drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 20, '#FFFFFF');

      // 绘制装饰元素（四角）
      const decorSize = 30;
      // 左上角
      ctx.fillStyle = '#1890ff';
      ctx.fillRect(cardX + 20, cardY + 20, decorSize, 6);
      ctx.fillRect(cardX + 20, cardY + 20, 6, decorSize);
      // 右上角
      ctx.fillRect(cardX + cardWidth - 20 - decorSize, cardY + 20, decorSize, 6);
      ctx.fillRect(cardX + cardWidth - 20 - 6, cardY + 20, 6, decorSize);
      // 左下角
      ctx.fillRect(cardX + 20, cardY + cardHeight - 20 - 6, decorSize, 6);
      ctx.fillRect(cardX + 20, cardY + cardHeight - 20 - decorSize, 6, decorSize);
      // 右下角
      ctx.fillRect(cardX + cardWidth - 20 - decorSize, cardY + cardHeight - 20 - 6, decorSize, 6);
      ctx.fillRect(cardX + cardWidth - 20 - 6, cardY + cardHeight - 20 - decorSize, 6, decorSize);

      // 绘制标题
      ctx.font = 'bold 60px sans-serif';
      ctx.fillStyle = '#303133';
      ctx.textAlign = 'center';
      
      // 标题文本换行
      const titleLines = this.wrapText(ctx, title, 60, cardWidth - 100);
      let titleY = cardY + 100;
      
      titleLines.forEach(line => {
        ctx.fillText(line, canvas.width / 2, titleY);
        titleY += 80;
      });
      
      // 绘制分隔线
      const lineY = titleY + 40;
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cardX + 100, lineY);
      ctx.lineTo(cardX + cardWidth - 100, lineY);
      ctx.stroke();
      
      // 绘制内容
      ctx.font = '40px sans-serif';
      ctx.fillStyle = '#606266';
      ctx.textAlign = 'left';
      
      // 处理内容文本，保持原始换行
      const contentParagraphs = content.split('\n');
      let contentY = lineY + 80;
      
      contentParagraphs.forEach(paragraph => {
        if (paragraph.trim() === '') {
          contentY += 40; // 空行给予更少的间距
          return;
        }
        
        const lines = this.wrapText(ctx, paragraph, 40, cardWidth - 120);
        
        lines.forEach(line => {
          ctx.fillText(line, cardX + 60, contentY);
          contentY += 60;
        });
        
        contentY += 20; // 段落间距
      });

      // 转换为Blob
      const blob = await this.canvasToBlob(canvas, imageFormat);
      resolve(blob);
    });
  }

  // 辅助函数：绘制圆角矩形
  static drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }
  
  // 切割背景图片为多个部分
  static async sliceBackgroundImage(backgroundImage, sliceCount) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // 确定网格布局（行和列）
        let rows, cols;
        
        // 根据图片的原始比例和切割数量确定最佳的行列数
        const aspectRatio = img.width / img.height;
        
        if (sliceCount === 4) {
          // 2x2网格
          rows = 2;
          cols = 2;
        } else if (sliceCount === 6) {
          // 根据图片比例决定是2x3还是3x2
          if (aspectRatio >= 1) {
            // 宽图：3x2
            rows = 2;
            cols = 3;
          } else {
            // 高图：2x3
            rows = 3;
            cols = 2;
          }
        } else if (sliceCount === 8) {
          // 根据图片比例决定是2x4还是4x2
          if (aspectRatio >= 1) {
            // 宽图：4x2
            rows = 2;
            cols = 4;
          } else {
            // 高图：2x4
            rows = 4;
            cols = 2;
          }
        } else if (sliceCount === 10) {
          // 根据图片比例决定是2x5还是5x2
          if (aspectRatio >= 1) {
            // 宽图：5x2
            rows = 2;
            cols = 5;
          } else {
            // 高图：2x5
            rows = 5;
            cols = 2;
          }
        } else if (sliceCount === 12) {
          // 根据图片比例决定是3x4还是4x3
          if (aspectRatio >= 1) {
            // 宽图：4x3
            rows = 3;
            cols = 4;
          } else {
            // 高图：3x4
            rows = 4;
            cols = 3;
          }
        } else if (sliceCount === 14) {
          // 根据图片比例决定是2x7还是7x2
          if (aspectRatio >= 1) {
            // 宽图：7x2
            rows = 2;
            cols = 7;
          } else {
            // 高图：2x7
            rows = 7;
            cols = 2;
          }
        } else if (sliceCount === 16) {
          // 4x4网格
          rows = 4;
          cols = 4;
        } else {
          // 默认情况：尝试找到最接近的因子
          let bestDiff = Number.MAX_VALUE;
          for (let r = 1; r <= sliceCount; r++) {
            if (sliceCount % r === 0) {
              const c = sliceCount / r;
              const diff = Math.abs(aspectRatio - c / r);
              if (diff < bestDiff) {
                bestDiff = diff;
                rows = r;
                cols = c;
              }
            }
          }
        }
        
        // 计算每个切片的尺寸
        const sliceWidth = img.width / cols;
        const sliceHeight = img.height / rows;
        
        // 创建切片
        const slices = [];
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            // 为每个切片创建一个Canvas
            const canvas = document.createElement('canvas');
            canvas.width = 1242;  // 保持目标尺寸一致
            canvas.height = 1660;
            const ctx = canvas.getContext('2d');
            
            // 绘制黑色背景
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // 计算源图像的切片区域
            const sx = col * sliceWidth;
            const sy = row * sliceHeight;
            const sWidth = sliceWidth;
            const sHeight = sliceHeight;
            
            // 计算缩放比例，使切片填满目标画布
            const scale = Math.max(canvas.width / sWidth, canvas.height / sHeight);
            const scaledWidth = sWidth * scale;
            const scaledHeight = sHeight * scale;
            
            // 计算绘制位置，使切片居中
            const dx = (canvas.width - scaledWidth) / 2;
            const dy = (canvas.height - scaledHeight) / 2;
            
            // 设置透明度
            ctx.globalAlpha = 0.35;
            
            // 绘制切片
            ctx.drawImage(
              img,
              sx, sy, sWidth, sHeight,  // 源图像区域
              dx, dy, scaledWidth, scaledHeight  // 目标画布区域
            );
            
            slices.push(canvas);
          }
        }
        
        resolve(slices);
      };
      img.src = URL.createObjectURL(backgroundImage);
    });
  }

  static async generateContentPagesStrictWithProcessedBackgrounds(processedBackgrounds, startIndex, textContent, titleConfig, imageFormat = 'png') {
    // 随机打乱文字内容
    const shuffledContent = this.shuffleArray([...textContent]);
    const pages = [];
    let currentPage = null;
    let lineNumber = 1;
    let currentTextIndex = 0;
    let currentBackgroundIndex = startIndex;

    // 创建新页面
    const createNewPage = async () => {
      // 检查是否还有足够的背景图
      if (currentBackgroundIndex >= processedBackgrounds.length) {
        throw new Error('内页素材不够');
      }
      
      // 获取当前背景Canvas
      const backgroundCanvas = processedBackgrounds[currentBackgroundIndex];
      currentBackgroundIndex++;

      const canvas = document.createElement('canvas');
      canvas.width = 1242;
      canvas.height = 1660;
      const ctx = canvas.getContext('2d');

      // 复制背景
      ctx.drawImage(backgroundCanvas, 0, 0);

      // 设置标题字体以计算高度
      ctx.font = '80px sans-serif';
      const titleMetrics = ctx.measureText(titleConfig.text);
      const titleHeight = titleMetrics.actualBoundingBoxAscent + titleMetrics.actualBoundingBoxDescent;
      const titleBackgroundHeight = titleHeight * 1.2;
      const titleWidth = titleMetrics.width * 1.2;

      // 计算标题背景位置
      const titleBackgroundX = (canvas.width - titleWidth) / 2;
      const cornerRadius = 10;

      // 使用配置的背景色
      ctx.fillStyle = titleConfig.backgroundColor;
      ctx.beginPath();
      ctx.moveTo(titleBackgroundX + cornerRadius, 80);
      ctx.lineTo(titleBackgroundX + titleWidth - cornerRadius, 80);
      ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80, titleBackgroundX + titleWidth, 80 + cornerRadius);
      ctx.lineTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight - cornerRadius);
      ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight, titleBackgroundX + titleWidth - cornerRadius, 80 + titleBackgroundHeight);
      ctx.lineTo(titleBackgroundX + cornerRadius, 80 + titleBackgroundHeight);
      ctx.quadraticCurveTo(titleBackgroundX, 80 + titleBackgroundHeight, titleBackgroundX, 80 + titleBackgroundHeight - cornerRadius);
      ctx.lineTo(titleBackgroundX, 80 + cornerRadius);
      ctx.quadraticCurveTo(titleBackgroundX, 80, titleBackgroundX + cornerRadius, 80);
      ctx.closePath();
      ctx.fill();

      // 绘制标题文字
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(titleConfig.text, canvas.width / 2, 80 + titleHeight);

      return {
        canvas,
        ctx,
        currentY: 80 + titleBackgroundHeight + 100,
        linesOnPage: 0
      };
    };

    // 初始化第一页
    currentPage = await createNewPage();

    while (currentTextIndex < shuffledContent.length) {
      const text = shuffledContent[currentTextIndex];
      const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
      
      // 检查当前页是否还能容纳这段文字
      const totalLinesNeeded = lines.length;
      const willExceedLimit = currentPage.linesOnPage + totalLinesNeeded > 27;

      if (willExceedLimit) {
        pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
        currentPage = await createNewPage();
      }

      // 绘制文本
      currentPage.ctx.font = '45px sans-serif'; // 字号改为45px
      currentPage.ctx.fillStyle = '#FFFFFF';
      currentPage.ctx.textAlign = 'left';

      lines.forEach((line, index) => {
        if (index === 0) {
          currentPage.ctx.fillText(
            `${lineNumber}. ${line}`,
            80, // 左边距改为80px
            currentPage.currentY
          );
          lineNumber++;
        } else {
          currentPage.ctx.fillText(
            line,
            80, // 左边距改为80px
            currentPage.currentY
          );
        }
        currentPage.currentY += 60; // 行间距改为60px
        currentPage.linesOnPage++;
      });

      currentPage.currentY += 10; // 段落间距保持不变
      currentTextIndex++;
    }

    // 添加最后一页
    if (currentPage && currentPage.linesOnPage > 0) {
      pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
    }

    return pages;
  }

  // 添加新的谨慎模式函数（切割模式）：基于严谨模式，但只有第一页显示标题
  static async generateContentPagesCautiousWithProcessedBackgrounds(processedBackgrounds, startIndex, textContent, titleConfig, imageFormat = 'png', topicMode = false) {
    // 基于谨慎模式的切片背景版本实现
    // 确保在主题模式下跨页时能正确保持字体样式
    const isStructuredData = Array.isArray(textContent) && textContent.length > 0 && 
                             typeof textContent[0] === 'object' && textContent[0].topic && 
                             Array.isArray(textContent[0].items);
    
    let processedContent;
    let processingSubItems = false; // 标记是否正在处理子项目
    let currentTopicIndex = 0;
    let inTopicProcessing = false; // 标记是否正在处理某个主题的内容
    let currentProcessingState = 'none'; // 'none', 'topic', 'item' - 标记当前处理的是主题还是子项目
    
    // 随机打乱文字内容
    if (isStructuredData && topicMode) {
      console.log("谨慎模式(切片背景): 使用主题模式处理内容");
      // 结构化数据处理：随机打乱主题顺序，并在每个主题内部随机打乱子项目
      processedContent = [...textContent]; // 复制原始结构
      
      // 1. 随机打乱主题顺序
      processedContent = this.shuffleArray(processedContent);
      
      // 2. 对每个主题内的子项目随机打乱
      processedContent.forEach(topic => {
        topic.items = this.shuffleArray([...topic.items]);
      });
      
      console.log("谨慎模式(切片背景): 主题处理完成，主题顺序和子项目顺序已随机打乱");
    } else {
      // 普通模式：直接随机打乱所有内容
      if (isStructuredData) {
        // 结构化数据，但未启用主题模式，将其扁平化处理
        console.log("谨慎模式(切片背景): 未启用主题模式，将结构化数据扁平化处理");
        const flatContent = [];
        textContent.forEach(topic => {
          topic.items.forEach(item => {
            flatContent.push(item);
          });
        });
        processedContent = this.shuffleArray([...flatContent]);
      } else {
        // 普通数组数据，直接打乱
        processedContent = this.shuffleArray([...textContent]);
      }
    }
    
    const pages = [];
    let currentPage = null;
    let lineNumber = 1;
    let currentTextIndex = 0;
    let currentItemIndex = 0;
    let currentBackgroundIndex = startIndex;
    let isFirstPage = true;
    
    // 创建新页面
    const createNewPage = async () => {
      // 检查是否还有足够的背景图
      if (currentBackgroundIndex >= processedBackgrounds.length) {
        throw new Error('内页素材不够');
      }
      
      // 获取当前背景Canvas
      const backgroundCanvas = processedBackgrounds[currentBackgroundIndex];
      currentBackgroundIndex++;
      console.log(`谨慎模式(切片背景)-创建新页面，使用背景索引: ${currentBackgroundIndex-1}, 是否为首页: ${isFirstPage}`);

      const canvas = document.createElement('canvas');
      canvas.width = 1242;
      canvas.height = 1660;
      const ctx = canvas.getContext('2d');

      // 复制背景
      ctx.drawImage(backgroundCanvas, 0, 0);

      // 只在第一页显示标题
      if (isFirstPage) {
        // 设置标题字体以计算高度
        ctx.font = '80px sans-serif';
        const titleMetrics = ctx.measureText(titleConfig.text);
        const titleHeight = titleMetrics.actualBoundingBoxAscent + titleMetrics.actualBoundingBoxDescent;
        const titleBackgroundHeight = titleHeight * 1.2;
        const titleWidth = titleMetrics.width * 1.2;

        // 计算标题背景位置
        const titleBackgroundX = (canvas.width - titleWidth) / 2;
        const cornerRadius = 10;

        // 使用配置的背景色
        ctx.fillStyle = titleConfig.backgroundColor;
        ctx.beginPath();
        ctx.moveTo(titleBackgroundX + cornerRadius, 80);
        ctx.lineTo(titleBackgroundX + titleWidth - cornerRadius, 80);
        ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80, titleBackgroundX + titleWidth, 80 + cornerRadius);
        ctx.lineTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight - cornerRadius);
        ctx.quadraticCurveTo(titleBackgroundX + titleWidth, 80 + titleBackgroundHeight, titleBackgroundX + titleWidth - cornerRadius, 80 + titleBackgroundHeight);
        ctx.lineTo(titleBackgroundX + cornerRadius, 80 + titleBackgroundHeight);
        ctx.quadraticCurveTo(titleBackgroundX, 80 + titleBackgroundHeight, titleBackgroundX, 80 + titleBackgroundHeight - cornerRadius);
        ctx.lineTo(titleBackgroundX, 80 + cornerRadius);
        ctx.quadraticCurveTo(titleBackgroundX, 80, titleBackgroundX + cornerRadius, 80);
        ctx.closePath();
        ctx.fill();

        // 绘制标题文字
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(titleConfig.text, canvas.width / 2, 80 + titleHeight);

        return {
          canvas,
          ctx,
          currentY: 80 + titleBackgroundHeight + 100,
          contentStartY: 80 + titleBackgroundHeight + 100,
          linesOnPage: 0
        };
      } else {
        // 非第一页，不显示标题
        const topMargin = 80; // 保持与第一页相同的上边距
        
        // 根据当前处理状态设置正确的字体样式
        if (inTopicProcessing && !processingSubItems) {
          ctx.font = 'bold 55px sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          console.log(`谨慎模式(切片背景)-新页面设置主题样式`);
        } else if (processingSubItems) {
          ctx.font = '45px sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          console.log(`谨慎模式(切片背景)-新页面设置子项目样式`);
        } else {
          // 默认文本样式
          ctx.font = '45px sans-serif';
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
        }
        
        return {
          canvas,
          ctx,
          currentY: topMargin + 80, // 增加非第一页的顶部边距，给予更多空白
          contentStartY: topMargin + 80,
          linesOnPage: 0
        };
      }
    };
    
    // 初始化第一页
    currentPage = await createNewPage();

    // 根据处理模式处理内容
    if (isStructuredData && topicMode) {
      // 主题模式处理
      console.log("谨慎模式(切片背景)-使用主题模式处理内容进行绘制");
      
      while (currentTopicIndex < processedContent.length) {
        const topic = processedContent[currentTopicIndex];
        console.log(`谨慎模式(切片背景)-处理主题 ${currentTopicIndex + 1}/${processedContent.length}: ${topic.topic}`);
        
        // 设置当前处理状态为主题
        currentProcessingState = 'topic';
        
        // 绘制主题标题
        currentPage.ctx.font = 'bold 55px sans-serif';
        currentPage.ctx.fillStyle = '#FFFFFF';
        currentPage.ctx.textAlign = 'left';
        
        // 计算绘制主题需要的空间
        const topicText = topic.topic;
        const topicLines = this.wrapText(currentPage.ctx, topicText, 55, 1082);
        console.log(`谨慎模式(切片背景)-主题标题分为 ${topicLines.length} 行`);
        
        // 检查页面剩余空间
        const topicHeight = topicLines.length * 60 + 20; // 主题高度 + 额外间距
        if (currentPage.currentY + topicHeight > 1650) {
          // 当前页空间不足，创建新页
          console.log(`谨慎模式(切片背景)-当前页面无法容纳主题标题，创建新页面`);
          pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
          isFirstPage = false;
          currentPage = await createNewPage();
          
          // 在新页面上重新设置主题字体样式
          currentPage.ctx.font = 'bold 55px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
        }
        
        // 绘制主题标题（添加emoji✅，加粗，并添加下划线）
        topicLines.forEach((line, index) => {
          // 绘制文本（加前缀emoji）
          const textToDraw = index === 0 ? `✅ ${line}` : line;
          currentPage.ctx.fillText(
            textToDraw,
            80,
            currentPage.currentY
          );
          
          // 绘制下划线
          const textWidth = currentPage.ctx.measureText(textToDraw).width;
          const underlineY = currentPage.currentY + 5; // 下划线位置在文本下方5px
          currentPage.ctx.beginPath();
          currentPage.ctx.moveTo(80, underlineY);
          currentPage.ctx.lineTo(80 + textWidth, underlineY);
          currentPage.ctx.lineWidth = 2;
          currentPage.ctx.strokeStyle = '#FFFFFF';
          currentPage.ctx.stroke();
          
          currentPage.currentY += 60;
          currentPage.linesOnPage++;
        });
        
        // 主题标题后增加间距
        currentPage.currentY += 20;
        
        // 处理该主题下的所有子项目
        currentItemIndex = 0;
        
        // 设置当前处理状态为子项目
        currentProcessingState = 'item';
        
        while (currentItemIndex < topic.items.length) {
          const text = topic.items[currentItemIndex];
          console.log(`谨慎模式(切片背景)-处理主题 "${topic.topic}" 中的项目 ${currentItemIndex + 1}/${topic.items.length}: ${text.slice(0, 20)}...`);
          
          // 每次处理子项目前设置正确样式
          currentPage.ctx.font = '45px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
          
          const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
          console.log(`谨慎模式(切片背景)-子项目文本被分割为 ${lines.length} 行`);
          
          // 检查当前页是否还能容纳这段文字
          const totalLinesNeeded = lines.length;
          const willExceedLimit = currentPage.currentY + (totalLinesNeeded * 60) + 10 > 1650;

          if (willExceedLimit) {
            console.log(`谨慎模式(切片背景)-当前页面已满，创建新页面 (处理子项目中)`);
            pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
            isFirstPage = false;
            currentPage = await createNewPage();
            
            // 确保新页面上使用子项目的字体样式
            currentPage.ctx.font = '45px sans-serif';
            currentPage.ctx.fillStyle = '#FFFFFF';
            currentPage.ctx.textAlign = 'left';
          }

          // 绘制子项目文本
          lines.forEach((line, index) => {
            if (index === 0) {
              currentPage.ctx.fillText(
                `${lineNumber}. ${line}`,
                80,
                currentPage.currentY
              );
              lineNumber++;
            } else {
              currentPage.ctx.fillText(
                line,
                80,
                currentPage.currentY
              );
            }
            currentPage.currentY += 60;
            currentPage.linesOnPage++;
          });

          currentPage.currentY += 10; // 段落间距
          currentItemIndex++;
        }
        
        // 主题之间增加额外间距
        currentPage.currentY += 30;
        currentTopicIndex++;
      }
    } else {
      // 普通模式：处理扁平化的内容
      currentProcessingState = 'none';
      console.log(`谨慎模式-使用普通模式处理内容进行绘制，共 ${processedContent.length} 个项目`);
      
      // 计算文本会占用的高度
      const calculateTextHeight = (ctx, text, fontSize, maxWidth) => {
        const lines = this.wrapText(ctx, text, fontSize, maxWidth);
        // 每行高度为60px，段落间距10px
        return lines.length * 60 + 10; 
      };
      
      while (currentTextIndex < processedContent.length) {
        const text = processedContent[currentTextIndex];
        console.log(`谨慎模式-处理文本索引 ${currentTextIndex}, 内容: ${text.slice(0, 20)}...`);
        
        // 确保使用正确的字体样式
        currentPage.ctx.font = '45px sans-serif';
        currentPage.ctx.fillStyle = '#FFFFFF';
        currentPage.ctx.textAlign = 'left';
        
        // 计算当前文本需要的高度
        const textHeight = calculateTextHeight(currentPage.ctx, text, 45, 1082);
        
        // 判断是否可以完整显示当前文本
        if (currentPage.currentY + textHeight > 1650) {
          console.log(`谨慎模式-当前页面不足以容纳文本，当前Y: ${currentPage.currentY}，需要高度: ${textHeight}，创建新页面`);
          pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
          isFirstPage = false;
          currentPage = await createNewPage();
          
          // 确保新页面上使用正确的字体样式
          currentPage.ctx.font = '45px sans-serif';
          currentPage.ctx.fillStyle = '#FFFFFF';
          currentPage.ctx.textAlign = 'left';
        }
        
        // 绘制文本
        const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
        console.log(`谨慎模式-文本被分割为 ${lines.length} 行`);

        lines.forEach((line, index) => {
          if (index === 0) {
            currentPage.ctx.fillText(
              `${lineNumber}. ${line}`,
              80,
              currentPage.currentY
            );
            lineNumber++;
          } else {
            currentPage.ctx.fillText(
              line,
              80,
              currentPage.currentY
            );
          }
          currentPage.currentY += 60;
          currentPage.linesOnPage++;
        });

        currentPage.currentY += 10; // 段落间距
        currentTextIndex++;
      }
    }

    // 添加最后一页
    if (currentPage && currentPage.linesOnPage > 0) {
      console.log(`谨慎模式-添加最后一页，行数: ${currentPage.linesOnPage}`);
      pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
    }

    console.log(`谨慎模式-内页生成完成，共 ${pages.length} 页`);
    return pages;
  }

  // 组织封面图（多图模式下按文件名排序分组）
  static async organizeCovers(coverImages, coverMode) {
    console.log(`开始整理封面图片，模式: ${coverMode}，提供了 ${coverImages ? coverImages.length : 0} 个文件对象`);
    
    if (!coverImages || coverImages.length === 0) {
      console.log('没有提供封面图片，将使用空数组');
      return [];
    }
    
    // 输出前5个文件的详细属性，用于调试
    const filesToLog = Math.min(coverImages.length, 5);
    for (let i = 0; i < filesToLog; i++) {
      console.log(`文件 #${i + 1} 的属性:`);
      const file = coverImages[i];
      console.log(`- 名称: ${file.name || '未命名'}`);
      console.log(`- 类型: ${file.type || '无类型'}`);
      console.log(`- 大小: ${file.size || '未知'} 字节`);
      console.log(`- 路径: ${file.webkitRelativePath || '无路径'}`);
      console.log(`- 对象类型: ${file instanceof File ? 'File' : file instanceof Blob ? 'Blob' : typeof file}`);
      
      // 检查文件是否有数据
      if (file.size === 0) {
        console.warn(`警告: 文件 #${i + 1} 大小为0字节`);
      }
    }

    try {
      // 预处理文件，确保具有必要的属性
      const preprocessedFiles = coverImages.map(file => {
        // 创建文件的可变副本
        const processedFile = file;
        
        // 确保文件有name属性
        if (!processedFile.name && processedFile.webkitRelativePath) {
          const pathParts = processedFile.webkitRelativePath.split('/');
          const fileName = pathParts[pathParts.length - 1];
          try {
            Object.defineProperty(processedFile, 'name', {
              value: fileName,
              writable: true,
              enumerable: true,
              configurable: true
            });
            console.log(`为文件添加了name属性: ${fileName}`);
          } catch (e) {
            console.warn(`无法为文件添加name属性: ${e.message}`);
          }
        }
        
        // 确保文件有type属性（根据扩展名推断）
        if (!processedFile.type && processedFile.name) {
          const ext = processedFile.name.split('.').pop().toLowerCase();
          let mimeType = null;
          
          switch (ext) {
            case 'jpg':
            case 'jpeg':
              mimeType = 'image/jpeg';
              break;
            case 'png':
              mimeType = 'image/png';
              break;
            case 'gif':
              mimeType = 'image/gif';
              break;
            case 'webp':
              mimeType = 'image/webp';
              break;
            case 'bmp':
              mimeType = 'image/bmp';
              break;
            case 'tif':
            case 'tiff':
              mimeType = 'image/tiff';
              break;
            case 'svg':
              mimeType = 'image/svg+xml';
              break;
            default:
              if (processedFile.webkitRelativePath) {
                // 文件夹上传的文件，默认为JPEG
                mimeType = 'image/jpeg';
              }
          }
          
          if (mimeType) {
            try {
              Object.defineProperty(processedFile, 'type', {
                value: mimeType,
                writable: true,
                enumerable: true,
                configurable: true
              });
              console.log(`为文件 ${processedFile.name} 添加了type属性: ${mimeType}`);
            } catch (e) {
              console.warn(`无法为文件 ${processedFile.name} 添加type属性: ${e.message}`);
            }
          }
        }
        
        return processedFile;
      });
      
      // 过滤出有效的图片文件，在多图模式下宽松验证
      const validImageFiles = preprocessedFiles.filter(file => {
        // 如果是多图模式下的文件夹上传
        if (coverMode === 'multi' && file.webkitRelativePath && file.webkitRelativePath.includes('/')) {
          console.log(`多图模式：接受来自文件夹的文件 ${file.name || '未命名'}`);
          return true;
        }
        
        // 正常检查图片文件
        return this.isImageFile(file);
      });
      
      console.log(`过滤后的有效图片文件数量: ${validImageFiles.length}`);
      
      if (validImageFiles.length === 0) {
        console.warn('过滤后没有有效的图片文件，返回空数组');
        return [];
      }

      if (coverMode === 'single') {
        // 单图模式: 每个图片独立一组
        console.log('使用单图模式整理封面');
        return validImageFiles.map(file => [file]);
      } else {
        // 多图模式: 尝试根据不同属性进行分组
        console.log('使用多图模式整理封面，开始分析文件分组信息');
        
        // 检查是否有groupId或__metadata__
        const hasGroupId = validImageFiles.some(file => file.groupId !== undefined);
        const hasMetadata = validImageFiles.some(file => file.__metadata__ !== undefined);
        const hasRelativePath = validImageFiles.some(file => 
          file.webkitRelativePath && file.webkitRelativePath.includes('/') || 
          file.customPath && file.customPath.includes('/')
        );
        
        console.log(`存在groupId分组: ${hasGroupId}`);
        console.log(`存在__metadata__分组: ${hasMetadata}`);
        console.log(`存在webkitRelativePath或customPath路径: ${hasRelativePath}`);
        
        if (hasGroupId) {
          // 使用groupId分组
          const groups = {};
          validImageFiles.forEach(file => {
            const groupId = file.groupId || 'default';
            if (!groups[groupId]) groups[groupId] = [];
            groups[groupId].push(file);
          });
          
          // 按照groupOrder排序组内文件
          Object.values(groups).forEach(group => {
            group.sort((a, b) => (a.groupOrder || 0) - (b.groupOrder || 0));
          });
          
          // 为每个组内的文件添加新索引，从1开始
          Object.values(groups).forEach(group => {
            group.forEach((file, index) => {
              file._newIndex = index + 1;
              console.log(`组文件 ${file.name} 分配新索引: ${file._newIndex}`);
            });
          });
          
          console.log(`基于groupId创建了 ${Object.keys(groups).length} 个分组`);
          return Object.values(groups);
        } else if (hasMetadata) {
          // 使用__metadata__分组
          const groups = {};
          validImageFiles.forEach(file => {
            const groupId = file.__metadata__?.groupId || 'default';
            if (!groups[groupId]) groups[groupId] = [];
            groups[groupId].push(file);
          });
          
          // 排序
          Object.values(groups).forEach(group => {
            group.sort((a, b) => (a.__metadata__?.order || 0) - (b.__metadata__?.order || 0));
          });
          
          // 为每个组内的文件添加新索引，从1开始
          Object.values(groups).forEach(group => {
            group.forEach((file, index) => {
              file._newIndex = index + 1;
              console.log(`组文件 ${file.name} 分配新索引: ${file._newIndex}`);
            });
          });
          
          console.log(`基于__metadata__创建了 ${Object.keys(groups).length} 个分组`);
          return Object.values(groups);
        } else if (hasRelativePath) {
          // 使用webkitRelativePath或customPath（文件夹上传）分组
          const groups = {};
          validImageFiles.forEach(file => {
            let relativePath = file.customPath || file.webkitRelativePath || '';
            let folderPath = file.folderPath || '';
            
            // 如果有webkitRelativePath但没有自定义folderPath，从路径中提取
            if (!folderPath && file.webkitRelativePath) {
              const pathParts = file.webkitRelativePath.split('/');
              if (pathParts.length > 1) {
                // 使用文件夹作为分组依据
                folderPath = pathParts.slice(0, -1).join('/');
              }
            }
            
            // 如果有路径信息，使用路径作为分组键
            if (folderPath || relativePath.includes('/')) {
              // 确定分组键
              const groupKey = folderPath || (relativePath.includes('/') ? 
                              relativePath.split('/').slice(0, -1).join('/') : 'root');
              
              if (!groups[groupKey]) groups[groupKey] = [];
              groups[groupKey].push(file);
            } else {
              // 没有路径信息的文件归入默认组
              if (!groups['default']) groups['default'] = [];
              groups['default'].push(file);
            }
          });
          
          // 按文件名排序组内文件
          Object.values(groups).forEach(group => {
            group.sort((a, b) => {
              // 尝试提取文件名（不带扩展名）
              const nameA = a.name.split('.')[0].trim();
              const nameB = b.name.split('.')[0].trim();
              
              // 检查两个文件名是否都是纯数字
              const isNumericA = /^\d+$/.test(nameA);
              const isNumericB = /^\d+$/.test(nameB);
              
              // 如果两个都是数字，按数值大小排序
              if (isNumericA && isNumericB) {
                return parseInt(nameA, 10) - parseInt(nameB, 10);
              }
              
              // 否则按字典序排序
              return nameA.localeCompare(nameB);
            });
            
            // 为每个组内的文件添加新索引，从1开始
            group.forEach((file, index) => {
              file._newIndex = index + 1;
              console.log(`组文件 ${file.name} 分配新索引: ${file._newIndex}`);
            });
          });
          
          console.log(`基于文件夹路径创建了 ${Object.keys(groups).length} 个分组:`);
          Object.keys(groups).forEach(key => {
            console.log(`- 组 "${key}": ${groups[key].length}个文件, 编号从1到${groups[key].length}`);
          });
          
          return Object.values(groups);
        } else {
          // 没有分组信息，将所有图片作为一个组
          console.log('没有找到分组信息，将所有图片作为一个组');
          const singleGroup = validImageFiles;
          
          // 为单组内的文件添加新索引，从1开始
          singleGroup.forEach((file, index) => {
            file._newIndex = index + 1;
            console.log(`组文件 ${file.name} 分配新索引: ${file._newIndex}`);
          });
          
          return [singleGroup];
        }
      }
    } catch (error) {
      console.error('整理封面图片时出错:', error);
      console.log('由于出错，将所有图片作为一个组返回');
      // 出错时的安全回退：将所有有效图片作为一个组
      const safeImages = coverImages.filter(file => this.isImageFile(file));
      
      // 为安全回退的单组添加新索引，从1开始
      safeImages.forEach((file, index) => {
        file._newIndex = index + 1;
        console.log(`安全回退：组文件 ${file.name} 分配新索引: ${file._newIndex}`);
      });
      
      return safeImages.length > 0 ? [safeImages] : [];
    }
  }

  static isImageFile(file) {
    if (!file) {
      console.error('检查到无效文件对象: 文件对象为空');
      return false;
    }
    
    // 确保文件有名称属性
    if (!file.name) {
      console.warn('检查到无效文件对象: 文件对象缺少名称属性');
      
      // 尝试从webkitRelativePath提取名称
      if (file.webkitRelativePath) {
        const pathParts = file.webkitRelativePath.split('/');
        if (pathParts.length > 0) {
          const extractedName = pathParts[pathParts.length - 1];
          console.log(`尝试从路径提取文件名: ${extractedName}`);
          // 动态添加name属性
          Object.defineProperty(file, 'name', {
            value: extractedName,
            writable: true,
            enumerable: true,
            configurable: true
          });
          console.log(`已为文件动态添加名称: ${file.name}`);
        }
      }
      
      // 如果仍然没有名称，则创建一个默认名称
      if (!file.name) {
        const defaultName = `未命名文件_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        console.log(`创建默认文件名: ${defaultName}`);
        Object.defineProperty(file, 'name', {
          value: defaultName,
          writable: true,
          enumerable: true,
          configurable: true
        });
      }
    }
    
    console.log(`检查文件 ${file.name}:`);
    console.log(`- 类型: ${file.type || '未知'}`);
    console.log(`- 大小: ${file.size} 字节`);
    console.log(`- 相对路径: ${file.webkitRelativePath || '无'}`);
    
    // 完全宽松的判断 - 即使没有文件类型信息，也允许处理
    // 这是为了支持文件夹上传和某些浏览器可能没有正确设置type属性的情况
    
    // 如果文件有明确的图片类型，直接通过
    if (file.type && file.type.startsWith('image/')) {
      console.log(`文件 ${file.name} 通过MIME类型验证为图片`);
      return true;
    }
    
    // 如果有扩展名，通过扩展名判断
    const ext = file.name.split('.').pop().toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'tif', 'tiff', 'heic'];
    if (imageExtensions.includes(ext)) {
      console.log(`文件 ${file.name} 通过扩展名验证为图片`);
      
      // 尝试为无类型的图片文件添加类型
      if (!file.type) {
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        try {
          Object.defineProperty(file, 'type', {
            value: mimeType,
            writable: true,
            enumerable: true,
            configurable: true
          });
          console.log(`为文件 ${file.name} 动态添加了类型: ${mimeType}`);
        } catch (e) {
          console.warn(`无法为文件 ${file.name} 添加类型: ${e.message}`);
        }
      }
      return true;
    }
    
    // 对于来自文件夹上传的文件，即使没有类型信息，也将其视为有效
    if (file.webkitRelativePath && file.webkitRelativePath.includes('/')) {
      console.log(`文件 ${file.name} 来自文件夹上传，被视为有效图片`);
      return true;
    }
    
    // 宽松模式 - 没有明确不是图片的证据，都允许通过
    console.log(`文件 ${file.name} 没有明确的图片信息，但仍被放行`);
    return true;
  }

  // 安全地格式化日期为YYYY-MM-DD格式
  static formatDate(date) {
    try {
      // 检查date是否是有效的Date对象
      if (!(date instanceof Date) || isNaN(date.getTime())) {
        throw new Error('无效的日期对象');
      }
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('日期格式化错误:', error);
      // 使用当前日期作为备用
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
} 