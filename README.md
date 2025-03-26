# 图文处理工具

## 项目概述
这是一个基于 React 的图文处理工具，用于处理封面图片、背景图片和文本内容，生成带有特定格式的图文素材包。该工具支持批量处理，可以同时处理多组图文内容，并支持JPG/PNG格式的图片输出。

## 主要功能

### 1. 文件上传与处理
#### 1.1 封面图片（可选）
- 支持多个封面图片上传
- 支持跳过封面图片，使用纯色背景
- 自动调整尺寸为1242x1660像素
- 支持JPG/PNG格式

#### 1.2 背景素材图片（必选）
- 支持多个背景图片上传
- 自动调整尺寸为1242x1660像素
- 自动调整透明度为0.35
- 添加黑色背景层
- 支持严谨模式和宽松模式的素材使用规则

#### 1.3 Excel文件处理（必选）
- 支持.xlsx、.xls、.csv格式
- 自动保存上传的Excel文件
- 支持刷新页面后保持数据
- 文本内容自动随机打乱并分页

### 2. 处理模式
#### 2.1 严谨模式
- 每个背景图片仅使用一次
- 当背景图片不足时停止处理并提示
- 适合需要严格控制素材使用的场景

#### 2.2 宽松模式
- 背景图片可重复使用
- 适合素材数量有限的场景

### 3. 输出选项
#### 3.1 图片格式选择
- 支持JPG格式（默认）
- 支持PNG格式
- 可随时切换输出格式

#### 3.2 文件组织
- 使用4位数字命名文件夹（0001-9999）
- 通过IndexedDB确保编号不重复
- 每个文件夹包含：
  - 内页图片（自动编号）
  - 封面图片（如果有）
  - 所有图片按顺序编号

### 4. 用户界面功能
- 实时进度条显示处理进度
- 文件上传状态提示
- 处理完成提示
- 错误信息显示
- 自定义内页标题文本
- 自定义背景颜色

## 技术实现

### 1. 核心文件说明
#### 1.1 src/App.js
- 主应用组件
- 状态管理
- 用户界面渲染
- 文件上传处理
- 进度显示逻辑

#### 1.2 src/services/imageProcessor.js
- 图片处理核心逻辑
- 尺寸调整
- 透明度处理
- 文本添加
- 图片格式转换

#### 1.3 src/services/dbService.js
- IndexedDB数据存储
- 文件夹编号管理
- Excel文件缓存

#### 1.4 src/components/
- FileUploader.js：文件上传组件
- ProgressBar.js：进度显示组件
- FormatSelector.js：格式选择组件

### 2. 主要函数说明
#### 2.1 图片处理函数
- processImages()：主处理流程
- generateContentPages()：生成内页
- adjustImageSize()：调整图片尺寸
- applyTransparency()：应用透明度
- addTextToImage()：添加文本到图片

#### 2.2 数据处理函数
- processExcelData()：Excel数据处理
- shuffleArray()：数组随机打乱
- generateFolderName()：生成文件夹名
- saveToIndexedDB()：保存到数据库

## 部署指南

### 1. 环境要求
- Node.js 16+
- Nginx 1.18+
- 服务器内存 >= 2GB
- 磁盘空间 >= 10GB

### 2. 构建步骤
```bash
# 安装依赖
npm install

# 构建生产版本
npm run build
```

### 3. 服务器部署
```bash
# 创建部署目录
mkdir -p /var/www/IMAGE0326

# 上传构建文件
scp -r dist/* root@服务器IP:/var/www/IMAGE0326/

# 配置Nginx
# 在/etc/nginx/conf.d/创建配置文件
server {
    listen 3326;
    server_name localhost;
    root /var/www/IMAGE0326;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# 开放防火墙端口
ufw allow 3326/tcp
ufw reload

# 重启Nginx
systemctl restart nginx
```

### 4. 访问地址
- http://服务器IP:3326

### 5. 注意事项
- 确保服务器防火墙开放3326端口
- 检查阿里云安全组配置
- 确保Nginx配置文件语法正确
- 定期检查日志文件
- 建议配置SSL证书

## 更新日志

### 2024.03.26
- 新增：图片格式选择功能（JPG/PNG）
- 优化：移除预估素材数量逻辑
- 优化：简化错误提示信息
- 新增：严谨模式和宽松模式
- 部署：更新部署端口为3326

### 2024.03.25
- 新增：支持无封面图片模式
- 优化：下载成功提示的显示逻辑
- 优化：文件处理性能提升

## 问题排查

### 1. 常见问题
- 图片上传失败：检查文件大小和格式
- 处理超时：检查服务器内存使用
- 下载失败：检查网络连接和文件大小
- 页面无响应：检查浏览器控制台错误

### 2. 性能优化建议
- 图片大小建议不超过5MB
- Excel文件行数建议不超过1000行
- 建议使用Chrome或Firefox浏览器
- 定期清理浏览器缓存

## 联系与支持
如有问题请联系技术支持

/* 格式选择样式 */
.format-config {
  margin-top: 20px;
  padding: 20px;
  background: rgba(0,0,0,0.2);
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.1);
}

.format-config h3 {
  color: #fff;
  margin: 0 0 15px 0;
  font-size: 18px;
}

.format-inputs {
  display: flex;
  gap: 20px;
}

.format-inputs label {
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.format-inputs input[type="radio"] {
  cursor: pointer;
}
