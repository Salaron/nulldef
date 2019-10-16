import { MessageContext } from "vk-io"
import { NextMiddleware } from "middleware-io"
import { Connection } from "../core/mysql"
import config from "../config"
import { ErrorNotice } from "../models/errors"
import { modules } from "../core/module"

export interface INullMessageContext extends MessageContext {
  connection: Connection
  params: {
    autostt: 0 | 1
    commandFlag: string
  }
}

export async function handler(context: INullMessageContext, next: NextMiddleware) {
  context.connection = await MySQLconnection.get()
  context.params = {
    autostt: 0,
    commandFlag: config.bot.defaultCommandFlag
  }

  try {
    (await context.connection.query("SELECT name, value FROM null_peer_params WHERE peer_id = :peer", {
      peer: context.peerId
    })).map(param => {
      context.params[param.name] = param.value
    })

    if (context.getAttachments("audio_message").length > 0 && context.params.autostt == 1) {
      try {
        await modules["wit_ai"].execute(context, 0)
      } catch (_) { } // tslint:disable-line
    } else if (context.text && context.text.startsWith(context.params.commandFlag)) {
      context.text = context.text.slice(1)
      const command = context.text.split(" ")[0]
      let processed = false

      for (const module of Object.values(modules)) {
        if (!module) continue // this module was unloaded
        if (processed) break

        for (let i = 0; i < module.regExp.length; i++) {
          if (command.match(module.regExp[i])) {
            await module.execute(context, i)
            processed = true
            break
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof ErrorNotice) {
      if (!context.connection.released) await context.connection.commit()
      return await context.send(err.message)
    }

    if (!context.connection.released) await context.connection.rollback()
    throw err
  }

  if (!context.connection.released) await context.connection.commit()
}
