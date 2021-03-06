const mongoose = require('mongoose')
const redis = require('redis')
const util = require('util')
const keys = require('../config/keys')

const client = redis.createClient(keys.redisUrl)
client.hget = util.promisify(client.hget)

const exec = mongoose.Query.prototype.exec

mongoose.Query.prototype.cache = function(option = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(option.key || '')

  return this;
}

mongoose.Query.prototype.exec = async function () {
  if (!this.useCache) {
    console.log('NOT USING CACHE')
    return exec.apply(this, arguments)
  }

  console.log('USING CACHE', this.getQuery(), this.mongooseCollection.name)
  const key = JSON.stringify(
    Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name
    })
  )

  // see if we have a value for 'key' in redis
  const cacheValue = await client.hget(this.hashKey, key)

  if (cacheValue) {
    const doc = JSON.parse(cacheValue)
    return Array.isArray(doc)
      ? doc.map(d => new this.model(d))
      : new this.model(doc)
  }

  const result = await exec.apply(this, arguments)

  client.hset(this.hashKey, key, JSON.stringify(result))

  return result
}

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey))
  }
}