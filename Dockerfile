FROM node:12-slim

ARG TZ='Asia/Shanghai'

ENV TZ ${TZ}

RUN ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo ${TZ} > /etc/timezone

WORKDIR /app

COPY package*.json ./

RUN npm install --registry=https://registry.npm.taobao.org

COPY . ./

ENTRYPOINT [ "node", "index.js" ]