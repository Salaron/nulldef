import { nullModule } from "../types/module"
import { MessageContext } from "vk-io/typings/index"

export default class Module implements nullModule {
  regExp = [/help/i]
  loadByDefault = false

  public async execute(ctx: MessageContext) {
    await ctx.send("Hi")
  }
}