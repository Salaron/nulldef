import { ErrorNotice as ErrorNotice_} from "../core/errors"
import { Connection, ConnectionPool } from "../core/mysql"
import { MessageContext } from "vk-io"

declare global {
  const ErrorNotice: typeof ErrorNotice_

  const MySQLconnection: typeof Connection
  const MySQLconnectionPool: ConnectionPool
  type MsgCtx = MessageContext & { connection: Connection }
}