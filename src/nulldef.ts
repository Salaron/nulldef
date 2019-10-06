import "./core/errors"
import Config from "./config"
import { VK } from "vk-io"
import { timeStamp } from "./core/utils"
import { Log } from "./core/log"
import { modules, startUpLoad } from "./core/module"
import { MySQLConnect } from "./core/mysql"
import { NextMiddleware } from "middleware-io"

const log = new Log("Main")
export let bootTimestamp = timeStamp()
export let vk: VK;
(async () => {
  vk = new VK({
    token: Config.vkToken,
    //apiMode: "parallel"
  })

  let group = await vk.api.groups.getById({
    fileds: "description"
  })
  log.info(`Successfully connected to group "${group[0].name}"`, "VK")

  // Connect to the database
  await MySQLConnect()

  // Load all modules
  await startUpLoad()

  // Catch all unhandled errors
  vk.updates.use(async (context, next) => {
    context.connection = await MySQLconnection.get()
    try {
      await next()
    } catch (err) {
      await context.connection.rollback()
      log.error(err, "Error Catcher")
    }
  })

  async function messagesHandler(ctx: MsgCtx, next: NextMiddleware) {
    log.debug(ctx, "Messages Handler")
    try {
      if (ctx.text && ctx.text.startsWith(Config.commandFlag)) {
        ctx.text = ctx.text.slice(1) // remove command flag

        let command = ctx.text.split(" ")[0]
        let done = false
        for (const module of Object.values(modules)) {
          if (!module) continue // this module was unloaded
          if (done) break

          for (let i = 0; i < module.regExp.length; i++) {
            if (command.match(module.regExp[i])) {
              await module.execute(ctx, i)
              done = true
              break
            }
          }
        }
      }
      if (!ctx.connection.released) await ctx.connection.commit()
    } catch (err) {
      if (err instanceof ErrorNotice) {
        if (!ctx.connection.released) await ctx.connection.commit()
        return await ctx.send(err.message)
      }

      throw err
    }
  }

  vk.updates.on("message", messagesHandler)
  vk.updates.start().catch(console.error)
})()
