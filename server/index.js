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
        this.clients = {}
        this.proto = {}
    }

    run()
    {
        this.load_config()

        this.load_proto()

        this.load_controler()

        this.start_proto()

        this.listen(this.config.port)
    }

    load_config()
    {
        this.config = require("../config/server")
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

    listen(port)
    {
        const server = net.createServer();

        server.on("listening", () =>
        {
            console.log(`listening on`, port)
        })

        server.on('connection', (socket) =>
        {
            socket.id = this.id_helper++
            socket.out_stream = new buffer_op.Stream()
            socket.out_writer = new buffer_op.Writer(socket.out_stream)

            this._on_new_conn(socket)
        });

        server.listen(port);
    }

    _on_new_conn(conn)
    {
        this.clients[conn.id] = conn

        console.log('新的客户端已经连接到服务器');

        conn.setTimeout(1000 * 3600 * 8);
        conn.on('timeout', () =>
        {
            conn.destroy(new Error("not active socket"));
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
            if (has_error)
            {
                console.log('由于一个错误导致socket连接被关闭');
            }
            else
            {
                console.log('socket连接正常关闭');
            }

            delete this.clients[conn.id]

            this._on_lost(conn)

            conn.destroy();
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

                    this._dispatch(conn, method, ...args)
                }
                else
                {
                    conn.destroy(new Error("wrong packet length"))
                    break
                }
            }
        })
    }

    _on_lost(conn)
    {
        for (let type in this.proto)
        {
            let proto = this.proto[type]

            proto.lost(conn)
        }
    }

    _dispatch(conn, method, ...args)
    {
        switch (method)
        {
            case "i": this._on_invoke(conn, ...args)
                break
            case "c": this._on_call(conn, ...args)
                break
            case "r": this._on_resp(conn, ...args)
                break
        }
    }

    _on_invoke(conn, func_name, ...args)
    {
        try
        {
            this.controler[func_name](conn, ...args)
        }
        catch (e)
        {
            console.error(e.stack)
        }
    }

    async _on_call(conn, session, func_name, ...args)
    {
        try
        {
            const ret = await this.controler[func_name](...args)

            this.resp(conn, session, null, ret)
        }
        catch (e)
        {
            this.resp(conn, session, e)
        }
    }

    _on_resp(conn, session, err, ret)
    {
        awesome.wake(`__c${session}`, [err, ret])
    }

    send(conn, func_name, ...args)
    {
        let buffer = this.pack(conn, "i", func_name, ...args)

        conn.write(buffer)
    }

    async call(conn, func_name, ...args)
    {
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

    resp(conn, session, err, ret)
    {
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
