import { nullModule } from "../types/module"
import { MessageContext } from "vk-io/typings/index"
import { modules } from "../nulldef"
const { version } = require("../../package.json")

export default class Module implements nullModule {
  regExp = [/^help/i]
  loadByDefault = true

  public async execute(ctx: MessageContext) {
    let result = `NullDef v${version}\n\n`
    for (const module of Object.values(modules)) {
      if (!module || !module.help) continue
      result += `${module.help}\n`
    }
    ctx.send(result)
  }
}