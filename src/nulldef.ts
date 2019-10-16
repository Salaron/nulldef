import Config from "./config"
import { VK } from "vk-io"
import { timeStamp } from "./core/utils"
import { Log } from "./core/log"
import { startUpLoad } from "./core/module"
import { MySQLConnect } from "./core/mysql"
import { handler } from "./handlers/message"

const log = new Log("Main")
export let bootTimestamp = timeStamp()
export let vk: VK
(async () => {
  vk = new VK({
    token: Config.bot.vkToken,
    // apiMode: "parallel"
  })

  const group = await vk.api.groups.getById({
    fileds: "description"
  })
  log.info(`Successfully connected to group "${group[0].name}"`, "VK")

  // Connect to the database
  await MySQLConnect()

  // Load all modules
  await startUpLoad()

  // Catch all unhandled errors
  vk.updates.use(async (context, next) => {
    try {
      await next()
    } catch (err) {
      log.error(err)
    }
  })

  vk.updates.on("message", handler)
  vk.updates.start().catch(log.error)
})()
