export type SourceType = 'Jira' | 'Confluence' | 'GitLab' | 'SharePoint';

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  url: string;
  content: string;
  lastUpdated: string;
  isMock?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  timestamp: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}
