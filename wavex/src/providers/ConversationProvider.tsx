'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { useConversation } from '../hooks/useConversation'
import type { Message } from '../hooks/useConversation'

interface ConversationContextType {
  messages: Message[]
  addHumanMessage: (content: string, fileInfo?: { name: string; type: string; url: string }) => void
  addBotMessage: (content: string) => void
  addToolMessage: (content: string) => void
  addStatusMessage: (content: string) => void
  addProductLinks: (links: any[], functionName?: string) => void
  updateOrAddBotMessage: (content: string, isTranscription?: boolean) => void
  finalizeStreamingMessage: (content: string, isTranscription?: boolean) => void
  clearProductMessages: () => void
  clearConversation: () => void
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined)

interface ConversationProviderProps {
  children: ReactNode
}

export const ConversationProvider = ({ children }: ConversationProviderProps) => {
  const conversationHook = useConversation()

  return (
    <ConversationContext.Provider value={conversationHook}>
      {children}
    </ConversationContext.Provider>
  )
}

export const useGlobalConversation = () => {
  const context = useContext(ConversationContext)
  if (context === undefined) {
    throw new Error('useGlobalConversation must be used within a ConversationProvider')
  }
  return context
}
