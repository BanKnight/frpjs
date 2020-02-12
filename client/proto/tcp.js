const net = require('net');

module.exports = class Proto
{
    constructor(app)
    {
        this.app = app
        this.proxy = {}             //[name] = proxy
        this.conns = {}
    }

    add_proxy(info)
    {
        let exist = this.proxy[info.name]
        if (exist)
        {
            throw new Error(`proxy[${info.name}] already exist`)
        }

        exist = { ...info }

        this.proxy[info.name] = exist

        return exist
    }

    new_conn(proxy_name, conn_id)
    {
        let proxy = this.proxy[proxy_name]

        let conn = new net.Socket()

        conn.id = conn_id
        conn.standby = []
        conn.proxy = proxy

        conn.connect(proxy.local_port, proxy.local_ip, () =>
        {
            this._on_new_conn(conn, proxy)
        })

        conn.on('error', (err) =>
        {
            this.app.log(`proxy[${proxy.name}][tcp][${proxy.local_port}]：make conn[${conn.id}] error:`, err);
        });
        conn.on('end', () =>
        {
            conn.end();
        });

        conn.on('close', (has_error) =>
        {
            if (!has_error)
            {
                this.app.log(`proxy[${proxy.name}][tcp][${proxy.local_port}]:conn[${conn.id}] close`);
            }

            delete this.conns[conn.id]

            if (conn.force)
            {
                return
            }

            this.app.send("del_conn", proxy.type, conn.id)

            conn.destroy();
        });

        this.conns[conn.id] = conn
    }

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
     * 发给目标
     */
    send_proxy(conn_id, data)
    {
        let conn = this.conns[conn_id]

        if (conn == null)
        {
            return
        }

        if (conn.standby)
        {
            conn.standby.push(data)
        }
        else
        {
            conn.write(data)
        }
    }

    lost()
    {
        for (let conn_id in this.conns)
        {
            let conn = this.conns[conn_id]

            conn.force = true
            conn.destroy()
        }

        this.conns = {}
    }

    _on_new_conn(conn, proxy)
    {
        conn.setKeepAlive(true)

        for (let data of conn.standby)
        {
            conn.write(data)
        }

        conn.standby = null

        conn.on('data', (data) =>
        {
            this.app.send("transport", proxy.type, conn.id, data)
        })

        this.app.log(`proxy[${proxy.name}][tcp][${proxy.local_port}]:make a new conn[${conn.id}]`);
    }
}