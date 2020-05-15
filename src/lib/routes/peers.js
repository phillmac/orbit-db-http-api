
module.exports = function (managers, options, _logger) {
  const dbMan = managers.dbManager
  const peerMan = managers.peerManager
  const dbMiddleware = require('../middleware/dbMiddleware.js')(options.orbitDBAPI.apiDebug, dbMan)

  return [
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
  ]
}
