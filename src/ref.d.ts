interface vkMessage {
  id: number
  date: number
  out: number
  peer_id: number
  text: string
  conversation_message_id: number
  fwd_messages: vkMessageMin[]
  important: boolean
  random_id: number
  attachments: vkAttachment[]
  is_hidden: boolean
  reply_message?: vkMessageMin
}

interface vkMessageMin {
  date: number
  from_id: number
  text: string
  attachments: vkAttachment[]
  conversation_message_id: number
  peer_id: number
  id: number
}

interface vkAttachment {
  type: string
  photo?: {
    id: number
    album_id: number
    owner_id: number
    sizes: any[]
    text: string
    date: number
    access_key: string
  }
  [p: string]: any
}

interface forEachAsyncCb<T> {
  (element: T, index: number, originalArray: Array<T>): Promise<void>
}
