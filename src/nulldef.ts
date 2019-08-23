import Config from "./config"
import { VK, MessageContext } from "vk-io"
import { walk, loadModule, timeStamp } from "./utils"
import { nullModule } from "./types/module"
import { Log } from "./core/log"

const log = new Log("Main")
export let bootTimestamp = timeStamp()
export let modules: { [filePath: string]: nullModule | undefined } = {};

(async () => {
  let vk = new VK({
    token: Config.vkToken,
    apiMode: "parallel"
  })
  // load all modules
  for (let filePath of await walk("./modules", ".js")) {
    await loadModule(filePath, true)
  }

  async function messagesHandler(ctx: MessageContext) {
    try {
      if (ctx.text.startsWith(Config.commandFlag)) {
        ctx.text = ctx.text.slice(1) // remove command flag
        for (const module of Object.values(modules)) {
          if (!module) continue

          for (let i = 0; i < module.regExp.length; i++) {
            if (ctx.text.match(module.regExp[i])) {
              await module.execute(ctx, i)
              break
            }
          }
        }
      }
    } catch (err) {
      log.error(err)
      await ctx.send(err.message)
    }
  }
  
  vk.updates.on("message", messagesHandler)
  vk.updates.start().catch(console.error)
})()