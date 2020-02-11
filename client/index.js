const path = require('path');
const net = require('net');
const buffer_op = require("buffer-op")
const awesome = require("awesome-async")

const utils = require('../utils')

const box = buffer_op.box

module.exports = class Application
{
    constructor()
    {
        this.id_helper = 1
        this.session = 0

        this.config = null
        this.conn = null
        this.proto = {}
    }

    run()
    {
        this.load_config()

        this.load_proto()

        this.load_controler()

        this.start_proto()

        this.start_proxy()

        this.connect(this.config.ip, this.config.port)
    }

    load_config()
    {
        this.config = require("../config/client")
    }

    load_proto()
    {
        const all = utils.load_folder(path.join(__dirname, "proto"))

        this.proto_classes = all
    }

    load_controler()
    {
        const Controler = require("./controler")

        this.controler = new Controler(this)
    }

    start_proto()
    {
        for (let name in this.proto_classes)
        {
            let proto = this.proto_classes[name]

            proto = new proto(this)

            this.proto[name] = proto
        }
    }

    start_proxy()
    {
        let config = this.config.proxy

        for (let name in config)
        {
            let proxy_config = config[name]

            proxy_config.name = name

            let proto = this.proto[proxy_config.type]
            if (proto == null)
            {
                console.error(`not suported type in proxy[${proxy_config.name}]`)
                continue
            }

            proto.add_proxy(proxy_config)
        }
    }

    connect(ip, port)
    {
        const conn = new net.Socket();

        conn.connect(port, ip, () =>
        {
            console.log('成功连接到服务器', ip, port);

            conn.out_stream = new buffer_op.Stream()
            conn.out_writer = new buffer_op.Writer(conn.out_stream)

            this.conn = conn

            this._after_connect(conn)
        });

        conn.on('error', (err) =>
        {
            console.log('与客户端通信过程中发生错误，错误码为%s', err);
        });
        conn.on('end', () =>
        {
            conn.end();
        });

        conn.on('close', (has_error) =>       
        {
            if (!has_error)
            {
                console.log(`和${ip}:${port}的连接断开,5s 后重连`);
            }

            if (!conn.connecting)
            {
                this._on_lost()
            }

            this.conn = null
            conn.destroy();

            this.reconnect()

        });
    }

    reconnect()
    {
        setTimeout(() =>
        {
            this.connect(this.config.ip, this.config.port);

        }, 5000)
    }

    _after_connect(conn)
    {
        conn.on('end', function()           
        {
            conn.end();
        });

        let decoder = {
            wait: 0,
            in_buffers: [],
            in_buffer_bytes: 0,
            in_stream: new buffer_op.Stream(),
        }

        let fetch = function(count)
        {
            if (decoder.in_buffer_bytes < count)
            {
                return
            }
            let copied_count = 0
            let buffer = Buffer.allocUnsafe(count)

            while (copied_count < count)
            {
                let first = decoder.in_buffers[0]
                let this_count = first[1].byteLength - first[0]
                let this_copy_count = (this_count + copied_count) <= count ? this_count : count - copied_count

                first[1].copy(buffer, copied_count, first[0], first[0] + this_copy_count)

                copied_count += this_copy_count

                if (this_count == this_copy_count)      //删除掉第一个
                {
                    decoder.in_buffers.shift()
                }
                else
                {
                    first[0] += this_copy_count
                }
            }
            decoder.in_buffer_bytes -= count

            return buffer
        }

        conn.decoder = decoder

        //第一个参数必然是发送方的进程id
        conn.on("data", (data) =>          
        {
            // console.log(`recv buffer:${data.byteLength}`)

            decoder.in_buffers.push([0, Buffer.from(data)])
            decoder.in_buffer_bytes += data.byteLength

            while (true)
            {
                if (decoder.wait == 0)
                {
                    let buffer = fetch(4)
                    if (buffer == null)
                    {
                        break
                    }
                    decoder.wait = buffer.readInt32LE(0)            //读出长度

                    // console.log("read head:" + decoder.wait)
                }
                else if (decoder.wait > 0 && decoder.wait < 1024 * 1024 * 24)
                {
                    let buffer = fetch(decoder.wait)
                    if (buffer == null)
                    {
                        break
                    }
                    decoder.wait = 0

                    let [method, ...args] = box.unpack(buffer)

                    this._dispatch(method, ...args)
                }
                else
                {
                    conn.destroy(new Error("wrong packet length"))
                    break
                }
            }
        })

        this.send("add_proxy", this.config.proxy)
    }

    _on_lost()
    {
        for (let type in this.proto)
        {
            let proto = this.proto[type]

            proto.lost()
        }
    }

    _dispatch(method, ...args)
    {
        switch (method)
        {
            case "i": this._on_invoke(...args)
                break
            case "c": this._on_call(...args)
                break
            case "r": this._on_resp(...args)
                break
        }
    }

    _on_invoke(func_name, ...args)
    {
        try
        {
            this.controler[func_name](...args)
        }
        catch (e)
        {
            console.error(e.stack)
        }
    }

    async _on_call(session, func_name, ...args)
    {
        try
        {
            const ret = await this.controler[func_name](...args)

            this.resp(session, null, ret)
        }
        catch (e)
        {
            this.resp(session, e)
        }
    }

    _on_resp(session, err, ret)
    {
        awesome.wake(`__c${session}`, [err, ret])
    }

    send(func_name, ...args)
    {
        let conn = this.conn

        let buffer = this.pack(conn, "i", func_name, ...args)

        conn.write(buffer)
    }

    async call(func_name, ...args)
    {
        let conn = this.conn

        let session = ++this.session

        let buffer = this.pack(conn, "c", session, func_name, ...args)

        conn.write(buffer)

        let [err, ret] = await awesome.wait(`__c${session}`)
        if (err)
        {
            throw err
        }

        return ret
    }

    resp(session, err, ret)
    {
        let conn = this.conn

        let buffer = this.pack(conn, "r", session, err, ret)

        conn.write(buffer)
    }

    pack(conn, ...args)
    {
        conn.out_writer.append_int32(0)           //占据位置

        let old_offset = conn.out_writer.offset

        box.pack_any(conn.out_writer, args)

        conn.out_writer.replace_int32(conn.out_writer.offset - old_offset)

        let buffer = conn.out_stream.to_buffer()

        conn.out_stream.clear()

        return buffer
    }
}
