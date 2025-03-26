#!/bin/bash

echo "开始本地构建..."

# 清理旧的构建文件
rm -rf dist/
rm -f image-project.zip

# 安装依赖（包括开发依赖）
npm install --include=dev

# 使用本地的 webpack 构建
./node_modules/.bin/webpack --mode production

# 打包必要的文件
zip -r image-project.zip \
    package.json \
    package-lock.json \
    dist/ \
    public/ \
    deploy.sh \
    .babelrc \
    webpack.config.js \
    node_modules/ \
    src/ \
    .env* \
    *.config.js

echo "本地构建完成"