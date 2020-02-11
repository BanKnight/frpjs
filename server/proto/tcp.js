const net = require('net');

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

        console.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:add`);

        return proxy
    }

    run_proxy(proxy)
    {
        proxy.server = net.createServer();

        proxy.server.on("listening", () =>
        {
            console.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:is listening`)
        })

        proxy.server.on('connection', (socket) =>
        {
            socket.id = ++this.id_helper
            socket.proxy = proxy

            this.conns[socket.id] = socket

            this._on_new_conn(socket, proxy)
        })

        proxy.server.on('error', (e) =>
        {
            if (e.code == 'EADDRINUSE')
            {
                console.error(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:is in use,try in 5s`);
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

        proxy.server.listen(proxy.remote_port)
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

            console.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:deleted because of client lost`);
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

            delete this.conns[conn_id]
        }
    }

    _on_new_conn(conn, proxy)
    {
        this.app.send(proxy.client, "new_conn", proxy.name, conn.id)

        console.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:new conn[${conn.id}]`);

        conn.setTimeout(1000 * 3600);
        conn.on('timeout', () =>
        {
            conn.destroy(new Error("not active socket"));
        });

        conn.on('error', (err) =>
        {
            console.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:conn error":`, err);
        });
        conn.on('end', () =>
        {
            conn.end();
        });
        conn.on('close', (has_error) =>
        {
            if (!has_error)
            {
                console.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:conn[${conn.id}] close`);
            }

            delete this.conns[conn.id]

            if (!conn.force)
            {
                this.app.send(proxy.client, "del_conn", proxy.type, conn.id)
            }

            conn.destroy();
        });

        conn.on('data', (data) =>
        {
            this.app.send(proxy.client, "transport", proxy.type, conn.id, data)
        })

    }
}