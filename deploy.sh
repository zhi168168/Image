#!/bin/bash

# 定义服务器信息
SERVER_IP="14.103.203.205"
SERVER_USER="root"
SERVER_DIR="/var/www/image"
NGINX_CONF_DIR="/etc/nginx/sites-available"

echo "开始部署..."

# 在服务器上创建目录（如果不存在）
echo "创建服务器目录..."
ssh ${SERVER_USER}@${SERVER_IP} "mkdir -p ${SERVER_DIR}"

# 上传构建好的文件
echo "上传项目文件..."
scp -r ./dist/* ${SERVER_USER}@${SERVER_IP}:${SERVER_DIR}/

# 检查Nginx是否安装，如果未安装则安装
echo "检查并安装Nginx（如果需要）..."
ssh ${SERVER_USER}@${SERVER_IP} "if ! command -v nginx &> /dev/null; then apt-get update && apt-get install -y nginx; fi"

# 确保Nginx配置目录存在
echo "创建Nginx配置目录..."
ssh ${SERVER_USER}@${SERVER_IP} "mkdir -p ${NGINX_CONF_DIR} /etc/nginx/sites-enabled"

# 上传Nginx配置文件
echo "上传Nginx配置文件..."
scp ./image.conf ${SERVER_USER}@${SERVER_IP}:${NGINX_CONF_DIR}/image.conf

# 建立软链接到sites-enabled
echo "启用站点配置..."
ssh ${SERVER_USER}@${SERVER_IP} "ln -sf ${NGINX_CONF_DIR}/image.conf /etc/nginx/sites-enabled/ || echo '软链接创建失败，可能已存在'"

# 重启Nginx服务
echo "测试Nginx配置并重启服务..."
ssh ${SERVER_USER}@${SERVER_IP} "nginx -t && systemctl restart nginx || service nginx restart"

# 配置防火墙（如果需要）
echo "配置防火墙规则..."
ssh ${SERVER_USER}@${SERVER_IP} "ufw allow 4115/tcp || echo '请手动配置防火墙开放4115端口'"

echo "部署完成！应用程序应该可以通过 http://${SERVER_IP}:4115 访问"