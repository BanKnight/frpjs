const fs = require("fs")
const path = require("path")

exports.load_folder = function(root)
{
    let ret = {}
    let files = fs.readdirSync(root)

    for (let file of files)
    {
        let whole = path.join(root, file)

        let name = path.basename(file, path.extname(file))

        ret[name] = require(whole)
    }

    return ret
}