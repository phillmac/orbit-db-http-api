const Hapi = require('hapi')
const Http = require('http')
const Http2 = require('http2')
const Susie = require('susie')

require('events').EventEmitter.defaultMaxListeners = 50 // Set warning higher then normal to handle many clients

class OrbitdbAPI {
  constructor (managers, options) {
    const orbitdbAPIOptions = Object.assign({}, options.orbitDBAPI)

    const logger = Object.assign(
      {
        debug: function () {},
        info: function () {},
        warn: function () {},
        error: function () {}
      },
      options.logger,
      orbitdbAPIOptions.logger
    )

    if (orbitdbAPIOptions.apiDebug) {
      logger.info('Debug enabled')
    }

    const listener = options.server.forceHTTP1
      ? Http.createServer(options.server.http)
      : Http2.createSecureServer(options.server.http2)

    this.server = new Hapi.Server(Object.assign(
      options.server.hapi,
      { listener }
    ))

    this.server.ext('onPreResponse', (request, h) => {
      const response = request.response
      if (!response.isBoom) {
        return h.continue
      }
      logger.error(response)
      if (options.orbitDBAPI.apiDebug) {
        response.output.payload.message = String(response)
      }
      return response
    })

    Promise.resolve(this.server.register(Susie)).catch((err) => { throw err })
    this.server.route(require('./routes')(managers, options, logger))
  }
}

module.exports = OrbitdbAPI
