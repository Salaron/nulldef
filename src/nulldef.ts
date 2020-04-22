import VK from "vk-io"
import Config from "./config"
import { Logger } from "./core/logger"
import { CheckConnection, Connection } from "./core/mysql"
import { timeStamp } from "./core/utils"
import SGO from "./sgo/client"

const logger = new Logger("Main")
export const bootTimestamp = timeStamp()
export const vk = new VK({
  token: Config.base.vkToken
});

(async () => {
  const group = await vk.api.groups.getById({
    fields: ["description"]
  })
  logger.info(`Successfully connected to group ${group[0].name}`, "VK")

  await CheckConnection()
  const client = await SGO.startSession(Config.sgo.username, Config.sgo.password)
  // Catch all unhandled here errors
  vk.updates.use(async (context, next) => {
    try {
      context.connection = await Connection.beginTransaction()
      await next()
      await context.connection.commit()
    } catch (err) {
      if (context.connection && context.connection.released === false) {
        context.connection.rollback()
      }
      logger.error(err)
    }
  })

  vk.updates.start().catch(err => logger.error(err))
})().catch(err => logger.error(err))
