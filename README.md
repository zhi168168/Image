# 图文处理工具

## 项目概述
这是一个基于 React 的图文处理工具，用于处理封面图片、背景图片和文本内容，生成带有特定格式的图文素材包。

## 主要功能
1. 上传并处理三种文件：
   - 封面图片（支持多个）
   - 背景素材图片（支持多个）
   - Excel 表格文件（单个，自动保存）

2. 文件处理：
   - 自动调整图片尺寸为 1242x1660
   - 背景图片会自动调整透明度（0.35）并添加黑色背景
   - Excel 文件中的文本会被随机打乱并分页展示
   - 生成的文件夹使用 4 位数字命名（0001-9999），通过 IndexedDB 确保编号不重复

3. 用户体验优化：
   - Excel 文件会自动保存，刷新页面后保持
   - 重新上传背景素材时会重置下载状态
   - 下载成功后显示提示
   - 进度条显示处理进度

## 技术栈
- React 18
- Webpack 5
- Babel
- IndexedDB
- File API
- Canvas API

## 项目结构 