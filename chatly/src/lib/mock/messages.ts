import type { MockMessage } from './types'

export const mockMessages: MockMessage[] = [
  // Conversation with Sarah (user-1)
  {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    content: "Hey! How's your day going?",
    created_at: '2024-03-15T09:00:00Z',
    status: 'read',
  },
  {
    id: 'msg-2',
    conversation_id: 'conv-1',
    sender_id: 'current-user',
    content: 'Pretty good! Just finished that project we talked about.',
    created_at: '2024-03-15T09:05:00Z',
    status: 'read',
  },
  {
    id: 'msg-3',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    content: "That's awesome! Can't wait to see it 🎉",
    created_at: '2024-03-15T09:07:00Z',
    status: 'read',
  },
  {
    id: 'msg-4',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    content: 'Did you use the new design system we discussed?',
    created_at: '2024-03-15T09:08:00Z',
    status: 'read',
  },
  {
    id: 'msg-5',
    conversation_id: 'conv-1',
    sender_id: 'current-user',
    content: "Yes! It's looking really clean. I'll share the link soon.",
    created_at: '2024-03-15T09:10:00Z',
    status: 'read',
  },

  // Conversation with Michael (user-2)
  {
    id: 'msg-6',
    conversation_id: 'conv-2',
    sender_id: 'current-user',
    content: 'Meeting at 3pm today?',
    created_at: '2024-03-14T14:00:00Z',
    status: 'read',
  },
  {
    id: 'msg-7',
    conversation_id: 'conv-2',
    sender_id: 'user-2',
    content: "Yes, conference room B. I'll bring the presentation.",
    created_at: '2024-03-14T14:05:00Z',
    status: 'read',
  },
  {
    id: 'msg-8',
    conversation_id: 'conv-2',
    sender_id: 'current-user',
    content: 'Perfect. Should we order lunch before?',
    created_at: '2024-03-14T14:06:00Z',
    status: 'read',
  },
  {
    id: 'msg-9',
    conversation_id: 'conv-2',
    sender_id: 'user-2',
    content: 'Sounds good! Thai or Italian?',
    created_at: '2024-03-14T14:08:00Z',
    status: 'read',
  },

  // Conversation with Emma (user-3)
  {
    id: 'msg-10',
    conversation_id: 'conv-3',
    sender_id: 'user-3',
    content: 'Thanks for the feedback on my proposal!',
    created_at: '2024-03-14T11:00:00Z',
    status: 'read',
  },
  {
    id: 'msg-11',
    conversation_id: 'conv-3',
    sender_id: 'current-user',
    content: "No problem! It's looking great. Just a few minor suggestions.",
    created_at: '2024-03-14T11:15:00Z',
    status: 'read',
  },
  {
    id: 'msg-12',
    conversation_id: 'conv-3',
    sender_id: 'user-3',
    content: 'I made the changes you suggested. Check it out when you have time.',
    created_at: '2024-03-14T11:30:00Z',
    status: 'read',
  },

  // Conversation with David (user-4)
  {
    id: 'msg-13',
    conversation_id: 'conv-4',
    sender_id: 'user-4',
    content: 'The quarterly metrics are in 📊',
    created_at: '2024-03-13T16:00:00Z',
    status: 'read',
  },
  {
    id: 'msg-14',
    conversation_id: 'conv-4',
    sender_id: 'current-user',
    content: 'How do they look?',
    created_at: '2024-03-13T16:02:00Z',
    status: 'read',
  },
  {
    id: 'msg-15',
    conversation_id: 'conv-4',
    sender_id: 'user-4',
    content: 'Better than expected! 23% growth quarter over quarter.',
    created_at: '2024-03-13T16:05:00Z',
    status: 'read',
  },
  {
    id: 'msg-16',
    conversation_id: 'conv-4',
    sender_id: 'current-user',
    content: "That's fantastic news! 🎉",
    created_at: '2024-03-13T16:06:00Z',
    status: 'read',
  },

  // Conversation with Lisa (user-5)
  {
    id: 'msg-17',
    conversation_id: 'conv-5',
    sender_id: 'user-5',
    content: 'Hey, are you free this weekend?',
    created_at: '2024-03-12T19:00:00Z',
    status: 'read',
  },
  {
    id: 'msg-18',
    conversation_id: 'conv-5',
    sender_id: 'current-user',
    content: 'Saturday works. What did you have in mind?',
    created_at: '2024-03-12T19:30:00Z',
    status: 'read',
  },
  {
    id: 'msg-19',
    conversation_id: 'conv-5',
    sender_id: 'user-5',
    content: "Let's catch a movie! There's that new sci-fi film everyone's talking about.",
    created_at: '2024-03-12T19:35:00Z',
    status: 'read',
  },

  // Conversation with Alex (user-6)
  {
    id: 'msg-20',
    conversation_id: 'conv-6',
    sender_id: 'user-6',
    content: 'Check out this cool animation I made!',
    created_at: '2024-03-11T13:00:00Z',
    status: 'read',
  },
  {
    id: 'msg-21',
    conversation_id: 'conv-6',
    sender_id: 'current-user',
    content: "Wow, that's smooth! What library did you use?",
    created_at: '2024-03-11T13:10:00Z',
    status: 'read',
  },
  {
    id: 'msg-22',
    conversation_id: 'conv-6',
    sender_id: 'user-6',
    content: 'Framer Motion + some custom CSS. I can share the code if you want.',
    created_at: '2024-03-11T13:15:00Z',
    status: 'read',
  },

  // Conversation with Maria (user-7)
  {
    id: 'msg-23',
    conversation_id: 'conv-7',
    sender_id: 'user-7',
    content: 'The ML model is ready for testing!',
    created_at: '2024-03-10T10:00:00Z',
    status: 'read',
  },
  {
    id: 'msg-24',
    conversation_id: 'conv-7',
    sender_id: 'current-user',
    content: 'Great work! What accuracy did you achieve?',
    created_at: '2024-03-10T10:05:00Z',
    status: 'read',
  },
  {
    id: 'msg-25',
    conversation_id: 'conv-7',
    sender_id: 'user-7',
    content: '92.4% on the test set. The confusion matrix looks really clean.',
    created_at: '2024-03-10T10:08:00Z',
    status: 'read',
  },

  // Conversation with James (user-8)
  {
    id: 'msg-26',
    conversation_id: 'conv-8',
    sender_id: 'current-user',
    content: 'The deployment pipeline is fixed now!',
    created_at: '2024-03-09T15:00:00Z',
    status: 'read',
  },
  {
    id: 'msg-27',
    conversation_id: 'conv-8',
    sender_id: 'user-8',
    content: 'Amazing! I was getting frustrated with those timeouts 😅',
    created_at: '2024-03-09T15:05:00Z',
    status: 'read',
  },
  {
    id: 'msg-28',
    conversation_id: 'conv-8',
    sender_id: 'current-user',
    content: 'It was a Docker configuration issue. All good now!',
    created_at: '2024-03-09T15:10:00Z',
    status: 'read',
  },

  // More messages for Sarah (to have more chat history)
  {
    id: 'msg-29',
    conversation_id: 'conv-1',
    sender_id: 'current-user',
    content: "Here's the link: https://project-demo.vercel.app",
    created_at: '2024-03-15T09:30:00Z',
    status: 'delivered',
  },
  {
    id: 'msg-30',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    content: 'Oh wow, this looks incredible! I love the animations 🔥',
    created_at: '2024-03-15T09:35:00Z',
    status: 'read',
  },
]

export function getMessagesByConversation(conversationId: string): MockMessage[] {
  return mockMessages
    .filter((m) => m.conversation_id === conversationId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}
