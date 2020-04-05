const Boom = require('@hapi/boom')

module.exports = function (managers, options, _logger) {
  const dbMan = managers.dbManager

  const addDBManEventListener = (eventName, request, h) => {
    const eventMap = new Map(Object.entries({
      open: (address) =>
        h.event({ event: 'orbitdb.open', data: { address } }),
      load: (address) =>
        h.event({ event: 'orbitdb.load', data: { address } }),
      ready: (address, heads) =>
        h.event({ event: 'orbitdb.ready', data: { address, heads } })
    }))

    const eventCallback = eventMap.get(eventName)

    if (eventCallback) {
      dbMan.events.on(eventName, eventCallback)
      const keepAlive = setInterval(() => h.event({ event: 'keep-alive' }), 10000)
      request.events.on('disconnect', () => {
        dbMan.events.removeListener(eventName, eventCallback)
        clearInterval(keepAlive)
      })
    } else {
      if (options.orbitDBAPI.apiDebug) throw Boom.badRequest(`Unrecognized event name: ${eventName}`)
      throw Boom.badRequest('Unrecognized event name')
    }
  }

  return [
    {
      method: 'GET',
      path: '/events/{eventnames}',
      handler: (request, h) => {
        const eventnames = request.params.eventnames
        const events = typeof eventnames === 'string' ? eventnames.split(',') : eventnames
        events.forEach((eventName) => addDBManEventListener(eventName, request, h))
        return h.event({ event: 'registered', data: { events } })
      }
    }
  ]
}
