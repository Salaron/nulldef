import { ErrorNotice as ErrorNotice_} from "../core/errors"
import { Connection, ConnectionPool } from "../core/mysql"

declare global {
  const ErrorNotice: typeof ErrorNotice_

  const MySQLconnection: typeof Connection
  const MySQLconnectionPool: ConnectionPool
}