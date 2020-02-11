let file = process.argv[2] || "server"
let App = require(`./${file}`)

const app = new App()

console.log("running as", file)

app.run()

setInterval(() =>
{

}, 2)
