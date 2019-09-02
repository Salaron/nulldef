import { LEVEL } from "./core/log"

export default {
  logLevel: LEVEL.DEBUG,
  vkToken: "",
  witAiToken: "",
  yaToken: "",
  commandFlag: "/",
  database: {
    autoReconnect: true,
    autoReconnectDelay: 2000,
    autoReconnectMaxAttempt: 10,
    connectionLimit: 30,
    dateStrings: true,
    host: "localhost",
    user: "",
    password: "",
    database: ""
  }
}