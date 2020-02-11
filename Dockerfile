FROM node:12-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --registry=https://registry.npm.taobao.org

COPY * ./

ENTRYPOINT [ "node", "index.js" ]