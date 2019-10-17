const isDefined = (arg) => arg !== undefined && arg !== null

class DBManager {
  constructor (orbitDB, getPeers, attachDB) {
    if (!isDefined(orbitDB)) { throw new Error('orbitDB is a required argument.') }

    const findDB = (dbn) => {
      if (dbn in orbitDB.stores) return orbitDB.stores[dbn]
      for (const db of Object.values(orbitDB.stores)) {
        if (dbn === db.id) {
          return db
        } else if (dbn === db.address.toString) {
          return db
        }
      }
    }

    this.get = async (dbn, params) => {
      let db = findDB(dbn)
      if (db) {
        return db
      } else {
        logger.info(`Opening db ${dbn}`)
        db = await orbitDB.open(dbn, params)
        logger.info(`Loading db ${dbn}`)
        await db.load()
        logger.info(`Loaded db ${db.dbname}`)
        orbitDB.stores[db.dbname] = db
        if (typeof attachDB === 'function') attachDB(db)
        return db
      }
    }

    this.dbs = () => Object.values(orbitDB.stores)

    this.dbList = () => Object.keys(orbitDB.stores).map((dbn) => dbInfo(dbn))

    const dbWrite = (db) => {
      return (
        (typeof db.access.write !== 'undefined' && db.access.write) ||
        (typeof db.access.get === 'function' && db.access.get('write')) ||
        (typeof db.access._options === 'object' && db.access._options.write) ||
        'undefined'
      )
    }

    this.dbWrite = dbWrite

    const canAppend = (writeList) => {
      if (orbitDB.identity.id in writeList) return true
      if (typeof writeList.has === 'function' && writeList.has(orbitDB.identity.id)) return true
      if (typeof writeList.includes === 'function' && writeList.includes(orbitDB.identity.id)) return true
      return false
    }

    const dbInfo = (dbn) => {
      const db = findDB(dbn)
      if (!db) return {}
      const write = dbWrite(db)
      const dbPeers = (typeof getPeers === 'function' && getPeers(db)) || []
      return {
        address: db.address,
        dbname: db.dbname,
        id: db.id,
        options: {
          create: db.options.create,
          indexBy: db.options.indexBy,
          localOnly: db.options.localOnly,
          maxHistory: db.options.maxHistory,
          overwrite: db.options.overwrite,
          path: db.options.path,
          replicate: db.options.replicate
        },
        canAppend: canAppend(write),
        type: db.type,
        uid: db.uid,
        indexLength: db.index.length || Object.keys(db.index).length,
        accessController: {
          type: db.access.type || 'custom',
          write: write,
          capabilities: db.access.capabilities,
          address: db.access.address
        },
        peers: dbPeers,
        peerCount: dbPeers.length,
        capabilities: Object.keys( // TODO: cleanup this mess once tc39 Object.fromEntries aproved, Nodejs version 12
          Object.assign({}, ...Object.entries({
            add: typeof db.add === 'function',
            get: typeof db.get === 'function',
            inc: typeof db.inc === 'function',
            iterator: typeof db.iterator === 'function',
            put: typeof db.put === 'function',
            query: typeof db.query === 'function',
            remove: typeof (db.del || db.remove) === 'function',
            value: typeof db.value === 'function'
          }).filter(([k, v]) => v).map(([k, v]) => ({ [k]: v }))
          )
        )
      }
    }

    this.dbInfo = dbInfo

    this.identity = () => {
      return orbitDB.identity
    }
  }
}

if (typeof module === 'object') module.exports = DBManager
