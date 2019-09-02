import { NlModule, unloadModule, modulesList, loadModule, modules } from "../core/module"
import { MessageContext } from "vk-io"

export default class extends NlModule {
  public regExp = [/unloadmodule/i, /loadmodule/i]
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
    }
  }

  private async unload(msgCtx: MessageContext) {
    if (msgCtx.text.split(" ").length < 2)
      throw new ErrorNotice(`Not enough arguments`)

    let moduleName = msgCtx.text.split(" ")[1].replace(/^.*[\\/]/, "").replace(/\.[^/.]+$/, "")
    if (modules[moduleName] && modules[moduleName]!.restrictUnload) 
      throw new ErrorNotice(`Module "${moduleName}" can't be unloaded`)

    if (unloadModule(moduleName) === false)
      throw new ErrorNotice(`Module "${moduleName}" doesn't exists!`)

    await msgCtx.send(await modulesList())
  }
  private async load(msgCtx: MessageContext) {
    if (msgCtx.text.split(" ").length < 2)
      throw new Error(`Not enough arguments`)

    let moduleName = msgCtx.text.split(" ")[1].replace(/^.*[\\/]/, "").replace(/\.[^/.]+$/, "")
    if (await loadModule(moduleName) === false)
      throw new ErrorNotice(`Module "${moduleName}" doesn't exists!`)

    await msgCtx.send(await modulesList())
  }
}
