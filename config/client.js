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