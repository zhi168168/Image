#!/bin/bash

echo "开始部署..."

# 定义变量
SERVER="112.124.43.20"
DEPLOY_PATH="/var/www/projectUpdate"
SSH_USER="root"

# 构建项目
echo "开始构建项目..."
rm -rf dist/
npm run build || {
    echo "构建失败"
    exit 1
}

# 压缩构建文件
echo "压缩构建文件..."
tar -czf dist.tar.gz dist/ || {
    echo "压缩失败"
    exit 1
}

# 传输到服务器
echo "传输文件到服务器..."
scp dist.tar.gz root@${SERVER}:${DEPLOY_PATH}/ || {
    echo "文件传输失败"
    exit 1
}

# SSH到服务器执行部署
echo "在服务器上执行部署..."
ssh -t root@${SERVER} "
    cd ${DEPLOY_PATH} && \
    tar -xzf dist.tar.gz && \
    rm dist.tar.gz && \
    mv dist/* . && \
    rm -rf dist/ && \
    chown -R www-data:www-data . && \
    chmod -R 755 . && \
    
    # 创建新的 nginx 配置
    echo 'server {
        listen 3333;
        server_name localhost;
        root ${DEPLOY_PATH};
        index index.html;
        location / {
            try_files \$uri \$uri/ /index.html;
        }
    }' > /etc/nginx/sites-available/projectUpdate && 
\
    
    # 创建符号链接（如果不存在）
    ln -sf /etc/nginx/sites-available/projectUpdate 
/etc/nginx/sites-enabled/ && \
    
    # 测试并重启 nginx
    nginx -t && \
    systemctl restart nginx
"

# 清理本地临时文件
echo "清理本地临时文件..."
rm dist.tar.gz

echo "部署完成"
