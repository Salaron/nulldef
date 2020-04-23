import IORedis from "ioredis"
import { Logger } from "./logger"
import Config from "../config"

const logger = new Logger("Redis")

// tslint:disable-next-line: variable-name
export let Redis: IORedis.Redis

export async function Connect() {
  Redis = new IORedis(Config.database)
  Redis.on("error", (err) => {
    logger.error(err)
  })
  await Redis.set("checkConnection", "ok", "ex", 10)
  const result = await Redis.get("checkConnection")
  if (result !== "ok") throw new Error("Unable to connect to the Redis database")
  await Redis.del("checkConnection")
}