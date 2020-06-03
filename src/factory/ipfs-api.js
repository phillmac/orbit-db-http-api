const IpfsApi = require('ipfs-http-client')
const OrbitDBApi = require('../lib/OrbitDBAPI.js')
const getManagers = require('./managers.js')

async function apiFactory (options) {
  const ipfs = new IpfsApi(options.ipfs)
  const orbitDBAPI = new OrbitDBApi(await getManagers(ipfs, options), options)

  return orbitDBAPI
}

module.exports = apiFactory
