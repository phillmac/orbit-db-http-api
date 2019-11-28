const fs = require('fs')

module.exports = function (managers, options, logger) {
  let routes = []

  fs.readdirSync(__dirname)
    .filter(file => file !== 'index.js')
    .forEach(file => {
      routes = routes.concat(require(`./${file}`)(managers, options, logger))
    })
  return routes
}
