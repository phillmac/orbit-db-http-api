const Logger = require('js-logger')

class DBManager {
  constructor (orbitDB,  peerMan) {
    const dbs = {}

    const findDB = (dbn) => {
      if (dbn in dbs) return dbs[dbn]
      for (const db of Object.values(dbs)) {
        if (dbn === db.id) {
          return db
        } else if (dbn === [db.address.root, db.address.path].join('/')) {
          return db
        }
      };
    }

    this.get = async (dbn, params) => {
      let db = findDB(dbn)
      if (db) {
        return db
      } else {
        Logger.info(`Opening db ${dbn}`)
        db = await orbitDB.open(dbn, params)
        Logger.info(`Loading db ${dbn}`)
        await db.load()
        Logger.info(`Loaded db ${db.dbname}`)
        dbs[db.dbname] = db
        return db
      }
    }

    this.dbRemove = async (dbn) => {
      const db = findDB(dbn)
      if (db) {
        await db.close()
        delete dbs[db.dbname]
        peerMan.removeDB(db)
        Logger.info(`Unloaded db ${db.dbname}`)
      }
    }

    this.dbs = () => Object.values(dbs)

    this.dbList = () => Object.keys(dbs).map((dbn) => dbInfo(dbn))

    const dbWrite = (db) => {
      return (
        db.access.write ||
                (typeof db.access.get === 'function' && db.access.get('write')) ||
                db.access._options.write ||
                'unavaliable'
      )
    }

  const canAppend = (writeList) => {
    if (orbitDB.identity.id in writeList) return true
    if (typeof writeList.has === 'function' && writeList.has(orbitDB.identity.id)) return true
    if (typeof writeList.includes === 'function' && writeList.includes(orbitDB.identity.id)) return true
    return false
  }


    this.dbWrite = (dbn) => {
      const db = findDB(dbn)
      if (!db) return {}
      return dbWrite(db)
    }

    const dbInfo = (dbn) => {
      const db = findDB(dbn)
      if (!db) return {}
      const write = dbWrite(db)
      const dbPeers = peerMan.getDBPeers(db)
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
        write: write,
        type: db.type,
        uid: db.uid,
        indexLength: db.index.length || Object.keys(db.index).length,
        accessControllerType: db.access.type || 'custom',
        peers: dbPeers,
        peerCount: dbPeers.length,
        capabilities: Object.keys( // TODO: cleanup this mess once tc39 object.fromEntries aproved
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

module.exports = DBManager
