import { readdir, stat } from "fs"
import path from "path"
import { promisify } from "util"
import { modules } from "./nulldef"
import { Log } from "./core/log"

const log = new Log("Utils")

export async function walk(dir: string, ext?: string): Promise<string[]> {
  let files = await promisify(readdir)(dir)
  let ret = []
  for (const file of files) {
    const filePath = path.join(dir, file)
    const stats = await promisify(stat)(filePath)
    if ((stats.isFile() && ext && path.extname(file) === ext) || (stats.isFile() && !ext)) ret.push(filePath.replace(/\.[^/.]+$/, ""))
  }

  return ret.reduce((all, folderContents) => all.concat(folderContents as any), [])
}

export async function loadModule(filePath: string, startup = false) {
  try {
    let file = await import(`./${filePath}`)
    if (!file.default) throw new Error("This module doesn't have default export!")
    let module = new file.default()
    if (!module.loadByDefault && startup) unloadModule(filePath)
    else {
      log.info("Loaded module " + filePath.replace(/^.*[\\\/]/, ""))
      modules[filePath.replace(/^.*[\\\/]/, "")] = module
    }
    return true
  } catch (err) {
    log.error(err)
    return false
  }
}

export function unloadModule(filePath: string): boolean {
  try {
    modules[filePath.replace(/^.*[\\\/]/, "")] = undefined
    require.cache[require.resolve(`./${filePath}`)]
    log.debug("Module " + filePath.replace(/^.*[\\\/]/, "") + " has been unloaded")
    return true
  } catch (err) {
    log.error(err)
    return false
  }
}

export function timeStamp() {
  return Date.now() / 1000
}