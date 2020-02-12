const net = require('net');

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
        let proxy = { ...info, client: conn }

        this.proxy[info.name] = proxy
        this.port_proxy[info.remote_port] = proxy

        this.run_proxy(proxy)

        this.app.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:add`);

        return proxy
    }

    run_proxy(proxy)
    {
        proxy.server = net.createServer();

        proxy.server.on("listening", () =>
        {
            this.app.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:is listening`)
        })

        proxy.server.on('connection', (socket) =>
        {
            socket.setKeepAlive(true)

            socket.id = ++this.id_helper
            socket.proxy = proxy

            this.conns[socket.id] = socket

            this._on_new_conn(socket, proxy)
        })

        proxy.server.on('error', (e) =>
        {
            if (e.code == 'EADDRINUSE')
            {
                this.app.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:is in use,try in 5s`);
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

            this.app.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:deleted because of client lost`);
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

        this.app.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:new conn[${conn.id}]@${conn.localAddress}:${conn.localPort}`);

        conn.setTimeout(1000 * 1800);
        conn.on('timeout', () =>
        {
            conn.destroy(new Error("long time not active socket"));
        });

        conn.on('error', (err) =>
        {
            conn.last_error = err
        });
        conn.on('end', () =>
        {
            conn.end();
        });
        conn.on('close', (has_error) =>
        {
            if (!has_error)
            {
                this.app.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:conn[${conn.id}] close`);
            }
            else
            {
                this.app.log(`proxy[${proxy.name}][tcp][${proxy.remote_port}]:conn[${conn.id}] closed because of error:`, conn.last_error);
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