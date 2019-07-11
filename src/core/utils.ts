import readline from "readline"
import { log } from "../bot"
import { Connection } from "./database"

const readLineInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})
readLineInterface.setPrompt('_> ')
readLineInterface.prompt()

export default class Utils {
  private connection: Connection
  constructor(connection: Connection) {
    this.connection = connection
  }
  async getChatParams(peerId: number, paramNames: string[] = []) {
    let chatParams = await this.connection.query(`SELECT param as name, value FROM chat_params WHERE peer_id = :peer`, {
      peer: peerId
    })

    let result: any = {}
    for (let i = 0; i < chatParams.length; i++) {
      if (paramNames.length != 0 && paramNames.includes(chatParams[i].name)) {
        result[chatParams[i].name] = chatParams[i].value
      } else if (paramNames.length === 0) {
        result[chatParams[i].name] = chatParams[i].value
      }
    }
    return result
  }
}

process.on('uncaughtException', err => {
  log.error(err)
})

declare global {
  interface Array<T> {
    forEachAsync(callback: forEachAsyncCb<T>): Promise<void>
    randomValue(): T
  }
  interface Object {
    getKey(key: string | number): string | number
  }
}
Array.prototype.forEachAsync = async function <T>(callback: forEachAsyncCb<T>): Promise<void> {
  let array = this
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}
Array.prototype.randomValue = function <T>(): T {
  return this[Math.floor(Math.random() * this.length)]
}
Object.defineProperty(Object.prototype, 'getKey', {
  value: function (value: any) {
    for (var key in this) {
      if (this[key] == value) {
        return key
      }
    }
    return null
  }
})