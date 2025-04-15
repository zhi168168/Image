#!/bin/bash

# 设置服务器信息
SERVER="root@112.124.43.20"
DEPLOY_PATH="/var/www/IMAGE0328"

echo "开始部署更新到 $SERVER:$DEPLOY_PATH..."

# 使用scp上传构建文件
echo "上传构建文件..."
scp -r dist/* $SERVER:$DEPLOY_PATH/

echo "部署完成！"
echo "图片处理工具已更新到版本1.3"
