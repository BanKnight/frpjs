module.exports = class Controller
{
    constructor(app)
    {
        this.app = app
        this.config = app.config
    }

    new_conn(proxy_name, ...args)
    {
        let proxy_info = this.config.proxy[proxy_name]

        if (proxy_info == null)
        {
            throw new Error(`unknown proxy[${proxy_name}]`)
        }

        let proto = this.app.proto[proxy_info.type]

        if (proto == null)
        {
            throw new Error(`unsupport proto type[${proxy_info.type}]`)
        }
        proto.new_conn(proxy_name, ...args)
    }

    /**
   * 收到客户端发上来的，要发给目标端口的数据
   */
    transport(proxy_type, ...args)
    {
        let proto = this.app.proto[proxy_type]

        if (proto == null)
        {
            throw new Error(`unsupport proto type[${proxy_type}]`)
        }

        proto.send_proxy(...args)
    }

    del_conn(proxy_type, ...args)
    {
        let proto = this.app.proto[proxy_type]

        if (proto == null)
        {
            throw new Error(`unsupport proto type[${proxy_type}]`)
        }

        proto.del_conn(...args)
    }
}