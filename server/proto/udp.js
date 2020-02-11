const net = require('dgram');

module.exports = class Proto
{
    constructor(app)
    {
        this.app = app
        this.id_helper = Date.now()
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

        this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:add`);

        return proxy
    }

    run_proxy(proxy)
    {
        proxy.conns = {}
        proxy.server = net.createSocket('udp4');

        proxy.server.on("listening", () =>
        {
            this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:is listening`)
        })

        proxy.server.on('error', (e) =>
        {
            if (e.code == 'EADDRINUSE')
            {
                this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:is in use,try in 5s`);
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
            // this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:recv data from ${rinfo.address}:${rinfo.port}`)

            let conn = this.get_conn(proxy, rinfo)

            conn.count++

            this.app.send(proxy.client, "transport", proxy.type, conn.id, msg)

            if (conn.count % 1000 == 0)
            {
                this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:conn[${conn.id}]@${conn.domain} recved packet count:${conn.count}`)
            }
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

        let proxy = conn.proxy

        this.app.log(`proxy[${proxy.name}][${proxy.type}][${proxy.local_port}]: remote del conn[${conn.id}]`);
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

            this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:deleted because of client lost`);
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

        let timeout = 1000 * 10

        conn = {}
        conn.id = ++this.id_helper
        conn.count = 0
        conn.domain = domain
        conn.info = info
        conn.proxy = proxy
        conn.last_active = Date.now()

        conn.write = (buffer) =>
        {
            conn.last_active = Date.now()
            proxy.server.send(buffer, 0, buffer.length, info.port, info.address)
        }

        conn.destroy = (e) =>
        {
            conn.closed = true

            delete this.conns[domain]
            delete this.conns[conn.id]

            this.app.send(proxy.client, "del_conn", proxy.type, conn.id)

            if (e)
            {
                this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:conn[${conn.id}] close because of error:`, e);
            }
            else
            {
                this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:conn[${conn.id}] close`);
            }
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
                conn.destroy(new Error("long time not active socket"))
                return
            }

            setTimeout(check_timeout, timeout)
        }

        setTimeout(check_timeout, timeout)

        this.app.log(`proxy[${proxy.name}][udp][${proxy.remote_port}]:new conn[${conn.id}]@${domain}`);

        return conn
    }


}