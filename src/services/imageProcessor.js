import { read as readXLSX } from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { DBService } from './dbService';

export class ImageProcessor {
  static async processImages(coverImages, backgroundImages, excelFile, onProgress, titleConfig, imageFormat = 'png', pageMode = 'flexible') {
    // 判断是否使用的是默认黑色封面
    const isUsingBlackCover = coverImages?.[0]?.name === 'black_cover.png';

    try {
      // 解析Excel文件
      onProgress(0, '正在解析表格文件...');
      const textContent = await this.parseExcel(excelFile);
      
      // 创建 ZIP 文件
      const zip = new JSZip();
      
      // 处理文件夹数量 - 使用封面图数量或者1（如果没有封面图）
      const totalSteps = coverImages?.length || 1;

      // 背景图片索引（用于严谨模式）
      let backgroundIndex = 0;

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
      const willExceedLimit = currentPage.linesOnPage + totalLinesNeeded > 20;

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
      const willExceedLimit = currentPage.linesOnPage + totalLinesNeeded > 20;

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
} 