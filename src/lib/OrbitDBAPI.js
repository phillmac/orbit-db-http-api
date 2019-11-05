const Hapi = require('hapi')
const Boom = require('@hapi/boom')
const Http = require('http')
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


    const listener = options.server.forceHTTP1 ?
    Http.createServer(options.server.http) :
    Http2.createSecureServer(options.server.http2)

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

    const dbMiddleware = fn =>
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
          h.event({event: 'replicated', data: {address}}),
        replicate: (address) =>
          h.event({event: 'replicate', data: {address}}),
        'replicate.progress': (address, hash, entry, progress, have) =>
          h.event({event: 'replicate.progress', data:{address,hash,entry,progress,have}}),
        load: (dbname) =>
          h.event({ event: 'load', data: {dbname}}),
        'load.progress': (address, hash, entry, progress, total) =>
          h.event({event: 'load.progress', data: {address, hash, entry, progress, total}}),
        ready: (dbname, heads) =>
          h.event({event: 'ready', data: {dbname, heads}}),
        write: (dbname, hash, entry) =>
          h.event({event: 'write', data: {dbname, hash, entry}}),
        closed: (dbname) =>
          h.event({event: 'closed', data: {dbname}}),
        peer: (peer) =>
          h.event({event: 'peer', data: {peer}}),
        'search.complete': (dbname, peers) => {
          h.event({event: 'search.complete', data: {dbname, peers}})
        }
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
        if (options.orbitDBAPI.apiDebug) throw Boom.badRequest(`Unrecognized event name: ${eventName}`)
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
        path: '/dbs/announce',
        handler: (_request, _h) => {
          peerMan.announceDBs()
          return {}
        }
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
          const payload = request.payload
          const db = await dbMan.get(request.params.dbname, payload)
          if (!db) { //TODO: add docs
            return {}
          }
          return dbMan.dbInfo(db)
        }
      },
      {
        method: 'GET',
        path: '/db/{dbname}',
        handler: dbMiddleware(async (db, _request, _h) => dbMan.dbInfo(db))
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}/announce',
        handler: dbMiddleware(async (db, _request, _h) => {
          peerMan.announceDB(db)
          return {}
        })
      },
      {
        method: 'DELETE',
        path: '/db/{dbname}',
        handler: dbMiddleware(async (db, _request, _h) => {
          await peerMan.removeDB(db)
          await db.close()
          return {}
        })
      },
      {
        method: 'DELETE',
        path: '/db/{dbname}/{item}',
        handler: dbMiddleware(async (db, request, _h) => {
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
        handler: dbMiddleware(async (db, request, _h) => {
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
        handler: dbMiddleware(async (db, request, _h) => {
          return { hash: await db.add(request.payload) }
        })
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}/inc',
        handler: dbMiddleware(async (db, request, _h) => {
          const incval = parseInt(request.payload && request.payload.val)
          return { hash: await db.inc(incval) }
        })
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}/inc/{val}',
        handler: dbMiddleware(async (db, request, _h) => {
          return { hash: await db.inc(parseInt(request.params.val))}
        })
      },
      {
        method: 'POST',
        path: '/db/{dbname}/query',
        handler: dbMiddleware(async (db, request, _h) => {
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
        handler: dbMiddleware(async (db, request, h) => {
          const raw = rawIterator(db, request, h)
          return raw.map((e) => Object.keys(e.payload.value)[0])
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/rawiterator',
        handler: dbMiddleware(async (db, request, h) => {
          return rawIterator(db, request, h)
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/raw/{item}',
        handler: dbMiddleware(async (db, request, h) => {
          return JSON.stringify(getRaw(db, request, h))
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/{item}',
        handler: dbMiddleware(async (db, request, h) => {
          const raw = getRaw(db, request, h)
          return JSON.stringify(unpackContents(raw))
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/all',
        handler: dbMiddleware(async (db, _request, _h) => {
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
        handler: dbMiddleware(async (db, _request, _h) => db.index)
      },
      {
        method: 'GET',
        path: '/db/{dbname}/value',
        handler: dbMiddleware(async (db, _request, _h) => db.value)
      },
      {
        method: 'GET',
        path: '/identity',
        handler: (_request, _h) => dbMan.identity()
      },
      {
        method: ['POST', 'PUT'],
        path: '/db/{dbname}/access/write',
        handler: dbMiddleware(async (db, request, _h) =>
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
        handler: dbMiddleware(async (db, _request, _h) => dbMan.dbWrite(db))
      },
      {
        method: 'GET',
        path: '/db/{dbname}/events/{eventname}',
        handler: dbMiddleware(async (db, request, h) => {
          const events = request.params.eventname.split(',')
          events.forEach((eventName) => addEventListener(db, eventName, request, h))
          return h.event({ event: 'registered', data: { eventnames: events } })
        })
      },
      {
        method: 'GET',
        path: '/db/{dbname}/peers',
        handler: dbMiddleware((db, _request, _h) => peerMan.getPeers(db))
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
        handler: dbMiddleware((db, request, _h) => peerMan.findPeers(db, request.payload))
      },
      {
        method: 'POST',
        path: '/peers/searches/peer/{peerID}',
        handler: (request, _h) => peerMan.dhtFindPeer(request.params.peerID)
      }
    ])
  }
}

module.exports = OrbitdbAPI
