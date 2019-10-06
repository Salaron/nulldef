import {
  NlModule,
  unloadModule,
  modulesList,
  loadModule,
  modules
} from "../core/module"
import { MessageContext } from "vk-io"

export default class extends NlModule {
  public regExp = [/^unload$/i, /^load$/i, /^reload$/i, /^status$/i]
  public loadByDefault = true
  public restrictUnload = true

  public async execute(msgCtx: MessageContext, triggeredRegExp: number) {
    switch (triggeredRegExp) {
      case 0: {
        await this.unload(msgCtx)
        return
      }
      case 1: {
        await this.load(msgCtx)
        return
      }
      case 2: {
        await this.unload(msgCtx, false)
        await this.load(msgCtx, false)
        await msgCtx.send("Success!")
        return
      }
      case 3: {
        await msgCtx.send(await modulesList())
        return
      }
    }
  }

  private async unload(msgCtx: MessageContext, sendStatus = true) {
    if (msgCtx.text.split(" ").length < 2)
      throw new ErrorNotice(`Not enough arguments`)

    let moduleName = msgCtx.text
      .split(" ")[1]
      .replace(/^.*[\\/]/, "")
      .replace(/\.[^/.]+$/, "")
    if (modules[moduleName] && modules[moduleName]!.restrictUnload)
      throw new ErrorNotice(`Module "${moduleName}" can't be unloaded`)

    if (unloadModule(moduleName) === false)
      throw new ErrorNotice(`Module "${moduleName}" doesn't exists!`)

    if (sendStatus) await msgCtx.send(await modulesList())
  }
  private async load(msgCtx: MessageContext, sendStatus = true) {
    if (msgCtx.text.split(" ").length < 2)
      throw new Error(`Not enough arguments`)

    let moduleName = msgCtx.text
      .split(" ")[1]
      .replace(/^.*[\\/]/, "")
      .replace(/\.[^/.]+$/, "")
    if ((await loadModule(moduleName)) === false)
      throw new ErrorNotice(`Module "${moduleName}" doesn't exists!`)

    if (sendStatus) await msgCtx.send(await modulesList())
  }
}
