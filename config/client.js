module.exports = {
    ip: "127.0.0.1",
    port: 7666,
    proxy: {
        test_udp: {
            type: "udp",
            remote_port: 1888,
            local_port: 1889,
            local_ip: "192.168.31.2",
        },
        test_tcp: {
            type: "tcp",
            remote_port: 1888,
            local_port: 1889,
            local_ip: "192.168.31.2",
        }
    }
}