import { Connection, ConnectionPool } from "../core/mysql"

declare global {
  const MySQLconnection: typeof Connection
  const MySQLconnectionPool: ConnectionPool
}