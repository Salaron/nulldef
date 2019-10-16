import { LEVEL } from "./core/log"

export default {
  bot: {
    logLevel: LEVEL.INFO,
    vkToken: "",
    defaultCommandFlag: "/",
  },
  witAi: {
    token: ""
  },
  yaTTS: {
    token: "",
    folderId: ""
  },
  sgo: {
    userName: "",
    password: ""
  },
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
