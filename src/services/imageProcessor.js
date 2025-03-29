import { read as readXLSX } from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { DBService } from './dbService';

export class ImageProcessor {
  static async processImages(coverImages, backgroundImages, excelFile, onProgress, titleConfig, imageFormat = 'png', pageMode = 'flexible', pageLimit = 0, knowledgeMode = false, knowledgeCount = 0, knowledgeExcel = null) {
    // 判断是否使用的是默认黑色封面
    const isUsingBlackCover = coverImages?.[0]?.name === 'black_cover.png';

    try {
      // 解析Excel文件
      onProgress(0, '正在解析表格文件...');
      const textContent = await this.parseExcel(excelFile);
      
      // 如果启用知识拼接模式，解析知识Excel文件
      let knowledgeData = [];
      if (knowledgeMode && knowledgeCount > 0 && knowledgeExcel) {
        onProgress(5, '正在解析知识文件...');
        knowledgeData = await this.parseKnowledgeExcel(knowledgeExcel);
        
        // 检查知识条目是否足够
        const requiredKnowledge = knowledgeCount * (coverImages?.length || 1);
        if (knowledgeData.length < requiredKnowledge) {
          throw new Error(`知识条目不足，需要${requiredKnowledge}条，但只有${knowledgeData.length}条`);
        }
      }
      
      // 创建 ZIP 文件
      const zip = new JSZip();
      
      // 处理文件夹数量 - 使用封面图数量或者1（如果没有封面图）
      const totalSteps = coverImages?.length || 1;

      // 背景图片索引（用于严谨模式）
      let backgroundIndex = 0;
      
      // 知识条目索引
      let knowledgeIndex = 0;

      // 处理每组图片
      for (let i = 0; i < totalSteps; i++) {
        onProgress(
          Math.round((i / totalSteps) * 90),
          `正在处理第 ${i + 1}/${totalSteps} 组图片...`
        );

        // 处理封面图片 - 可能存在或不存在
        let processedCover = null;
        if (coverImages && coverImages[i]) {
          processedCover = await this.processImage(coverImages[i], imageFormat);
        }
        
        // 处理背景图片
        let backgroundCanvas;
        
        if (pageMode === 'flexible') {
          // 宽松模式：使用对应的背景图
          // 如果背景图不够，则循环使用
          const backgroundIndex = i % backgroundImages.length;
          backgroundCanvas = await this.processBackgroundImage(backgroundImages[backgroundIndex]);
        }
        
        // 生成内页
        let contentPages;
        
        if (pageMode === 'flexible') {
          // 宽松模式：所有内页使用同一张背景
          contentPages = await this.generateContentPages(
            backgroundCanvas, 
            textContent,
            titleConfig,
            imageFormat
          );
        } else if (pageMode === 'cautious') {
          // 谨慎模式：每个内页使用不同的背景，只有第一页显示标题
          try {
            contentPages = await this.generateContentPagesCautious(
              backgroundImages,
              backgroundIndex,
              textContent,
              titleConfig,
              imageFormat
            );
            
            // 更新背景索引
            backgroundIndex += contentPages.length;
          } catch (error) {
            // 直接向上抛出错误
            throw error;
          }
        } else {
          // 严谨模式：每个内页使用不同的背景
          try {
            contentPages = await this.generateContentPagesStrict(
              backgroundImages,
              backgroundIndex,
              textContent,
              titleConfig,
              imageFormat
            );
            
            // 更新背景索引
            backgroundIndex += contentPages.length;
          } catch (error) {
            // 直接向上抛出错误
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
        
        // 只有在有封面图且不是黑色封面的情况下才添加封面图
        if (processedCover && !isUsingBlackCover) {
          folder.file(`封面图.${imageFormat}`, processedCover);
        }
        
        // 添加内页
        contentPages.forEach((pageBlob, pageIndex) => {
          folder.file(`内页${pageIndex + 1}.${imageFormat}`, pageBlob);
        });
        
        // 记录当前内页数量，用于知识图片的连续编号
        const contentPagesCount = contentPages.length;
        
        // 如果启用了知识拼接模式，生成知识图片
        if (knowledgeMode && knowledgeCount > 0) {
          for (let j = 0; j < knowledgeCount; j++) {
            // 确保还有可用的知识条目
            if (knowledgeIndex < knowledgeData.length) {
              const knowledge = knowledgeData[knowledgeIndex++];
              const knowledgeImage = await this.generateKnowledgeImage(
                knowledge.title, 
                knowledge.content,
                backgroundImages[i % backgroundImages.length], // 使用一个背景图
                imageFormat
              );
              // 使用内页编号的连续性，将知识图命名为紧接着的内页编号
              folder.file(`内页${contentPagesCount + j + 1}.${imageFormat}`, knowledgeImage);
            }
          }
        }
      }

      // 生成ZIP文件
      onProgress(95, '正在生成压缩包...');
      // 生成当前时间字符串 (格式: YYYYMMDDHHMMSS)
      const now = new Date();
      const timestamp = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

      const zipContent = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });

      onProgress(100, '处理完成');
      return { 
        blob: zipContent, 
        fileName: `素材包${timestamp}.zip`
      };
    } catch (error) {
      console.error('处理过程中出错:', error);
      throw error;
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
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const data = [];
          let i = 1;
          while (firstSheet[`A${i}`]) {
            data.push(firstSheet[`A${i}`].v);
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

  static async processImage(coverImage, imageFormat = 'png') {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1242;
        canvas.height = 1660;
        const ctx = canvas.getContext('2d');
        
        // 绘制封面图片
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // 转换为blob
        canvas.toBlob((blob) => {
          resolve(blob);
        }, `image/${imageFormat}`, imageFormat === 'jpeg' ? 0.9 : undefined);
      };
      img.src = URL.createObjectURL(coverImage);
    });
  }

  static async generateContentPages(backgroundCanvas, textContent, titleConfig, imageFormat = 'png') {
    // 随机打乱文字内容
    const shuffledContent = this.shuffleArray([...textContent]);
    const pages = [];
    let currentPage = null;
    let lineNumber = 1;
    let currentTextIndex = 0;

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

    while (currentTextIndex < shuffledContent.length) {
      const text = shuffledContent[currentTextIndex];
      const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
      
      // 检查当前页是否还能容纳这段文字
      const totalLinesNeeded = lines.length;
      const willExceedLimit = currentPage.linesOnPage + totalLinesNeeded > 27;

      if (willExceedLimit) {
        pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
        currentPage = createNewPage();
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

  static wrapText(ctx, text, fontSize, maxWidth) {
    ctx.font = `${fontSize}px sans-serif`; // 设置正确的字体大小
    const words = text.split('');
    const lines = [];
    let currentLine = '';

    for (const char of words) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth) {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    
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
  static async generateContentPagesStrict(backgroundImages, startIndex, textContent, titleConfig, imageFormat = 'png') {
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
      if (currentBackgroundIndex >= backgroundImages.length) {
        throw new Error('内页素材不够');
      }
      
      // 获取当前背景图并处理
      const backgroundCanvas = await this.processBackgroundImage(backgroundImages[currentBackgroundIndex]);
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

  // 添加新的谨慎模式：基于严谨模式，但只有第一页显示标题
  static async generateContentPagesCautious(backgroundImages, startIndex, textContent, titleConfig, imageFormat = 'png') {
    // 随机打乱文字内容
    const shuffledContent = this.shuffleArray([...textContent]);
    const pages = [];
    let currentPage = null;
    let lineNumber = 1;
    let currentTextIndex = 0;
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

    while (currentTextIndex < shuffledContent.length) {
      const text = shuffledContent[currentTextIndex];
      const testCtx = currentPage.ctx;
      // 计算当前文本需要的高度
      const textHeight = calculateTextHeight(testCtx, text, 45, 1082);
      
      // 计算当前页面的可用空间
      const availableHeight = 1660 - 80 - (currentPage.currentY - currentPage.contentStartY);
      
      // 判断是否可以完整显示当前文本
      if (currentPage.currentY + textHeight > 1650) { // 将底部边距从1600减少到仅10像素(1660-10)
        // 当前页不够放下这个文本，创建新页
        pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
        isFirstPage = false;
        currentPage = await createNewPage();
      }
      
      // 绘制文本
      const lines = this.wrapText(currentPage.ctx, text, 45, 1082);
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

    // 添加最后一页
    if (currentPage && currentPage.linesOnPage > 0) {
      pages.push(await this.canvasToBlob(currentPage.canvas, imageFormat));
    }

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
  static async generateKnowledgeImage(title, content, backgroundImage, imageFormat = 'png') {
    return new Promise(async (resolve) => {
      // 创建画布
      const canvas = document.createElement('canvas');
      canvas.width = 1242;
      canvas.height = 1660;
      const ctx = canvas.getContext('2d');
      
      // 使用灰色背景替代背景图片
      ctx.fillStyle = '#f0f2f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 绘制卡片背景
      this.drawRoundedRect(ctx, 100, 100, canvas.width - 200, canvas.height - 200, 20, '#ffffff');
      
      // 添加卡片阴影（模拟）
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      this.drawRoundedRect(ctx, 100, 100, canvas.width - 200, canvas.height - 200, 20, '#ffffff');
      ctx.restore();
      
      // 绘制装饰元素
      ctx.fillStyle = '#1890ff';
      
      // 左上角装饰
      this.drawRoundedRect(ctx, 130, 130, 50, 5, 2, '#1890ff');
      this.drawRoundedRect(ctx, 130, 130, 5, 50, 2, '#1890ff');
      
      // 右上角装饰
      this.drawRoundedRect(ctx, canvas.width - 180, 130, 50, 5, 2, '#1890ff');
      this.drawRoundedRect(ctx, canvas.width - 135, 130, 5, 50, 2, '#1890ff');
      
      // 左下角装饰
      this.drawRoundedRect(ctx, 130, canvas.height - 135, 50, 5, 2, '#1890ff');
      this.drawRoundedRect(ctx, 130, canvas.height - 180, 5, 50, 2, '#1890ff');
      
      // 右下角装饰
      this.drawRoundedRect(ctx, canvas.width - 180, canvas.height - 135, 50, 5, 2, '#1890ff');
      this.drawRoundedRect(ctx, canvas.width - 135, canvas.height - 180, 5, 50, 2, '#1890ff');
      
      // 绘制标题
      ctx.font = 'bold 60px sans-serif';
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      
      // 如果标题过长，自动换行
      const titleMaxWidth = canvas.width - 300;
      const titleLines = this.wrapText(ctx, title, 60, titleMaxWidth);
      
      // 绘制标题文本
      let titleY = 250;
      titleLines.forEach(line => {
        ctx.fillText(line, canvas.width / 2, titleY);
        titleY += 70;
      });
      
      // 绘制分隔线
      ctx.fillStyle = '#1890ff';
      this.drawRoundedRect(ctx, canvas.width / 2 - 100, titleY + 20, 200, 3, 1.5, '#1890ff');
      
      // 绘制内容
      ctx.font = '36px sans-serif';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'left';
      
      // 处理内容中的换行
      const contentParagraphs = content.split('\n');
      let contentY = titleY + 100;
      
      contentParagraphs.forEach(paragraph => {
        // 每段内容自动换行
        const contentMaxWidth = canvas.width - 300;
        const contentLines = this.wrapText(ctx, paragraph, 36, contentMaxWidth);
        
        // 绘制段落文本
        contentLines.forEach(line => {
          ctx.fillText(line, 150, contentY);
          contentY += 50;
        });
        
        // 段落间增加额外空间
        contentY += 20;
      });
      
      // 转换为blob
      canvas.toBlob((blob) => {
        resolve(blob);
      }, `image/${imageFormat}`, imageFormat === 'jpeg' ? 0.9 : undefined);
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
} 