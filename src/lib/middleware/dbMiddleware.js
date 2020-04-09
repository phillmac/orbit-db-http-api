const Boom = require('@hapi/boom')

module.exports = (apiDebug, dbMan) => {
  return fn =>
    async (request, h) => {
      const db = dbMan.get(request.params.dbname)
      if (db === null) {
        if (apiDebug) throw Boom.notFound(`DB ${request.params.dbname} not found`)
        throw Boom.notFound('DB not found')
      }
      return Promise.resolve(fn(db, request, h))
        .catch((err) => { throw err })
    }
}
