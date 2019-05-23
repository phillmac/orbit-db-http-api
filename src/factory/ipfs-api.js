const IpfsApi   = require('ipfs-http-client');
const OrbitDB   = require('orbit-db');
const DBManager = require('../lib/db-manager.js')
const OrbitApi  = require('../lib/orbitdb-api.js')


async function api_factory(ipfs_host, ipfs_port, orbitdb_dir, orbitdb_opts, server_opts) {
    let ipfs
    let orbitdb
    let dbm
    let orbitdb_api

    if (orbitdb_dir) orbitdb_opts = Object.assign({'directory': orbitdb_dir}, orbitdb_opts)
    ipfs        = new IpfsApi(ipfs_host, ipfs_port)
    orbitdb     = await OrbitDB.createInstance(ipfs, orbitdb_opts)
    dbm         = new DBManager(orbitdb)
    orbitdb_api = new OrbitApi(dbm, server_opts)

    return orbitdb_api
}

module.exports = api_factory
