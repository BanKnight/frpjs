# frp
一个用于内网穿透的工具，将拥有公共ip的服务器的数据转发到内网，协议支持tcp + udp

# 服务端
```
docker run --restart=always --network host -d -v ${PWD}/server.js:/app/config/server.js --name frps banknight/frp server
```
## 配置
参考：[server.js](https://github.com/BanKnight/frp/blob/master/config/server.js)
```js
module.exports = {
    port: 7666,                 //接收客户端
}
```
# 客户端
```
docker run --restart=always --network host -d -v ${PWD}/client.js:/app/config/client.js --name frpc banknight/frp client
```
## 配置
参考：[client.js](https://github.com/BanKnight/frp/blob/master/config/client.js)
```js
module.exports = {
    ip: "127.0.0.1",                        //公网服务器ip
    port: 7666,                             //公网服务器端口
    proxy: {                                //代理
        test_udp: {                         //代理名称，不可以出现重名
            type: "udp",                    //协议类型，目前只支持tcp 和 udp
            remote_port: 1888,              //公网服务器的转发端口
            local_port: 1889,               //转发到的内网服务器端口
            local_ip: "192.168.31.2",       //转发到的内网服务器地址
        },
        test_tcp: {
            type: "tcp",
            remote_port: 1888,
            local_port: 1889,
            local_ip: "192.168.31.2",
        }
    }
}
```

# 参考项目
[fatedier/frp](https://github.com/fatedier/frp)

