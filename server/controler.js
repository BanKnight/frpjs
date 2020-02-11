/**
 * 处理cs之间的通讯
 */
module.exports = class Controller
{
    constructor(app)
    {
        this.app = app
        this.config = app.config
    }

    add_proxy(conn, config)
    {
        for (let name in config)
        {
            let proxy_config = config[name]

            proxy_config.name = name

            let proto = this.app.proto[proxy_config.type]
            if (proto == null)
            {
                console.error(`not suported type in proxy[${proxy_config.name}]`)
                continue
            }

            proto.add_proxy(proxy_config, conn)
        }
    }

    /**
     * 收到客户端发上来的，要发给用户端的数据
     */
    transport(conn, proxy_type, ...args)
    {
        let proto = this.app.proto[proxy_type]

        if (proto == null)
        {
            throw new Error(`unsupport proto type[${proxy_type}]`)
        }

        proto.send_proxy(...args)
    }

    del_conn(conn, proxy_type, ...args)
    {
        let proto = this.app.proto[proxy_type]

        if (proto == null)
        {
            throw new Error(`unsupport proto type[${proxy_type}]`)
        }

        proto.del_conn(...args)
    }
}