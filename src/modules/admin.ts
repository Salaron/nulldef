import { nullModule } from "../types/module"
import { MessageContext } from "vk-io/typings/index"
import { unloadModule, walk, loadModule } from "../utils"
import { modules } from "../nulldef"

export default class Module implements nullModule {
  regExp = [/^unload/i, /^load/i, /^reload/i]
  loadByDefault = true

  public async execute(ctx: MessageContext, pattern: number) {
    if (pattern >= 0 && pattern <= 1) {
      if (ctx.text.split(" ").length != 2) {
        throw new Error(`Not enought arguments`)
      }
    }
    switch (pattern) {
      case 0: { // unload module
        let moduleName = `${ctx.text.split(" ")[1].replace(/^.*[\\\/]/, "")}`
        if (moduleName === "admin") throw new Error(`Nice try.`)
        if (unloadModule(`modules/${moduleName}`) === false) {
          await ctx.send(`Module "${moduleName}" doesn't exists!`)
          return
        }
        await ctx.send(await this.getModulesList())
        return
      }

      case 1: { // load module
        let moduleName = `${ctx.text.split(" ")[1].replace(/^.*[\\\/]/, "")}`
        if (await loadModule(`modules/${moduleName}`) === false) {
          await ctx.send(`Module "${moduleName}" doesn't exists!`)
          return
        }
        await ctx.send(await this.getModulesList())
        return
      }

      case 2: { // reload all
        for (let filePath of await walk("./modules", ".js")) {
          await loadModule(filePath, true)
        }
        await ctx.send(await this.getModulesList())
        return
      }
    }
  }

  private async getModulesList() {
    let result = `List of available modules:\n`
    for (const module of await walk("./modules", ".js")) {
      let name = module.replace(/^.*[\\\/]/, "")
      let status = "X"
      if (modules[name] != undefined) status = "✓"
      result += `[${status}] ${name}\n`
    }
    return result
  }
}