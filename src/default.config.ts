import Log from "./core/log"

export default <config>{
  vk: {
    access_token: ""
  },
  bot: {
    logLevel: Log.LEVEL.DEBUG,
    admins: [],
    witAiToken: "",
    commandFlag: "/"
  },
  database: {
    autoReconnect: true,
    autoReconnectDelay: 2000,
    autoReconnectMaxAttempt: 10,
    connectionLimit: 30,
    dateStrings: true,
    host: "",
    user: "",
    password: "",
    database: ""
  }
}

interface config {
  vk: {
    access_token: string
  }
  bot: {
    logLevel: Log.LEVEL
    admins: number[]
    witAiToken: string
    commandFlag: string
  }
  database: {
    autoReconnect: boolean
    autoReconnectDelay: number
    autoReconnectMaxAttempt: number
    connectionLimit: number
    dateStrings: boolean
    host: string
    user: string
    password: string
    database: string
  }  
}