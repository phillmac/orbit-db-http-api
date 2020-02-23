const Boom = require('@hapi/boom')

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

module.exports = function (managers, options, logger) {
  const dbMan = managers.dbManager
  const peerMan = managers.peerManager
  const dbMiddleware = require('../middleware/dbMiddleware.js')(dbMan)

  const addDBEventListener = (db, eventName, request, h) => {
    const eventMap = new Map(Object.entries({
      replicated: (address) =>
        h.event({ event: 'replicated', data: { address } }),
      replicate: (address) =>
        h.event({ event: 'replicate', data: { address } }),
      'replicate.progress': (address, hash, entry, progress, have) =>
        h.event({ event: 'replicate.progress', data: { address, hash, entry, progress, have } }),
      load: (address, heads) =>
        h.event({ event: 'load', data: { address, heads } }),
      'load.progress': (address, hash, entry, progress, total) =>
        h.event({ event: 'load.progress', data: { address, hash, entry, progress, total } }),
      ready: (address, heads) =>
        h.event({ event: 'ready', data: { address, heads } }),
      write: (address, hash, entry) =>
        h.event({ event: 'write', data: { address, hash, entry } }),
      closed: (address) =>
        h.event({ event: 'closed', data: { address } }),
      peer: (peer) =>
        h.event({ event: 'peer', data: { peer } }),
      'search.complete': (address, peers) => {
        h.event({ event: 'search.complete', data: { address, peers } })
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

  return [
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
        if (!db) { // TODO: add docs
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
        return { hash: await db.inc(parseInt(request.params.val)) }
      })
    },
    {
      method: 'POST',
      path: '/db/{dbname}/query',
      handler: dbMiddleware(async (db, request, _h) => {
        logger.debug('Query reqest payload', request.payload)
        const qparams = request.payload
        if (process.env('DEBUG.QUERY')) {
          logger.debug(JSON.stringify(qparams, null, 2))
        }
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
      method: ['POST', 'PUT'],
      path: '/db/{dbname}/access/write',
      handler: dbMiddleware(async (db, request, _h) => {
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
      path: '/db/{dbname}/events/{eventnames}',
      handler: dbMiddleware(async (db, request, h) => {
        const eventnames = request.params.eventnames
        const events = typeof eventnames === 'string' ? eventnames.split(',') : eventnames
        events.forEach((eventName) => addDBEventListener(db, eventName, request, h))
        return h.event({ event: 'registered', data: { events } })
      })
    },
    {
      method: 'GET',
      path: '/db/{dbname}/peers',
      handler: dbMiddleware((db, _request, _h) => peerMan.getPeers(db))
    }
  ]
}
