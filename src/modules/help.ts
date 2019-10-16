import { NlModule } from "../core/module"
import { MessageContext } from "vk-io"
// @ts-ignore
const { version } = require("../../package.json") // tslint:disable-line

export default class extends NlModule {
  public regExp = [/help/i]
  public loadByDefault = true
  public restrictUnload = false

  public async init() {
    return
  }

  public async execute(msgCtx: MessageContext, triggeredRegExp: number) {
    switch (triggeredRegExp) {
      case 0: {
        await this.help(msgCtx)
        return
      }
    }
  }

  private async help(msgCtx: MessageContext) {
    await msgCtx.send(`nulldef v${version}\nWork In Progress.`)
  }
}
