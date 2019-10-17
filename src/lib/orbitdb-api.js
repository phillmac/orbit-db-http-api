const Hapi = require('hapi')
const Boom = require('@hapi/boom')
const Http2 = require('http2')
const Susie = require('susie')

require('events').EventEmitter.defaultMaxListeners = 50 // Set warning higher then normal to handle many clients

class OrbitdbAPI {
  constructor (dbMan, peerMan, options) {
    const orbitdbAPIOptions = Object.assign({}, options.orbitDBAPI)

    const logger = Object.assign(
      {
        debug: function() {},
        info: function() {},
        warn: function() {},
        error: function() {}
      },
      options.logger,
      orbitdbAPIOptions.logger
    )

    if (orbitdbAPIOptions.apiDebug) {
      logger.info('Debug enabled')
    }

    const listener = Http2.createSecureServer(options.server.http2)
    this.server = new Hapi.Server(Object.assign(
        options.server.hapi,
        {listener}
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

    const comparisons = {
      ne: (a, b) => a !== b,
      eq: (a, b) => a === b,
      gt: (a, b) => a > b,
      lt: (a, b) => a < b,
      gte: (a, b) => a >= b,
      lte: (a, b) => a <= b,
      mod: (a, b, c) => a % b === c,
      range: (a, b, c) => Math.max(b, c) >= a && a >= Math.min(b, c),
      all: () => true
    }

    const dbManiddleware = fn =>
      async (request, h) => {
        const db = await dbMan.get(request.params.dbname)
        return Promise.resolve((fn(db, request, h)))
          .catch((err) => { throw err })
      }

    const rawIterator = (db, request, _h) =>
      db.iterator(request.payload).collect()

    const getRaw = (db, request, _h) =>
      db.get(request.params.item)

    const unpackContents = (contents) => {
      if (contents) {
        if (contents.map) {
          return contents.map((e) => {
            if (e.payload) return e.payload.value
            return e
          })
        } else if (contents.payload) {
          return contents.payload.value
        }
      }
      return contents
    }

    const addEventListener = (db, eventName, request, h) => {
      const eventMap = new Map(Object.entries({
        replicated: (address) =>
          h.event({ event: 'replicated', data: { address: address } }),
        replicate: (address) =>
          h.event({ event: 'replicate', data: { address: address } }),
        'replicate.progress': (address, hash, entry, progress, have) =>
          h.event({ event: 'replicate.progress', data: { address: address, hash: hash, entry: entry, progress: progress, have: have } }),
        load: (dbname) =>
          h.event({ event: 'load', data: { dbname: dbname } }),
        'load.progress': (address, hash, entry, progress, total) =>
          h.event({ event: 'load.progress', data: { address: address, hash: hash, entry: entry, progress: progress, total: total } }),
        ready: (dbname, heads) =>
          h.event({ event: 'ready', data: { dbname: dbname, heads: heads } }),
        write: (dbname, hash, entry) =>
          h.event({ event: 'write', data: { dbname: dbname, hash: hash, entry: entry } }),
        closed: (dbname) =>
          h.event({ event: 'closed', data: { dbname: dbname } })
      }))

      const eventCallback = eventMap.get(eventName)
      if (eventCallback) {
        db.events.on(eventName, eventCallback)
        const keepAlive = setInterval(() => h.event({ event: 'keep-alive' }), 10000)
        request.events.on('disconnect', () => {
          db.events.removeListener(eventName, eventCallback)
          clearInterval(keepAlive)
        })
      } else {
        if (options.orbitDBAPI.apiDebug) throw Boom.badRequest('Unrecognized event name: $(eventName)')
        throw Boom.badRequest('Unrecognized event name')
      }
    }

    Promise.resolve(this.server.register(Susie)).catch((err) => { throw err })
    this.server.route([
      {
        method: 'GET',
        path: '/dbs',
        handler: (_request, _h) => dbMan.dbList()
      },
      {
        method: ['POST', 'PUT'],
        path: '/db',
        handler: async (request, _h) => {
          const payload = request.payload
          const db = await dbMan.get(payload.dbname, payload)
          return dbMan.dbInfo(db)
        }
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}',
        handler: async (request, _h) => {
          const db = await dbMan.get(request.params.dbname, request.payload)
          return dbMan.dbInfo(db)
        }
      },
      {
        method: 'GET',
        path: '/db/{dbname}',
        handler: dbManiddleware(async (db, _request, _h) => dbMan.dbInfo(db))
      },
      {
        method: 'DELETE',
        path: '/db/{dbname}',
        handler: dbManiddleware(async (db, _request, _h) => {
          await peerMan.detachDB(db)
          await db.close()
          return {}
        })
      },
      {
        method: 'DELETE',
        path: '/db/{dbname}/{item}',
        handler: dbManiddleware(async (db, request, _h) => {
          if (db.del) {
            return { hash: await db.del(request.params.item) }
          } else if (db.remove) {
            return { hash: await db.remove(request.params.item) }
          } else {
            return Boom.methodNotAllowed(`DB type ${db.type} does not support removing data`,
              {
                dbname: db.dbname,
                dbtype: db.type
              })
          }
        })
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}/put',
        handler: dbManiddleware(async (db, request, _h) => {
          const params = request.payload

          if (db.type === 'keyvalue') {
            let key, value
            if (!params.key) {
              [key, value] = [Object.keys(params)[0], Object.values(params)[0]]
            } else {
              ({ key, value } = params)
            }
            return { hash: await db.put(key, value) }
          } else {
            return { hash: await db.put(params) }
          }
        })
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}/add',
        handler: dbManiddleware(async (db, request, _h) => {
          return { hash: await db.add(request.payload) }
        })
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}/inc',
        handler: dbManiddleware(async (db, request, _h) => {
          const incval = parseInt(request.payload ? request.payload.val || 1 : 1)
          return { hash: await db.inc(incval) }
        })
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}/inc/{val}',
        handler: dbManiddleware(async (db, request, _h) => {
          return { hash: await db.inc(parseInt(request.params.val || 1)) }
        })
      },
      {
        method: 'POST',
        path: '/db/{dbname}/query',
        handler: dbManiddleware(async (db, request, _h) => {
          logger.debug('Query reqest payload', request.payload)
          const qparams = request.payload
          const comparison = comparisons[qparams.comp || 'all']
          const query = (doc) => comparison(doc[qparams.propname || '_id'], ...qparams.values)
          return db.query(query)
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/iterator',
        handler: dbManiddleware(async (db, request, h) => {
          const raw = rawIterator(db, request, h)
          return raw.map((e) => Object.keys(e.payload.value)[0])
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/rawiterator',
        handler: dbManiddleware(async (db, request, h) => {
          return rawIterator(db, request, h)
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/raw/{item}',
        handler: dbManiddleware(async (db, request, h) => {
          return getRaw(db, request, h)
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/{item}',
        handler: dbManiddleware(async (db, request, h) => {
          const raw = getRaw(db, request, h)
          return unpackContents(raw)
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/all',
        handler: dbManiddleware(async (db, _request, _h) => {
          if (typeof db._query === 'function') {
            const contents = db._query({ limit: -1 })
            return contents.map((e) => Object.keys(e.payload.value)[0])
          } else {
            return unpackContents(db.all)
          }
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/index',
        handler: dbManiddleware(async (db, _request, _h) => db.index)
      },
      {
        method: 'GET',
        path: '/db/{dbname}/value',
        handler: dbManiddleware(async (db, _request, _h) => db.value)
      },
      {
        method: 'GET',
        path: '/identity',
        handler: (_request, _h) => dbMan.identity()
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}/access/write',
        handler: dbManiddleware(async (db, request, _h) =>
          {
            const result = await db.access.grant('write', request.payload.id)
            if (result === false) {
              return Boom.notImplemented('Access controller does not support setting write access')
            }
            return result
          }
        )
      },
      {
        method: 'GET',
        path: '/db/{dbname}/access/write/list',
        handler: dbManiddleware(async (db, _request, _h) => dbMan.dbWrite(db))
      },
      {
        method: 'GET',
        path: '/db/{dbname}/events/{eventname}',
        handler: dbManiddleware(async (db, request, h) => {
          const events = request.params.eventname.split(',')
          events.forEach((eventName) => addEventListener(db, eventName, request, h))
          return h.event({ event: 'registered', data: { eventnames: events } })
        })
      },

      {
        method: 'GET',
        path: '/db/{dbname}/peers',
        handler: dbManiddleware((db, _request, _h) => peerMan.getPeers(db))
      },

      {
        method: 'GET',
        path: '/peers',
        handler: (_request, _h) => peerMan.allPeers()
      },

      {
        method: 'GET',
        path: '/peers/searches',
        handler: (_request, _h) => peerMan.getSearches()
      },

      {
        method: 'POST',
        path: '/peers/searches/db/{dbname}',
        handler: dbManiddleware((db, request, _h) => peerMan.findDBPeers(db, request.payload))
      }

    ])
  }
}

module.exports = OrbitdbAPI
