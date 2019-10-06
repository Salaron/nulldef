import { promisify } from "util"
import { readdir, stat } from "fs"
import { Log } from "./log"
import path from "path"

const log = new Log("Module Manager")
export let modules: { [filePath: string]: NlModule | undefined } = {}

export abstract class NlModule {
  public abstract regExp: RegExp[]
  public abstract loadByDefault: boolean
  public commandUsage: string
  public restrictUnload = false

  public abstract execute(
    msgCtx: MsgCtx,
    triggeredRegExp: number
  ): Promise<void>
  public async init() {
    
  }
}

export async function startUpLoad() {
  let files = await promisify(readdir)("./modules")
  for (let file of files) {
    const stats = await promisify(stat)(path.join("./modules", file))
    if (stats.isFile() && path.extname(file) === ".js") {
      await loadModule(path.basename(file, ".js"), true)
    }
  }
}

export async function modulesList() {
  let files = await promisify(readdir)("./modules")

  let result = `List of available modules:\n`
  for (let file of files) {
    const stats = await promisify(stat)(path.join("./modules", file))
    if (stats.isFile() && path.extname(file) != ".js") continue
    let moduleName = path.basename(file, ".js")

    let status = "X"
    if (modules[moduleName] != undefined) status = "✓"
    result += `[${status}] ${file}\n`
  }
  return result
}

export async function loadModule(moduleName: string, startUp = false) {
  try {
    let file = await import(`../modules/${moduleName}`)
    if (!file.default)
      throw new Error(`Module "${moduleName}" doesn't have default export!`)

    let module: NlModule = new file.default()
    if (!module.loadByDefault && startUp) unloadModule(moduleName)
    else {
      if (module.init) await module.init()
      log.info(`Loaded module ${moduleName}`)
      modules[moduleName] = module
    }
    return true
  } catch (err) {
    log.error(err)
    return false
  }
}

export function unloadModule(moduleName: string): boolean {
  try {
    // remove from cache
    modules[moduleName] = undefined
    delete require.cache[require.resolve(`../modules/${moduleName}`)]
    log.debug(`Module "${moduleName}" has been unloaded`)
    return true
  } catch (err) {
    log.error(err)
    return false
  }
}
