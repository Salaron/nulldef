import SGO, { defaultSession } from "./client"

interface IUserActiveSession {
  eMs: string
  nickName: string
  roles: string
  schoolId: number
  userId: number
  // other fields are not initialized
}

interface IPastMandatory {
  classMeetingId: number
  mark: null | string
  assignmentName: string
  subjectName: string
  dueDate: string
  weight: number
  typeId: number // ?
}
export class API {
  private sgo: SGO
  constructor(sgo: SGO) {
    this.sgo = sgo
  }

  /**
   * Возвращает список пользователей, которые находятся сейчас в системе
   */
  public async getCurrentOnline(): Promise<IUserActiveSession[]> {
    return this.sgo.sendRequest("webapi/context/activeSessions", {
      jsonResponse: true
    })
  }

  /**
   * Возвращает список заданий, срок сдачи которых был пропущен
   * @param studentId айди ученика
   * @param weekStart дата начала учёта в формате "YYYY-MM-DD"
   * @param weekEnd дата окончания учёта в формате "YYYY-MM-DD"
   */
  public async getPastMandatory(studentId = this.sgo.session.userId, weekStart: string, weekEnd: string): Promise<IPastMandatory[]> {
    return this.sgo.sendRequest("/webapi/student/diary/pastMandatory", {
      jsonResponse: true,
      requestData: {
        studentId,
        weekStart,
        weekEnd,
        yearId: this.sgo.session.yearId
      }
    })
  }

  /**
   *  Возвращает список уроков по дням недели
   * @param studentId айди ученика
   * @param weekStart дата начала учёта в формате "YYYY-MM-DD"
   * @param weekEnd дата окончания учёта в формате "YYYY-MM-DD"
   */
  public async getDiary(studentId = this.sgo.session.userId, weekStart: string, weekEnd: string) {
    // TODO: typings
    return this.sgo.sendRequest("/webapi/student/diary/pastMandatory", {
      jsonResponse: true,
      requestData: {
        studentId,
        weekStart,
        weekEnd,
        yearId: this.sgo.session.yearId
      }
    })
  }

  // TODO
  public async getMail(order: "ASC" | "DESC") {

  }

  /**
   * Завершает текущую сессию
   */
  public async logout() {
    try {
      await this.sgo.sendRequest("asp/logout.asp", {
        method: "POST",
        requestData: {
          at: this.sgo.session.AT.toString(),
          ver: this.sgo.session.VER
        }
      })
      this.sgo.session = defaultSession
    } catch {
      // ignore errors
    }
  }
}