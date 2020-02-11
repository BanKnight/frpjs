let file = process.argv[2] || "server"
let App = require(`./${file}`)

const app = new App()

app.run()
