import { useState, useEffect, useCallback } from 'react'

// Function to remove HTML/XML tags from text
const stripTags = (text: string): string => {
  if (!text) return text
  return text.replace(/<[^>]*>/g, '').trim()
}

// Function to clean text for display
const cleanText = (text: string): string => {
  if (!text) return ''
  let cleaned = stripTags(text)
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned
}

export interface ProductLink {
  url: string
  title: string
  company?: string
  companyName?: string
  city?: string
  rating?: string
  supplier_rating?: number
  source?: string
  image_url?: string
  product_url?: string
}

export interface Message {
  id: string
  type: 'bot' | 'human' | 'status' | 'tool' | 'product_links'
  content: string
  timestamp: Date
  file?: {
    name: string
    type: string
    url?: string
    previewUrl?: string
  }
  productLinks?: ProductLink[]
  isAudio?: boolean
  isStreaming?: boolean
  originalText?: string
  language?: string
}

const CONVERSATION_STORAGE_KEY = 'wavex-conversation'

export const useConversation = () => {
  const [messages, setMessages] = useState<Message[]>([])

  // Load messages from local storage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem(CONVERSATION_STORAGE_KEY)
    if (savedMessages) {
      try {
        const parsedMessages: Message[] = JSON.parse(savedMessages)
        const messagesWithDates = parsedMessages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
        
        const filteredMessages = messagesWithDates.filter(msg => msg.type !== 'product_links')
        setMessages(filteredMessages)
        
        if (filteredMessages.length !== messagesWithDates.length) {
          localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(filteredMessages))
        }
      } catch (error) {
        console.error('Failed to parse saved messages:', error)
        localStorage.removeItem(CONVERSATION_STORAGE_KEY)
      }
    }
  }, [])

  // Save messages to local storage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(messages))
    }
  }, [messages])

  const addMessage = (
    content: string, 
    type: 'bot' | 'human' | 'status' | 'tool' | 'product_links', 
    file?: { name: string; type: string; url: string },
    productLinks?: ProductLink[],
    isAudio?: boolean,
    isStreaming?: boolean,
    translationData?: { originalText: string; language: string }
  ) => {
    const newMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      type,
      content,
      timestamp: new Date(),
      file,
      productLinks,
      isAudio,
      isStreaming,
      originalText: translationData?.originalText,
      language: translationData?.language
    }
    
    setMessages(prev => [...prev, newMessage])
    return newMessage.id
  }

  const addBotMessage = (content: string, isAudio?: boolean) => {
    return addMessage(content, 'bot', undefined, undefined, isAudio, false)
  }

  const addHumanMessage = async (content: string, file?: { name: string; type: string; url: string }) => {
    const cleanedContent = stripTags(content)
    return addMessage(cleanedContent, 'human', file)
  }

  const addStatusMessage = (content: string) => {
    setMessages(prev => prev.filter(msg => msg.type !== 'status'))
    return addMessage(content, 'status')
  }

  const addToolMessage = (content: string) => {
    return addMessage(content, 'tool')
  }

  const addProductLinks = (links: ProductLink[], functionName?: string) => {
    const content = functionName ? `Search results from ${functionName}` : 'Product search results'
    return addMessage(content, 'product_links', undefined, links)
  }

  // Update or add streaming bot message
  const updateOrAddBotMessage = (content: string, isAudio = false): string => {
    if (!content || content.trim() === '' || content === 'null') {
      return ''
    }

    const cleanedContent = cleanText(content)
    if (!cleanedContent) {
      return ''
    }

    let messageId = ''
    
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1]
      const now = new Date()
      
      if (lastMessage && 
          lastMessage.type === 'bot' && 
          lastMessage.isStreaming !== false &&
          lastMessage.isAudio === isAudio &&
          (now.getTime() - lastMessage.timestamp.getTime()) < 30000) {
        
        if (lastMessage.content === cleanedContent) {
          messageId = lastMessage.id
          return prev
        }
        
        const updatedMessage = {
          ...lastMessage,
          content: cleanedContent,
          isStreaming: true,
          timestamp: lastMessage.timestamp
        }
        
        const updatedMessages = [...prev]
        updatedMessages[updatedMessages.length - 1] = updatedMessage
        messageId = updatedMessage.id
        return updatedMessages
      } else {
        const veryRecentDuplicate = prev.find(msg => 
          msg.type === 'bot' && 
          msg.isAudio === isAudio &&
          msg.content === cleanedContent &&
          (now.getTime() - msg.timestamp.getTime()) < 100
        )
        
        if (veryRecentDuplicate) {
          messageId = veryRecentDuplicate.id
          return prev
        }
        
        const newMessage: Message = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          type: 'bot',
          content: cleanedContent,
          timestamp: now,
          isAudio,
          isStreaming: true
        }
        
        messageId = newMessage.id
        return [...prev, newMessage]
      }
    })

    return messageId
  }

  // Finalize streaming message
  const finalizeStreamingMessage = (content?: string, isAudio = false) => {
    if (content && content.trim() && content !== 'null') {
      setMessages(prev => {
        for (let i = prev.length - 1; i >= 0; i--) {
          const message = prev[i]
          if (message.type === 'bot' && 
              message.isStreaming &&
              message.isAudio === isAudio) {
            
            const finalizedMessage = {
              ...message,
              content: cleanText(content),
              isStreaming: false
            }
            
            const updatedMessages = [...prev]
            updatedMessages[i] = finalizedMessage
            return updatedMessages
          }
        }
        
        const newMessage: Message = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
          type: 'bot',
          content: cleanText(content),
          timestamp: new Date(),
          isAudio,
          isStreaming: false
        }
        
        return [...prev, newMessage]
      })
    }
  }

  const clearConversation = useCallback(() => {
    setMessages([])
    localStorage.removeItem(CONVERSATION_STORAGE_KEY)
  }, [])

  const forceResetConversation = useCallback(() => {
    setMessages([])
    localStorage.removeItem(CONVERSATION_STORAGE_KEY)
  }, [])

  const clearProductMessages = useCallback(() => {
    setMessages(prev => {
      const filteredMessages = prev.filter(msg => msg.type !== 'product_links')
      return filteredMessages
    })
  }, [])

  return {
    messages,
    addBotMessage,
    addHumanMessage,
    addStatusMessage,
    addToolMessage,
    addProductLinks,
    updateOrAddBotMessage,
    finalizeStreamingMessage,
    clearConversation,
    clearProductMessages,
    forceResetConversation
  }
}
