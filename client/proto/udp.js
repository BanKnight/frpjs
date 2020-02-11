const net = require('dgram');

module.exports = class Proto
{
    constructor(app)
    {
        this.app = app
        this.proxy = {}             //[name] = proxy
        this.conns = {}
    }

    add_proxy(info, conn)
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

        let conn = net.createSocket('udp4');

        conn.id = conn_id
        conn.proxy = proxy

        conn.bind(0)            //随机端口
        conn.connect(proxy.local_port, proxy.local_ip)

        conn.on('close', (has_error) =>
        {
            conn.closed = true

            if (!has_error)
            {
                console.log(`proxy[${proxy.name}][udp][${proxy.local_port}]:conn[${conn.id}] close`);
            }

            delete this.conns[conn.id]

            if (conn.force)
            {
                return
            }

            this.app.send("del_conn", proxy.type, conn.id)
        });

        conn.on("message", (data) =>
        {
            this.app.send("transport", proxy.type, conn.id, data)
        })

        this.conns[conn.id] = conn

        console.log(`proxy[${proxy.name}][udp][${proxy.local_port}]: make conn[${conn.id}]`);

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
        conn.close()
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

        conn.send(data)
    }

    /**
     * 客户端断开
     */
    lost(client)
    {
        for (let conn_id in this.conns)
        {
            let conn = this.conns[conn_id]

            conn.force = true
            conn.close()
        }

        this.conns = {}
    }
}