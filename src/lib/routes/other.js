module.exports = function (managers, options, logger) {
  const dbMan = managers.dbManager
  const peerMan = managers.peerManager

  return [
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
      method: 'GET',
      path: '/identity',
      handler: (_request, _h) => dbMan.identity()
    },
    {
      method: 'GET',
      path: '/pending',
      handler: (_request, _h) => {
        return {
          open: dbMan.pendingOpens(),
          ready: dbMan.pendingReady(),
          load: dbMan.pendingLoad()
        }
      }
    }
  ]
}
