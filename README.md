# frp

# server
docker run --restart=always --network host -d -v ./server.js:/app/config/server.js --name frps banknight/frp server

# 客户端
docker run --restart=always --network host -d -v ./client.js:/app/config/client.js --name frpc banknight/frp client


