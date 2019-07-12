/// <reference path="./ref.d.ts" />

import Vk from "./core/vk"
import Log from "./core/log"
import Config from "./config"
import Utils from "./core/utils"
import { MySQLConnect } from "./core/database"
import vkCommands from "./modules/vkCommands"

export const log = new Log.Create(Config.bot.logLevel);
export var vk: Vk;

(async () => {
  try {
    await MySQLConnect()
    vk = await Vk.authorize(Config.vk.access_token)
    log.info(`VK Session started. ${vk.session.group_name}`)
    vk.longPool.on("message_new", async(msg: vkMessage) => {
      if (Config.bot.logLevel >= Log.LEVEL.DEBUG) log.inspect(msg)
      let connection = await MySQLconnection.get()
      try {
        if (!msg.text.startsWith(Config.bot.commandFlag)) {
          // auto stt
          let param = await (new Utils(connection)).getChatParams(msg.peer_id, ["autostt"])
          if (typeof param["autostt"] === "number" && param["autostt"] === 0) {
            await connection.commit()
            return
          } 
          let result = await vkCommands.stt(connection, msg, ['force'])
          if (!result.startsWith("Аудио")) return
          await vk.setActivity(msg.peer_id, "typing")
          await vk.sendMessage(msg.peer_id, result)
        } else {
          msg.text = msg.text.replace(Config.bot.commandFlag, "")
          let args = msg.text.split(" ")
          if ((<any>vkCommands)[args[0]] != undefined) {
            await vk.setActivity(msg.peer_id, "typing")
            let result = await (<any>vkCommands)[args[0]](connection, msg, args)
            await vk.sendMessage(msg.peer_id, result)
          }
        }
        await connection.commit()
      } catch (err) {
        await connection.rollback()
        log.error(err)
      }
    })

  } catch (err) {
    log.fatal(err)
    process.exit(0)
  }
})()