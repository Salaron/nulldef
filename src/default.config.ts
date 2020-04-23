import { LEVEL } from "./core/logger"

export default {
  bot: {
    logLevel: LEVEL.INFO,
    vkToken: "",
    defaultCommandFlag: "/",
    adminPeerIds: []
  },
  sgo: {
    username: "",
    password: "",
    activityStartTime: "05:00",
    activityEndTime: "23:59",
    sendMarksInfoToPeerIds: []
  },
  database: {
    host: "localhost",
    user: "",
    password: ""
  }
}
