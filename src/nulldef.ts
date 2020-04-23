import VK from "vk-io"
import Config from "./config"
import { Logger } from "./core/logger"
import { Connect as ConnectToRedis } from "./core/redis"
import { timeStamp } from "./core/utils"
import { setup } from "./modules/sgo"

const logger = new Logger("nulldef")
export const bootTimestamp = timeStamp()
export const vk = new VK({
  token: Config.base.vkToken
});

(async () => {
  const group = await vk.api.groups.getById({
    fields: ["description"]
  })
  logger.info(`Successfully connected to group ${group[0].name}`, "VK")

  await ConnectToRedis()
  // Catch all unhandled here errors
  vk.updates.use(async (context, next) => {
    try {
      await next()
    } catch (err) {
      logger.error(err)
    }
  })
  await setup()
  vk.updates.start().catch(err => logger.error(err))
})().catch(err => logger.error(err))
