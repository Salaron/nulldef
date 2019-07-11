import * as mysql from "mysql"
import Log from "./log"
import extend from "extend"
import { promisify } from "util"
import Config from "../config"

const log = new Log.Create(Config.bot.logLevel, "Database")

export class Database {
  public config: any
  public pool: mysql.Pool
  public reconnectAttempts: number
  public freeConnections: mysql.PoolConnection[]
  public createdConnections: mysql.PoolConnection[]
  public acquiringConnections: mysql.PoolConnection[]
  private debugInterval: any
  constructor(config: any) {
    this.config = extend({
      autoReconnect: true,
      autoReconnectDelay: 1000,
      autoReconnectMaxAttempt: 10,
      disconnected: () => { },
      dateStrings: true,
      queryFormat: (query: string, values: any) => {
        if (!values) return query
        return query.replace(/\:(\w+)/g, function (txt: any, key: any) {
          if (values.hasOwnProperty(key)) {
            return mysql.escape(values[key])
          }
          return txt
        })
      },
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      connectionLimit: 30
    }, config)
    this.reconnectAttempts = 0
  }

  public async connect() {
    return new Promise(async (res, rej) => {
      try {
        this.pool = mysql.createPool(this.config)
        this.pool.on("error", async (err) => {
          log.error(err)
          await this.handleError(err)
        })

        let connection = await Connection.get()
        await Promise.all([
          connection.query(`SET SESSION group_concat_max_len = 4294967295`),
          connection.query(`SET @@sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))`)
        ])
        await connection.commit()

        this.reconnectAttempts = 0
        this.freeConnections = (<any>this.pool)._freeConnections
        this.createdConnections = (<any>this.pool)._allConnections
        this.acquiringConnections = (<any>this.pool)._acquiringConnections
        res()
      } catch (err) {
        rej(err)
      }
    })
  }

  public async beginTransaction(connection?: mysql.PoolConnection): Promise<mysql.PoolConnection> {
    return new Promise(async (res, rej) => {
      try {
        if (connection === undefined) connection = await this.getConnection()
      } catch (err) {
        return rej(err)
      }
      connection.beginTransaction(async (err) => {
        if (err) {
          await this.handleError(err)
          return rej(err)
        }
        res(connection)
      })
    })
  }
  public async commit(connection: mysql.PoolConnection, release = true): Promise<void> {
    return new Promise(async (res, rej) => {
      connection.commit(async (err) => {
        if (err) {
          if (this.freeConnections.indexOf(connection) === -1) connection.release()
          await this.handleError(err)
          return rej(err)
        }
        if (release == true) connection.release()
        res()
      })
    })
  }
  public async rollback(connection: mysql.PoolConnection, release = true): Promise<void> {
    return new Promise(async (res, rej) => {
      connection.rollback(async (err) => {
        if (err) {
          if (this.freeConnections.indexOf(connection) === -1) connection.release()
          await this.handleError(err)
          return rej(err)
        }
        if (release == true) connection.release()
        res()
      })
    })
  }

  public async query(query: string, values: any = {}, connection?: mysql.PoolConnection): Promise<any> {
    return new Promise(async (res, rej) => {
      let transaction = false
      try {
        if (connection == undefined) connection = await this.getConnection()
        else transaction = true
      } catch (err) {
        rej(err)
      }
      (<mysql.PoolConnection>connection).query(query, values, async (err, result) => {
        if (!transaction) (<mysql.PoolConnection>connection).release()
        if (err) {
          log.error(`The error has occurred while performing a query:\n'${query}' with this values: ${JSON.stringify(values)}`)
          await this.handleError(err)
          return rej(err)
        }
        res(result)
      })
    })
  }
  public async first(query: string, values: any = {}, connection?: mysql.PoolConnection): Promise<any> {
    return new Promise(async (res, rej) => {
      let transaction = false
      if (connection == undefined) connection = await this.getConnection()
      else transaction = true

      if (query.slice(-1) === ";") query = query.slice(0, -1) // remove ";" -- the end of query
      // select only 1 element 
      connection.query(query + " LIMIT 1;", values, async (err, result) => {
        if (!transaction) (<mysql.PoolConnection>connection).release()
        if (err) {
          log.error(`The error has occurred while performing a query:\n'${query}' with this values: ${JSON.stringify(values)}`)
          await this.handleError(err)
          return rej(err)
        }
        if (typeof result === "object" && Array.isArray(result)) {
          if (result.length > 0) result = result[0]
          else result = []
        }
        res(result)
      })
    })
  }

  public connectionDebug(interval = 3000) {
    if (typeof this.debugInterval === "undefined" && log.level >= Log.LEVEL.DEBUG) {
      log.debug(`Pool Connection Debug Info Enabled`)
      this.debugInterval = setInterval(() => {
        log.debug(`Pool connection limit: ${MySQLdatabase.config.connectionLimit}`)
        log.debug(`Created connections: ${this.createdConnections.length}`)
        log.debug(`Free connections: ${this.freeConnections.length}`)
        log.debug(`Active connections: ${this.acquiringConnections.length}`)
      }, interval)
    } else {
      clearInterval(this.debugInterval)
      this.debugInterval = undefined
      log.debug(`Pool Connection Debug Info Disabled`)
    }
  }

  private async getConnection(): Promise<mysql.PoolConnection> {
    return new Promise((res, rej) => {
      this.pool.getConnection((err, connection) => {
        if (err) return rej(err)
        res(connection)
      })
    })
  }

  private async handleError(error: mysql.MysqlError, hideMessage: boolean = false): Promise<void> {
    if (!hideMessage) log.error(error.message + " [" + error.code + "]");
    switch (error.code) {
      case "ECONNREFUSED":
      case "PROTOCOL_CONNECTION_LOST": {
        if (this.config.autoReconnect != true) this.config.disconnected.call(this, error, "Auto-Reconnect Disabled");
        if (this.config.autoReconnectMaxAttempt < this.reconnectAttempts) this.config.disconnected.call(this, error, "Max Reconnect Attempts");
        this.reconnectAttempts += 1
        try {
          await promisify(this.connect)()
          log.info("Reconnected")
        } catch (err) {
          let t = this
          setTimeout(function () {
            t.handleError(err, false)
          }, this.config.autoReconnectDelay)
        }
        break
      }
      default: {
        log.warn("No Handle for [" + error.code + "]")
      }
    }
  }
}

export class Connection {
  constructor(connection?: any) {
    if (typeof connection === "undefined") {
      throw new Error(`Cannot be called directly`)
    }
    this.connection = connection
    this.released = false
  }

  static async get() {
    let connection = await MySQLdatabase.beginTransaction()
    return new Connection(connection)
  }
  async commit(releaseConnection = true) {
    if (this.released === true) throw new Error(`The connection already has been released`)

    if (releaseConnection === true) {
      await MySQLdatabase.commit(this.connection, true)
      this.released = true
    } else {
      await MySQLdatabase.commit(this.connection, false)
      await MySQLdatabase.beginTransaction(this.connection)
    }
  }
  async rollback() {
    if (this.released === true) throw new Error(`The connection already has been released`)
    await MySQLdatabase.rollback(this.connection)
    this.released = true
  }

  async query(query: string, values: any = {}) {
    if (this.released === true) throw new Error(`The connection already has been released`)
    return await MySQLdatabase.query(query, values, this.connection)
  }
  async first(query: string, values: any = {}) {
    if (this.released === true) throw new Error(`The connection already has been released`)
    return await MySQLdatabase.first(query, values, this.connection)
  }

  public connection: any
  public released: boolean
}
(<any>global).MySQLconnection = Connection

declare global {
  const MySQLconnection: typeof Connection
  const MySQLdatabase: Database
}

export async function MySQLConnect() {
  try {
    (<any>global).MySQLdatabase = new Database(extend({
      disconnected: function () {
        log.fatal("Lost Connection to MySQL Database")
        process.exit(1)
      },
    }, Config.database))
    log.level = Config.bot.logLevel
    await MySQLdatabase.connect()
  } catch (e) {
    log.error(e.message)
    await promisify(setTimeout)(Config.database.autoReconnectDelay)
    await MySQLConnect()
  }
}