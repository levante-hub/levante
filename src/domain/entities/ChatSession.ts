import { Message } from './Message';

export class ChatSession {
  private _messages: Message[] = [];

  constructor(
    public readonly id: string,
    private _title: string,
    public readonly modelId: string,
    public readonly createdAt: Date,
    private _updatedAt: Date,
    public readonly folderId?: string
  ) {
    if (!_title.trim()) {
      throw new Error('Chat title cannot be empty')
    }
    if (_title.length > 200) {
      throw new Error('Chat title cannot exceed 200 characters')
    }
  }

  getTitle(): string {
    return this._title
  }

  getUpdatedAt(): Date {
    return new Date(this._updatedAt)
  }

  getMessages(): readonly Message[] {
    return [...this._messages]
  }

  getMessageCount(): number {
    return this._messages.length
  }

  getLastMessage(): Message | null {
    return this._messages.length > 0 ? this._messages[this._messages.length - 1] : null
  }

  getFirstUserMessage(): Message | null {
    return this._messages.find(msg => msg.isFromUser()) || null
  }

  updateTitle(newTitle: string): void {
    if (!newTitle.trim()) {
      throw new Error('Chat title cannot be empty')
    }
    if (newTitle.length > 200) {
      throw new Error('Chat title cannot exceed 200 characters')
    }
    
    this._title = newTitle.trim()
    this._updatedAt = new Date()
  }

  addMessage(message: Message): void {
    if (this._messages.length >= 1000) {
      throw new Error('Chat session cannot have more than 1000 messages')
    }

    this._messages.push(message)
    this._updatedAt = new Date()
  }

  removeMessage(messageId: string): boolean {
    const initialLength = this._messages.length
    this._messages = this._messages.filter(msg => msg.id !== messageId)
    
    if (this._messages.length < initialLength) {
      this._updatedAt = new Date()
      return true
    }
    
    return false
  }

  getMessage(messageId: string): Message | null {
    return this._messages.find(msg => msg.id === messageId) || null
  }

  hasMessages(): boolean {
    return this._messages.length > 0
  }

  isEmpty(): boolean {
    return this._messages.length === 0
  }

  generateAutoTitle(): string {
    const firstUserMessage = this.getFirstUserMessage()
    if (!firstUserMessage) {
      return 'New Chat'
    }

    const content = firstUserMessage.getContentText()
    const truncatedContent = content.length > 50 ? content.substring(0, 50) + '...' : content
    return truncatedContent.trim() || 'New Chat'
  }

  shouldAutoGenerateTitle(): boolean {
    return this._title.includes('New Chat') && this.getFirstUserMessage() !== null
  }

  getTotalContentLength(): number {
    return this._messages.reduce((total, message) => total + message.getContentLength(), 0)
  }

  getMessagesByRole(role: 'user' | 'assistant' | 'system'): readonly Message[] {
    return this._messages.filter(msg => msg.role === role)
  }

  getMessagesWithToolCalls(): readonly Message[] {
    return this._messages.filter(msg => msg.hasToolCalls())
  }

  clone(): ChatSession {
    const cloned = new ChatSession(
      this.id,
      this._title,
      this.modelId,
      this.createdAt,
      this._updatedAt,
      this.folderId
    )
    
    this._messages.forEach(message => {
      cloned.addMessage(message)
    })
    
    return cloned
  }

  equals(other: ChatSession): boolean {
    return (
      this.id === other.id &&
      this._title === other._title &&
      this.modelId === other.modelId &&
      this.createdAt.getTime() === other.createdAt.getTime() &&
      this._messages.length === other._messages.length &&
      this._messages.every((msg, index) => msg.equals(other._messages[index]))
    )
  }

  static create(
    title: string,
    modelId: string,
    folderId?: string
  ): ChatSession {
    const now = new Date()
    return new ChatSession(
      crypto.randomUUID(),
      title,
      modelId,
      now,
      now,
      folderId
    )
  }


  static fromDatabase(dbData: any): ChatSession {
    return new ChatSession(
      dbData.id,
      dbData.title,
      dbData.model,
      new Date(dbData.created_at),
      new Date(dbData.updated_at),
      dbData.folder_id || undefined
    )
  }

  getId(): string {
    return this.id
  }

  getModelId(): string {
    return this.modelId
  }

  getFolderId(): string | undefined {
    return this.folderId
  }
}