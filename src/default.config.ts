import { LEVEL } from "./core/logger"

export default {
  bot: {
    logLevel: LEVEL.INFO,
    vkToken: "",
    defaultCommandFlag: "/",
    adminPeerIds: []
  },
  sgo: {
    users: [
      {
        username: "",
        password: "",
        main: true,
        description: ""
      }
    ],
    activityStartTime: "05:00",
    activityEndTime: "23:59"
  },
  database: {
    host: "localhost",
    password: ""
  }
}
