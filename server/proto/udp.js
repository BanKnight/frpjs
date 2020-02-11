const net = require('dgram');

module.exports = class Proto
{
    constructor(app)
    {
        this.app = app
        this.id_helper = 0
        this.proxy = {}             //[name] = proxy
        this.port_proxy = {}        //
        this.conns = {}
    }

    add_proxy(info, conn)
    {
        let proxy = this.proxy[info.name]

        if (proxy)
        {
            throw new Error(`proxy[${info.name}] already exist`)
        }

        let exist_port = this.port_proxy[info.remote_port]
        if (exist_port)
        {
            throw new Error(`proxy[${info.name}] remote port[${info.remote_port}] has already exist`)
        }

        proxy = { ...info, client: conn }

        this.proxy[info.name] = proxy
        this.port_proxy[info.remote_port] = proxy

        this.run_proxy(proxy)

        console.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:add`);

        return proxy
    }

    run_proxy(proxy)
    {
        proxy.conns = {}
        proxy.server = net.createSocket('udp4');

        proxy.server.on("listening", () =>
        {
            console.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:is listening`)
        })

        proxy.server.on('error', (e) =>
        {
            if (e.code == 'EADDRINUSE')
            {
                console.error(`proxy[${proxy.name}][udp][${proxy.remote_port}]:is in use,try in 5s`);
            }

            if (proxy.server.force)
            {
                return
            }

            setTimeout(() =>
            {
                this.run_proxy(proxy)
            }, 5000)
        });

        proxy.server.on("message", (msg, rinfo) =>
        {
            // console.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:recv data from ${rinfo.address}:${rinfo.port}`)

            let conn = this.get_conn(proxy, rinfo)

            this.app.send(proxy.client, "transport", proxy.type, conn.id, msg)
        })

        proxy.server.bind(proxy.remote_port)
    }

    /**
   * 客户端那边的连接断开，反映到这里
   */
    del_conn(conn_id)
    {
        let conn = this.conns[conn_id]

        if (conn == null)
        {
            return
        }

        conn.force = true
        conn.destroy()
    }

    /**
     * 发给用户
     */
    send_proxy(conn_id, data)
    {
        let conn = this.conns[conn_id]

        if (conn == null)
        {
            return
        }

        conn.write(data)
    }

    /**
     * 客户端断开
     */
    lost(client)
    {
        for (let name in this.proxy)
        {
            let proxy = this.proxy[name]

            if (proxy.client != client)
            {
                continue
            }

            proxy.server.force = true
            proxy.server.close()

            delete this.proxy[name]
            delete this.port_proxy[proxy.remote_port]

            console.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:deleted because of client lost`);
        }

        for (let conn_id in this.conns)
        {
            let conn = this.conns[conn_id]

            let proxy = conn.proxy

            if (this.proxy[proxy.name] != null)
            {
                continue
            }

            conn.force = true
            conn.destroy()
        }
    }

    get_conn(proxy, info)
    {
        let domain = `${proxy.name}://${info.address}:${info.port}`

        let conn = this.conns[domain]

        if (conn)
        {
            conn.last_active = Date.now()

            return conn
        }

        let timeout = 1000 * 3600

        conn = {}
        conn.id = ++this.id_helper
        conn.domain = domain
        conn.info = info
        conn.proxy = proxy
        conn.last_active = Date.now()

        conn.write = (buffer) =>
        {
            conn.last_active = Date.now()
            proxy.server.send(buffer, 0, buffer.length, info.port, info.address)
        }

        conn.destroy = () =>
        {
            conn.closed = true

            delete this.conns[domain]
            delete this.conns[conn.id]

            this.app.send(proxy.client, "del_conn", proxy.type, conn.id)
        }

        this.conns[domain] = conn
        this.conns[conn.id] = conn

        this.app.send(proxy.client, "new_conn", proxy.name, conn.id)

        let check_timeout = () =>
        {
            if (conn.is_closed)
            {
                return
            }

            let now = Date.now()

            if (now - conn.last_active >= timeout)
            {
                conn.force = true
                conn.destroy()
                return
            }

            setTimeout(check_timeout, timeout)
        }

        return conn
    }


}