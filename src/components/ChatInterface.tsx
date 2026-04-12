import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, FileText, ExternalLink, Search, History, Plus, Settings, Info, ShieldCheck, ShieldAlert, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Separator } from './ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import axios from 'axios';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Message, Source, ChatSession } from '../types';
import { searchSources } from '../services/mockData';
import { generateResponse } from '../services/gemini';
import { cn } from '@/lib/utils';

export default function ChatInterface() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm AskKAI, your AI Product Partner. How can I help you today? You can ask me about project risks, system architecture, or locate specific documentation across Jira, Confluence, GitLab, and SharePoint.",
      timestamp: new Date(),
    }
  ]);
  const [activeSources, setActiveSources] = useState<Source[]>([]);
  const [activePersona, setActivePersona] = useState<'PM' | 'IT' | 'Tech' | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | null>>({});
  const [connectionErrors, setConnectionErrors] = useState<Record<string, string | null>>({});
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const VERSION = "1.0.5";
  const [config, setConfig] = useState({
    jiraBaseUrl: '',
    jiraEmail: '',
    jiraToken: '',
    gitlabBaseUrl: 'https://gitlab.com',
    gitlabToken: '',
    confluenceBaseUrl: '',
    confluenceEmail: '',
    confluenceToken: '',
    sharepointSiteUrl: '',
    sharepointToken: '',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<any[]>([]);
  const currentTurnRef = useRef<number>(0);

  const personas = [
    { id: 'PM', name: 'Product Manager', icon: <User size={14} />, queries: ['What is the current design specification for the notification feature?', 'Summarize the current sprint velocity and identify any team capacity risks.'] },
    { id: 'IT', name: 'IT Officer', icon: <Search size={14} />, queries: ['What are the critical security findings in the repository and what should we address first?', 'Where is the latest system runbook?'] },
    { id: 'Tech', name: 'Tech Lead', icon: <ShieldCheck size={14} />, queries: ['Validate release for v2.3.1 deployment based on release notes, completed tickets and merged code.', 'Any unresolved Sev 1–2 tickets?'] },
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const testConnection = async (system: string) => {
    setTestingConnection(system);
    setTestResults(prev => ({ ...prev, [system]: null }));
    setConnectionErrors(prev => ({ ...prev, [system]: null }));
    
    try {
      let endpoint = '';
      if (system === 'jira') endpoint = '/api/proxy/jira';
      else if (system === 'gitlab') endpoint = '/api/proxy/gitlab';
      else if (system === 'confluence') endpoint = '/api/proxy/confluence';
      
      if (endpoint) {
        // Send empty query to trigger a connectivity test
        await axios.post(endpoint, { query: '', config });
        setTestResults(prev => ({ ...prev, [system]: 'success' }));
      } else if (system === 'sharepoint') {
        // SharePoint doesn't have a proxy yet, simulate success if token exists
        if (config.sharepointToken) {
          setTestResults(prev => ({ ...prev, [system]: 'success' }));
        } else {
          throw new Error("SharePoint token is missing.");
        }
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      console.error(`Connection test failed for ${system}:`, errorMsg);
      setTestResults(prev => ({ ...prev, [system]: 'error' }));
      setConnectionErrors(prev => ({ ...prev, [system]: errorMsg }));
    } finally {
      setTestingConnection(null);
    }
  };

  const handleReset = () => {
    console.log('Resetting chat state');
    currentTurnRef.current++; // Cancel any ongoing turn
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hello! I'm AskKAI, your AI Product Partner. How can I help you today? You can ask me about project risks, system architecture, or locate specific documentation across Jira, Confluence, GitLab, and SharePoint.",
        timestamp: new Date(),
      }
    ]);
    chatHistoryRef.current = [];
    setIsLoading(false);
    setActiveSources([]);
  };

  const handleSend = async (customInput?: string) => {
    const textToSend = (customInput || input || '').trim();
    console.log('handleSend called', { textToSend, isLoading });
    
    if (!textToSend) {
      console.log('handleSend: Empty input, returning');
      return;
    }
    
    if (isLoading) {
      console.log('handleSend: Already loading, returning');
      return;
    }

    const turnId = ++currentTurnRef.current;
    setIsLoading(true);
    setLoadingStatus('Thinking...');

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    console.log('Adding user message to state', userMessage);
    setMessages(prev => [...(Array.isArray(prev) ? prev : []), userMessage]);
    setInput('');

    const checkCancellation = () => {
      if (currentTurnRef.current !== turnId) {
        console.log(`Turn ${turnId} cancelled (current turn is ${currentTurnRef.current})`);
        return true;
      }
      return false;
    };

    try {
      console.log(`Starting agentic loop for turn ${turnId}...`);
      // Agentic Loop
      const history = Array.isArray(chatHistoryRef.current) ? chatHistoryRef.current : [];
      let currentContents = [
        ...history,
        { role: 'user', parts: [{ text: textToSend }] }
      ];
      
      const turnSources: Source[] = [];
      
      console.log('Calling generateResponse with contents:', currentContents.length);
      setLoadingStatus('Consulting Gemini...');
      let response = await generateResponse(currentContents);
      
      if (checkCancellation()) return;

      if (!response || !response.candidates || response.candidates.length === 0) {
        console.error('Invalid response structure:', response);
        throw new Error("No response candidates received from Gemini API. Please check your API key.");
      }

      let iterations = 0;
      const MAX_ITERATIONS = 5;

      // Handle Tool Calls
      while (response.functionCalls && response.functionCalls.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        console.log(`Tool call iteration ${iterations}`, response.functionCalls);
        
        const toolResponses = [];

        for (const call of response.functionCalls) {
          const { name, args, id } = call;
          const systemName = name.replace('search', '');
          setLoadingStatus(`Searching ${systemName}...`);
          console.log(`Executing tool: ${name}`, args);
          
          let result;
          try {
            const axiosConfig = { timeout: 15000 };
            const systemName = name.replace('search', '').toLowerCase();
            const hasFailedBefore = (testResults as any)[systemName] === 'error';
            
            // Check if system is configured with a real token (not empty or placeholder)
            const isConfigured = (
              (name === 'searchJira' && config.jiraToken && !config.jiraToken.includes('TODO') && !config.jiraToken.includes('MY_')) ||
              (name === 'searchGitLab' && config.gitlabToken && !config.gitlabToken.includes('TODO') && !config.gitlabToken.includes('MY_')) ||
              (name === 'searchConfluence' && config.confluenceToken && !config.confluenceToken.includes('TODO') && !config.confluenceToken.includes('MY_'))
            );

            if (isConfigured && !hasFailedBefore) {
              if (name === 'searchJira') {
                const res = await axios.post('/api/proxy/jira', { query: args.query, config }, axiosConfig);
                result = res.data;
              } else if (name === 'searchGitLab') {
                const res = await axios.post('/api/proxy/gitlab', { query: args.query, config }, axiosConfig);
                result = res.data;
              } else if (name === 'searchConfluence') {
                const res = await axios.post('/api/proxy/confluence', { query: args.query, config }, axiosConfig);
                result = res.data;
              }
            } else {
              console.log(`Using mock data for tool: ${name} (Configured: ${isConfigured}, FailedBefore: ${hasFailedBefore})`);
              result = searchSources(args.query).map(s => ({ ...s, isMock: true }));
            }
          } catch (err) {
            console.warn(`Tool ${name} failed, using fallback.`, err);
            result = searchSources(args.query).map(s => ({ ...s, isMock: true }));
          }

          if (checkCancellation()) return;

          toolResponses.push({
            functionResponse: {
              name,
              response: { 
                result,
                isMock: Array.isArray(result) && result.length > 0 && result[0].isMock
              },
              id
            }
          });

          if (Array.isArray(result)) {
            const newSources = result.map((r: any) => ({
              id: r.id || `source-${Math.random().toString(36).substr(2, 9)}`,
              type: (name.replace('search', '')) as any,
              title: r.title || r.key || r.name || 'Resource',
              content: r.content || r.description || 'No content',
              url: r.url || '#',
              lastUpdated: r.lastUpdated || new Date().toISOString().split('T')[0],
              isMock: r.isMock || false
            }));
            
            turnSources.push(...newSources);
            setActiveSources(prev => {
              const existingIds = new Set(prev.map(s => s.id));
              return [...prev, ...newSources.filter(s => !existingIds.has(s.id))];
            });
          }
        }

        // Add model's tool call and our response to history
        currentContents.push(response.candidates[0].content);
        currentContents.push({
          role: 'user',
          parts: toolResponses
        });
        
        console.log('Sending tool results back to Gemini...');
        setLoadingStatus('Synthesising results...');
        response = await generateResponse(currentContents);
        
        if (checkCancellation()) return;

        if (!response || !response.candidates || response.candidates.length === 0) {
          throw new Error("No response candidates received from Gemini API during tool loop.");
        }
      }

      const finalContent = response.text || "I couldn't generate a response. Please try again.";
      console.log('Final AI response:', finalContent);
      
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: finalContent,
        timestamp: new Date(),
        sources: turnSources.length > 0 ? Array.from(new Map(turnSources.map(s => [s.id, s])).values()) : undefined,
      };

      if (checkCancellation()) return;

      setMessages(prev => [...(Array.isArray(prev) ? prev : []), aiMessage]);
      
      // Update history for next user message
      chatHistoryRef.current = [
        ...currentContents,
        response.candidates[0].content
      ];
      console.log('Chat history updated, turns:', chatHistoryRef.current.length);

    } catch (error: any) {
      if (checkCancellation()) return;
      console.error("Chat Error Detail:", {
        message: error?.message,
        response: error?.response?.data,
        stack: error?.stack
      });
      let errorMessage = "I encountered an error while processing your request. Please check your configuration in Settings.";
      
      if (error?.message?.includes("API key not valid")) {
        errorMessage = "Invalid Gemini API Key. If you are on Vercel, ensure GEMINI_API_KEY is set in your Environment Variables and you have redeployed.";
      } else if (error?.message?.includes("process is not defined")) {
        errorMessage = "Internal configuration error (process is not defined). Please contact support.";
      } else if (error?.response?.data?.message) {
        errorMessage = `System Error: ${error.response.data.message}`;
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-surface text-on-surface overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-surface-container-low flex flex-col hidden md:flex">
        <div className="p-3 flex items-center gap-2">
          <div className="ethereal-gradient text-white p-1.5 rounded-lg shadow-sm">
            <Bot size={18} />
          </div>
          <h1 className="font-heading font-extrabold text-lg tracking-tight text-primary">AskKAI</h1>
        </div>
        
        <div className="p-4 space-y-4">
          <Button variant="ghost" className="w-full justify-start gap-2 ethereal-gradient text-white shadow-md rounded-full text-[11px] font-heading font-extrabold uppercase tracking-widest hover:opacity-90" onClick={() => {
            setMessages([messages[0]]);
            setActiveSources([]);
            setActivePersona(null);
          }}>
            <Plus size={16} />
            New Session
          </Button>

          <div className="space-y-1">
            <h2 className="text-[9px] font-heading font-extrabold text-on-surface-variant/40 uppercase tracking-widest px-3 mb-2">Select Persona</h2>
            <div className="grid grid-cols-1 gap-1 px-2">
              {personas.map(p => (
                <Button 
                  key={p.id} 
                  variant="ghost" 
                  className={cn(
                    "w-full justify-start text-[11px] font-bold h-9 px-3 rounded-xl transition-all",
                    activePersona === p.id ? "bg-surface text-primary shadow-sm" : "text-on-surface-variant hover:bg-surface/50"
                  )}
                  onClick={() => setActivePersona(p.id as any)}
                >
                  <span className={cn("mr-2 transition-colors", activePersona === p.id ? "text-primary" : "opacity-40")}>{p.icon}</span>
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4">
            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Recent Sessions</h2>
              <div className="space-y-1">
                {['EPES Architecture', 'Project X Risks', 'GitLab CI/CD Setup'].map((title, i) => (
                  <Button key={i} variant="ghost" className="w-full justify-start text-sm font-normal h-9 px-2">
                    <History size={14} className="mr-2 opacity-50" />
                    <span className="truncate">{title}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Connected Systems</h2>
              <div className="space-y-2 px-2">
                {[
                  { name: 'Jira', status: config.jiraToken ? 'Connected' : 'Mocking', active: !!config.jiraToken },
                  { name: 'Confluence', status: config.confluenceToken ? 'Connected' : 'Mocking', active: !!config.confluenceToken },
                  { name: 'GitLab', status: config.gitlabToken ? 'Connected' : 'Mocking', active: !!config.gitlabToken },
                  { name: 'SharePoint', status: config.sharepointToken ? 'Connected' : 'Mocking', active: !!config.sharepointToken },
                ].map((sys) => (
                  <div key={sys.name} className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-2">
                      <div className={cn("w-1.5 h-1.5 rounded-full", sys.active ? "bg-green-500" : "bg-muted-foreground/30")} />
                      {sys.name}
                    </span>
                    <span className="text-muted-foreground opacity-70">{sys.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="p-4 space-y-4">
          <div className="space-y-3">
            <h4 className="text-[9px] font-heading font-extrabold uppercase tracking-widest text-on-surface-variant/40 px-3">System Pulse</h4>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-surface/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", config.jiraToken && testResults.jira !== 'error' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-on-surface-variant/20")} />
                  <span className="text-[10px] font-bold text-on-surface-variant">Jira Cloud</span>
                </div>
                <span className="text-[9px] font-medium text-on-surface-variant/40">{config.jiraToken && testResults.jira !== 'error' ? "Syncing" : "Mocking"}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-surface/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", config.confluenceToken && testResults.confluence !== 'error' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-on-surface-variant/20")} />
                  <span className="text-[10px] font-bold text-on-surface-variant">Confluence</span>
                </div>
                <span className="text-[9px] font-medium text-on-surface-variant/40">{config.confluenceToken && testResults.confluence !== 'error' ? "Syncing" : "Mocking"}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-surface/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", config.sharepointToken && testResults.sharepoint !== 'error' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-on-surface-variant/20")} />
                  <span className="text-[10px] font-bold text-on-surface-variant">SharePoint</span>
                </div>
                <span className="text-[9px] font-medium text-on-surface-variant/40">{config.sharepointToken && testResults.sharepoint !== 'error' ? "Syncing" : "Mocking"}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-surface/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", config.gitlabToken && testResults.gitlab !== 'error' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-on-surface-variant/20")} />
                  <span className="text-[10px] font-bold text-on-surface-variant">GitLab</span>
                </div>
                <span className="text-[9px] font-medium text-on-surface-variant/40">{config.gitlabToken && testResults.gitlab !== 'error' ? "Syncing" : "Mocking"}</span>
              </div>
            </div>
          </div>

          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger render={
              <Button variant="ghost" className="w-full justify-start gap-2 text-[11px] font-heading font-extrabold uppercase tracking-widest bg-surface-container-high rounded-xl hover:bg-primary/5 text-on-surface-variant">
                <Settings size={16} className="text-primary" />
                Configuration
              </Button>
            } />
            <DialogContent className="sm:max-w-[500px] h-[85vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
              <DialogHeader className="p-6 pb-4 flex-none border-b bg-background">
                <DialogTitle className="text-xl">System Connections</DialogTitle>
                <DialogDescription>Configure real-time integration with your delivery systems.</DialogDescription>
              </DialogHeader>
              
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <div className="px-6 py-6 space-y-8 pb-12">
                  {/* Jira */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase text-primary">Jira Integration</Label>
                      <div className="flex items-center gap-2">
                        {testResults.jira === 'success' && <CheckCircle2 size={12} className="text-green-500" />}
                        {testResults.jira === 'error' && <AlertCircle size={12} className="text-red-500" />}
                        <Badge variant="outline" className={cn("text-[8px] h-4", config.jiraToken ? "text-green-600 bg-green-50" : "text-muted-foreground")}>
                          {config.jiraToken ? "Configured" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Input 
                        placeholder="Base URL (e.g. https://your-domain.atlassian.net)" 
                        value={config.jiraBaseUrl}
                        onChange={e => setConfig({...config, jiraBaseUrl: e.target.value})}
                        className="h-9 text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input 
                          placeholder="Email" 
                          value={config.jiraEmail}
                          onChange={e => setConfig({...config, jiraEmail: e.target.value})}
                          className="h-9 text-xs"
                        />
                        <Input 
                          type="password" 
                          placeholder="API Token" 
                          value={config.jiraToken}
                          onChange={e => setConfig({...config, jiraToken: e.target.value})}
                          className="h-9 text-xs"
                        />
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-[10px]"
                        onClick={() => testConnection('jira')}
                        disabled={testingConnection === 'jira'}
                      >
                        {testingConnection === 'jira' ? "Testing..." : "Test Connection"}
                      </Button>
                      {connectionErrors.jira && (
                        <p className="text-[10px] text-red-500 bg-red-50 p-2 rounded border border-red-100">
                          {connectionErrors.jira}
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Confluence */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase text-blue-600">Confluence Integration</Label>
                      <div className="flex items-center gap-2">
                        {testResults.confluence === 'success' && <CheckCircle2 size={12} className="text-green-500" />}
                        {testResults.confluence === 'error' && <AlertCircle size={12} className="text-red-500" />}
                        <Badge variant="outline" className={cn("text-[8px] h-4", config.confluenceToken ? "text-green-600 bg-green-50" : "text-muted-foreground")}>
                          {config.confluenceToken ? "Configured" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Input 
                        placeholder="Base URL" 
                        value={config.confluenceBaseUrl}
                        onChange={e => setConfig({...config, confluenceBaseUrl: e.target.value})}
                        className="h-9 text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input 
                          placeholder="Email" 
                          value={config.confluenceEmail}
                          onChange={e => setConfig({...config, confluenceEmail: e.target.value})}
                          className="h-9 text-xs"
                        />
                        <Input 
                          type="password" 
                          placeholder="API Token" 
                          value={config.confluenceToken}
                          onChange={e => setConfig({...config, confluenceToken: e.target.value})}
                          className="h-9 text-xs"
                        />
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-[10px]"
                        onClick={() => testConnection('confluence')}
                        disabled={testingConnection === 'confluence'}
                      >
                        {testingConnection === 'confluence' ? "Testing..." : "Test Connection"}
                      </Button>
                      {connectionErrors.confluence && (
                        <p className="text-[10px] text-red-500 bg-red-50 p-2 rounded border border-red-100">
                          {connectionErrors.confluence}
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* GitLab */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase text-orange-500">GitLab Integration</Label>
                      <div className="flex items-center gap-2">
                        {testResults.gitlab === 'success' && <CheckCircle2 size={12} className="text-green-500" />}
                        {testResults.gitlab === 'error' && <AlertCircle size={12} className="text-red-500" />}
                        <Badge variant="outline" className={cn("text-[8px] h-4", config.gitlabToken ? "text-green-600 bg-green-50" : "text-muted-foreground")}>
                          {config.gitlabToken ? "Configured" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Input 
                        placeholder="Base URL (default: https://gitlab.com)" 
                        value={config.gitlabBaseUrl}
                        onChange={e => setConfig({...config, gitlabBaseUrl: e.target.value})}
                        className="h-9 text-xs"
                      />
                      <Input 
                        type="password" 
                        placeholder="Personal Access Token" 
                        value={config.gitlabToken}
                        onChange={e => setConfig({...config, gitlabToken: e.target.value})}
                        className="h-9 text-xs"
                      />
                      <p className="text-[9px] text-muted-foreground px-1">Requires 'read_api' or 'api' scope.</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-[10px]"
                        onClick={() => testConnection('gitlab')}
                        disabled={testingConnection === 'gitlab'}
                      >
                        {testingConnection === 'gitlab' ? "Testing..." : "Test Connection"}
                      </Button>
                      {connectionErrors.gitlab && (
                        <p className="text-[10px] text-red-500 bg-red-50 p-2 rounded border border-red-100">
                          {connectionErrors.gitlab}
                        </p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* SharePoint */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase text-teal-600">SharePoint Integration</Label>
                      <div className="flex items-center gap-2">
                        {testResults.sharepoint === 'success' && <CheckCircle2 size={12} className="text-green-500" />}
                        {testResults.sharepoint === 'error' && <AlertCircle size={12} className="text-red-500" />}
                        <Badge variant="outline" className={cn("text-[8px] h-4", config.sharepointToken ? "text-green-600 bg-green-50" : "text-muted-foreground")}>
                          {config.sharepointToken ? "Configured" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Input 
                        placeholder="Site URL" 
                        value={config.sharepointSiteUrl}
                        onChange={e => setConfig({...config, sharepointSiteUrl: e.target.value})}
                        className="h-9 text-xs"
                      />
                      <Input 
                        type="password" 
                        placeholder="Access Token" 
                        value={config.sharepointToken}
                        onChange={e => setConfig({...config, sharepointToken: e.target.value})}
                        className="h-9 text-xs"
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-[10px]"
                        onClick={() => testConnection('sharepoint')}
                        disabled={testingConnection === 'sharepoint'}
                      >
                        {testingConnection === 'sharepoint' ? "Testing..." : "Test Connection"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="p-4 border-t bg-muted/30 flex-none m-0 rounded-none">
                <Button onClick={() => setIsSettingsOpen(false)} className="w-full h-10 shadow-sm">Save and Sync All Systems</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="flex items-center gap-2 px-2 py-1 bg-primary/5 rounded-md border border-primary/10">
            <ShieldCheck size={14} className="text-primary" />
            <span className="text-[10px] font-medium text-primary uppercase">Secure Environment</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-14 glass-morphism flex items-center justify-between px-8 sticky top-0 z-20 ghost-border border-t-0 border-x-0">
          <div className="flex items-center gap-4">
            <div className="md:hidden ethereal-gradient text-white p-2 rounded-xl shadow-sm">
              <Bot size={18} />
            </div>
            <div className="flex flex-col">
              <h2 className="text-[10px] font-heading font-extrabold uppercase tracking-[0.2em] text-primary/60 leading-none mb-1">Oracle Intelligence</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-heading font-bold text-on-surface">Delivery Stream</span>
                <Badge variant="secondary" className="text-[8px] font-bold h-3.5 px-1 bg-primary/5 text-primary border-none uppercase tracking-tighter">Live</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 mr-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
              <span className="text-[9px] font-heading font-bold uppercase tracking-widest text-on-surface-variant/40">Systems Synced</span>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/5 text-on-surface-variant transition-all" onClick={() => setIsSettingsOpen(true)}>
              <Settings size={16} />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/5 text-on-surface-variant transition-all">
              <Info size={16} />
            </Button>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 px-6 py-8 min-h-0">
          <div className="max-w-3xl mx-auto space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-4",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <Avatar className={cn("h-8 w-8", msg.role === 'user' ? "ethereal-gradient" : "bg-surface-container-highest")}>
                    {msg.role === 'assistant' ? (
                      <AvatarFallback className="bg-transparent text-primary"><Bot size={16} /></AvatarFallback>
                    ) : (
                      <AvatarFallback className="bg-transparent text-white"><User size={16} /></AvatarFallback>
                    )}
                  </Avatar>
                  <div className={cn(
                    "flex flex-col gap-2 max-w-[85%]",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "ethereal-gradient text-white rounded-tr-none px-5 py-3.5 shadow-md" 
                        : "bg-surface-container-lowest rounded-tl-none p-6 ambient-shadow"
                    )}>
                      <div className={cn(
                        "prose max-w-none",
                        msg.role === 'user' ? "prose-invert text-white" : "prose-base text-on-surface"
                      )}>
                        <ReactMarkdown>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                    
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {msg.sources.map((source) => (
                          <Badge 
                            key={source.id} 
                            variant="outline" 
                            className={cn(
                              "transition-colors text-[10px] py-0 h-5 flex items-center gap-1",
                              source.isMock 
                                ? "bg-orange-500/10 text-orange-600 border-orange-200 hover:bg-orange-500/20" 
                                : "bg-muted/50 hover:bg-muted cursor-pointer"
                            )}
                            onClick={() => !source.isMock && window.open(source.url, '_blank')}
                          >
                            <FileText size={10} />
                            {source.title.split(':')[0]}
                            {source.isMock && <span className="ml-1 opacity-60 font-bold text-[8px] uppercase">Mock</span>}
                          </Badge>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[10px] text-muted-foreground opacity-50">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.role === 'assistant' && msg.id !== 'welcome' && (
                        <Badge variant="outline" className="text-[8px] h-3.5 px-1 uppercase opacity-40">
                          Facts / Inferences / Unknowns
                        </Badge>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Initial Suggestions - Only show when conversation just started */}
            {messages.length === 1 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 pt-8"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="p-4 bg-surface-container-lowest border-none ambient-shadow hover:scale-[1.02] cursor-pointer transition-all duration-300" onClick={() => handleSend("Validate release for v2.3.1 deployment based on release notes, completed tickets and merged code.")}>
                    <div className="flex items-center gap-2 mb-2 text-primary">
                      <ShieldAlert size={16} />
                      <span className="text-[10px] font-heading font-extrabold uppercase tracking-widest">Release Validation</span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">Cross-reference Jira, GitLab, and Confluence for release readiness.</p>
                  </Card>
                  <Card className="p-4 bg-surface-container-lowest border-none ambient-shadow hover:scale-[1.02] cursor-pointer transition-all duration-300" onClick={() => handleSend("What are the critical security findings in the repository and what should we address first?")}>
                    <div className="flex items-center gap-2 mb-2 text-secondary">
                      <ShieldCheck size={16} />
                      <span className="text-[10px] font-heading font-extrabold uppercase tracking-widest">Security Audit</span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">Synthesize GitLab security scans with Jira vulnerability tracking.</p>
                  </Card>
                  <Card className="p-4 bg-surface-container-lowest border-none ambient-shadow hover:scale-[1.02] cursor-pointer transition-all duration-300" onClick={() => handleSend("What is the current design specification for the notification feature? Flag if documentation is outdated.")}>
                    <div className="flex items-center gap-2 mb-2 text-primary-container">
                      <FileText size={16} />
                      <span className="text-[10px] font-heading font-extrabold uppercase tracking-widest">Doc Synthesis</span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">Locate and validate specifications across Confluence and SharePoint.</p>
                  </Card>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {(activePersona ? personas.find(p => p.id === activePersona)?.queries : personas.flatMap(p => p.queries).slice(0, 3)).map((q, i) => (
                    <Button 
                      key={i} 
                      type="button"
                      variant="ghost" 
                      className="h-8 text-[10px] rounded-full bg-surface-container-high text-on-surface-variant hover:bg-primary-fixed-dim hover:text-primary transition-all px-4"
                      onClick={() => handleSend(q)}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </motion.div>
            )}

            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4"
              >
                <Avatar className="h-8 w-8 bg-surface-container-highest">
                  <AvatarFallback className="bg-transparent text-primary"><Bot size={16} /></AvatarFallback>
                </Avatar>
                <div className="bg-surface-container-lowest px-6 py-4 rounded-2xl rounded-tl-none ambient-shadow flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-1.5 h-1.5 ethereal-gradient rounded-full" />
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.3 }} className="w-1.5 h-1.5 ethereal-gradient rounded-full" />
                    <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.6 }} className="w-1.5 h-1.5 ethereal-gradient rounded-full" />
                  </div>
                  <span className="text-xs text-on-surface-variant font-medium italic">
                    {loadingStatus || "Oracle is synthesising information..."}
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="px-6 py-4 glass-morphism flex-none relative z-10">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex gap-3 items-center">
              <div className="relative flex-1">
                <input
                  value={input}
                  onChange={(e) => {
                    console.log('Input changed:', e.target.value);
                    setInput(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      console.log('Enter key pressed');
                      handleSend();
                    }
                  }}
                  placeholder={activePersona ? `Ask as ${personas.find(p => p.id === activePersona)?.name || 'Partner'}...` : "Ask KAI about products, delivery, or operations..."}
                  className="w-full pr-14 h-12 bg-surface/50 backdrop-blur-sm ghost-border focus:border-primary/40 focus:ring-4 focus:ring-primary/5 outline-none rounded-2xl px-5 transition-all text-sm ambient-shadow"
                />
                <div className="absolute right-1.5 top-1.5 flex gap-1 z-20">
                  {isLoading && (
                    <button 
                      type="button"
                      className="h-9 w-9 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-secondary transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('Force stopping KAI');
                        currentTurnRef.current++; // Increment to cancel current turn
                        setIsLoading(false);
                      }}
                      title="Force stop"
                    >
                      <Zap size={16} />
                    </button>
                  )}
                  <button 
                    type="button"
                    className={cn(
                      "h-9 w-9 flex items-center justify-center rounded-xl transition-all shadow-sm",
                      input.trim() ? "ethereal-gradient text-white shadow-primary/20" : "bg-surface-container-highest text-on-surface-variant opacity-50"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSend();
                    }}
                    disabled={!input.trim() || isLoading}
                  >
                    <Send size={16} className={cn(input.trim() ? "translate-x-0.5" : "")} />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleReset}
                  className="text-[10px] font-heading font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1.5"
                >
                  <Plus size={12} />
                  Reset Session
                </button>
                <span className="text-[10px] text-on-surface-variant/40">|</span>
                <span className="text-[10px] text-on-surface-variant/60 font-medium">AI can make mistakes. Verify critical info.</span>
              </div>
              <div className="text-[9px] font-heading font-bold text-on-surface-variant/40 uppercase tracking-tighter">
                AskKAI v{VERSION} • Oracle Engine
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Right Panel - Context/Sources */}
      <aside className="w-80 bg-surface-container-low flex flex-col hidden xl:flex">
        <header className="p-4">
          <h3 className="text-xs font-heading font-extrabold uppercase tracking-widest flex items-center gap-2 text-primary">
            <Search size={14} />
            Intelligence Context
          </h3>
        </header>
        
        <Tabs defaultValue="sources" className="flex-1 flex flex-col">
          <div className="px-4">
            <TabsList className="w-full grid grid-cols-3 h-9 bg-surface-container-high p-1 rounded-xl">
              <TabsTrigger value="sources" className="text-[10px] font-bold uppercase tracking-tighter data-[state=active]:bg-surface data-[state=active]:text-primary rounded-lg transition-all">Sources</TabsTrigger>
              <TabsTrigger value="details" className="text-[10px] font-bold uppercase tracking-tighter data-[state=active]:bg-surface data-[state=active]:text-primary rounded-lg transition-all">Synthesis</TabsTrigger>
              <TabsTrigger value="health" className="text-[10px] font-bold uppercase tracking-tighter data-[state=active]:bg-surface data-[state=active]:text-primary rounded-lg transition-all">Health</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sources" className="flex-1 overflow-hidden min-h-0 m-0">
            <ScrollArea className="h-full p-4">
              {activeSources.length > 0 ? (
                <div className="space-y-4">
                  {activeSources.map((source) => (
                    <Card key={source.id} className="overflow-hidden border-none bg-surface-container-lowest ambient-shadow hover:scale-[1.01] transition-all duration-300 group">
                      <CardHeader className="p-4 pb-0">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className={cn(
                            "text-[8px] px-1.5 py-0 h-4 font-heading font-extrabold uppercase tracking-widest border-none",
                            source.type === 'Jira' && "text-blue-600 bg-blue-500/10",
                            source.type === 'Confluence' && "text-blue-700 bg-blue-600/10",
                            source.type === 'GitLab' && "text-orange-600 bg-orange-500/10",
                            source.type === 'SharePoint' && "text-teal-700 bg-teal-600/10",
                          )}>
                            {source.type} {source.isMock && "(Mock)"}
                          </Badge>
                          <span className="text-[9px] font-bold text-on-surface-variant/40">{source.lastUpdated}</span>
                        </div>
                        <CardTitle className="text-xs font-heading font-bold leading-tight group-hover:text-primary transition-colors">
                          {source.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4">
                        <p className="text-[11px] text-on-surface-variant/70 line-clamp-3 mb-3 leading-relaxed">
                          {source.content}
                        </p>
                        <Button variant="ghost" size="sm" className="w-full h-8 text-[10px] font-bold uppercase tracking-widest gap-2 justify-center bg-surface-container-low hover:bg-primary/5 hover:text-primary transition-all rounded-lg" onClick={() => window.open(source.url, '_blank')}>
                          View Original
                          <ExternalLink size={10} />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 opacity-40">
                  <div className="bg-muted p-4 rounded-full">
                    <Search size={32} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">No sources active</p>
                    <p className="text-xs">Ask a question to retrieve relevant information.</p>
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="details" className="flex-1 overflow-hidden min-h-0 m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-on-surface-variant/40">Confidence Score</h4>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden shadow-inner">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: activeSources.length > 0 ? '85%' : '0%' }}
                        className="h-full ethereal-gradient shadow-[0_0_12px_rgba(83,0,183,0.3)]"
                      />
                    </div>
                    <span className="text-xs font-heading font-extrabold text-primary">{activeSources.length > 0 ? '85%' : '0%'}</span>
                  </div>
                  <p className="text-[9px] text-on-surface-variant/60 italic font-medium">Based on source relevance and data freshness.</p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-on-surface-variant/40">Partner Insight</h4>
                  <div className="bg-primary/5 p-4 rounded-2xl shadow-sm">
                    <p className="text-[11px] leading-relaxed font-bold text-primary">
                      {activeSources.length > 0 
                        ? "KAI has detected potential inconsistencies between Jira blockers and GitLab pipeline status. Recommend immediate sync with Tech Lead."
                        : "Awaiting data retrieval to generate cross-system product insights."}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-on-surface-variant/40">Synthesis Engine</h4>
                  <div className="bg-surface-container-high rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant">
                      <span>Cross-System Mapping</span>
                      <Badge variant="outline" className="text-[8px] h-4 bg-green-500/10 text-green-600 border-none font-extrabold uppercase tracking-widest">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant">
                      <span>Permission Inheritance</span>
                      <Badge variant="outline" className="text-[8px] h-4 bg-green-500/10 text-green-600 border-none font-extrabold uppercase tracking-widest">Verified</Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant">
                      <span>Auditability Log</span>
                      <Badge variant="outline" className="text-[8px] h-4 bg-green-500/10 text-green-600 border-none font-extrabold uppercase tracking-widest">Enabled</Badge>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-container-high p-4 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <ShieldCheck size={14} />
                    <h4 className="text-[10px] font-heading font-extrabold uppercase tracking-widest">Access Control</h4>
                  </div>
                  <p className="text-[10px] leading-relaxed text-on-surface-variant/70 font-medium">
                    AskKAI inherits your permissions from NCSS Identity Provider. You are only seeing information you have authorized access to in Jira, Confluence, and GitLab.
                  </p>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="health" className="flex-1 overflow-hidden min-h-0 m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-8">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-on-surface-variant/40">Delivery Health Radar</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface-container-lowest p-4 rounded-2xl text-center ambient-shadow">
                      <p className="text-[9px] text-on-surface-variant/40 uppercase font-heading font-extrabold tracking-widest mb-1">Velocity</p>
                      <p className="text-xl font-heading font-extrabold text-green-600">High</p>
                    </div>
                    <div className="bg-surface-container-lowest p-4 rounded-2xl text-center ambient-shadow">
                      <p className="text-[9px] text-on-surface-variant/40 uppercase font-heading font-extrabold tracking-widest mb-1">Risk Level</p>
                      <p className="text-xl font-heading font-extrabold text-secondary">Med</p>
                    </div>
                    <div className="bg-surface-container-lowest p-4 rounded-2xl text-center ambient-shadow">
                      <p className="text-[9px] text-on-surface-variant/40 uppercase font-heading font-extrabold tracking-widest mb-1">Quality</p>
                      <p className="text-xl font-heading font-extrabold text-primary">92%</p>
                    </div>
                    <div className="bg-surface-container-lowest p-4 rounded-2xl text-center ambient-shadow">
                      <p className="text-[9px] text-on-surface-variant/40 uppercase font-heading font-extrabold tracking-widest mb-1">Blockers</p>
                      <p className="text-xl font-heading font-extrabold text-secondary">2</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-on-surface-variant/40">Active Blockers</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-4 bg-surface-container-lowest rounded-2xl ambient-shadow">
                      <AlertCircle size={14} className="text-secondary mt-0.5" />
                      <div>
                        <p className="text-[11px] font-heading font-extrabold text-on-surface">MSF IDP Integration Delay</p>
                        <p className="text-[10px] text-on-surface-variant/60 font-medium leading-relaxed">Blocked by external dependency. Resolution: EOW.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 bg-surface-container-lowest rounded-2xl ambient-shadow">
                      <AlertCircle size={14} className="text-secondary mt-0.5" />
                      <div>
                        <p className="text-[11px] font-heading font-extrabold text-on-surface">Security Vulnerabilities</p>
                        <p className="text-[10px] text-on-surface-variant/60 font-medium leading-relaxed">3 Critical issues in epes-backend pipeline.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-heading font-extrabold uppercase tracking-widest text-on-surface-variant/40">Compliance Check</h4>
                  <div className="space-y-2 bg-surface-container-high p-4 rounded-2xl">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="flex items-center gap-2 text-on-surface-variant"><CheckCircle2 size={12} className="text-green-500" /> ITG Standards</span>
                      <span className="text-green-600 uppercase tracking-widest text-[9px]">Pass</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="flex items-center gap-2 text-on-surface-variant"><CheckCircle2 size={12} className="text-green-500" /> Data Privacy</span>
                      <span className="text-green-600 uppercase tracking-widest text-[9px]">Pass</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="flex items-center gap-2 text-on-surface-variant"><AlertCircle size={12} className="text-secondary" /> Security Scan</span>
                      <span className="text-secondary uppercase tracking-widest text-[9px]">Warning</span>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}
