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

    heart_beat()
    {

    }

    add_proxy(conn, config)
    {
        let is_ok = true

        for (let name in config)
        {
            let proxy_config = config[name]

            proxy_config.name = name

            let proto = this.app.proto[proxy_config.type]
            if (proto == null)
            {
                this.app.log(`not suported type in proxy[${proxy_config.name}]`)
                is_ok = false
                break
            }
            if (proto.proxy[name])
            {
                this.app.log(`proxy[${name}][${proxy_config.type}][${proxy_config.remote_port}] is already existed`)
                is_ok = false
                break
            }

            if (proto.port_proxy[proxy_config.remote_port])
            {
                this.app.log(`proxy[${name}][${proxy_config.type}][${proxy_config.remote_port}] confict port`)
                is_ok = false
                break
            }
        }
        if (!is_ok)
        {
            return false
        }

        for (let name in config)
        {
            let proxy_config = config[name]

            let proto = this.app.proto[proxy_config.type]

            proto.add_proxy(proxy_config, conn)
        }

        return true
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