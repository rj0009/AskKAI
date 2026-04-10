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

  const personas = [
    { id: 'PM', name: 'Product Manager', icon: <User size={14} />, queries: ['What’s blocking Sprint 12?', 'Which dependencies are at risk?'] },
    { id: 'IT', name: 'IT Officer', icon: <Search size={14} />, queries: ['Where is the latest system runbook?', 'What changed since last release?'] },
    { id: 'Tech', name: 'Tech Lead', icon: <ShieldCheck size={14} />, queries: ['Any unresolved Sev 1–2 tickets?', 'Is the pipeline stable this week?'] },
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
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const isConfigured = 
      (system === 'jira' && config.jiraToken) ||
      (system === 'confluence' && config.confluenceToken) ||
      (system === 'gitlab' && config.gitlabToken) ||
      (system === 'sharepoint' && config.sharepointToken);

    setTestResults(prev => ({ ...prev, [system]: isConfigured ? 'success' : 'error' }));
    setTestingConnection(null);
  };

  const handleSend = async (customInput?: string) => {
    const textToSend = customInput || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Agentic Loop
      let response = await generateResponse(textToSend, chatHistoryRef.current);
      let message = response.candidates[0].content;

      // Handle Tool Calls
      while (message.parts.some((p: any) => p.functionCall)) {
        const toolCalls = message.parts.filter((p: any) => p.functionCall);
        const toolResponses = [];

        for (const call of toolCalls) {
          const { name, args } = call.functionCall;
          console.log(`Executing tool: ${name}`, args);
          
          let result;
          try {
            if (name === 'searchJira') {
              const res = await axios.post('/api/proxy/jira', { query: args.query as string, config });
              result = res.data;
            } else if (name === 'searchGitLab') {
              const res = await axios.post('/api/proxy/gitlab', { query: args.query as string, config });
              result = res.data;
            } else if (name === 'searchConfluence') {
              const res = await axios.post('/api/proxy/confluence', { query: args.query as string, config });
              result = res.data;
            } else {
              // Fallback to mock for others or if not configured
              result = searchSources(args.query as string).map(s => ({ ...s, isMock: true }));
            }
          } catch (err) {
            result = searchSources(args.query as string).map(s => ({ ...s, isMock: true }));
          }

          toolResponses.push({
            functionResponse: {
              name,
              response: { result }
            }
          });

          // Update active sources for UI
          if (Array.isArray(result)) {
            setActiveSources(prev => [...prev, ...result.map((r: any) => ({
              id: r.id || Math.random().toString(),
              type: name.replace('search', '') as any,
              title: r.title || r.key || r.name || 'Resource',
              content: r.content || r.description || 'No content',
              url: r.url || '#',
              lastUpdated: r.lastUpdated || new Date().toISOString().split('T')[0],
              isMock: r.isMock || false
            }))]);
          }
        }

        // Send tool results back to Gemini
        const nextResponse = await generateResponse(textToSend, [
          ...chatHistoryRef.current,
          { role: 'user', parts: [{ text: textToSend }] },
          message,
          { role: 'function', parts: toolResponses }
        ]);
        
        response = nextResponse;
        message = response.candidates[0].content;
      }

      const aiContent = message.parts.map((p: any) => p.text).join('');
      
      const aiMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: aiContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, aiMessage]);
      
      // Update history
      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: 'user', parts: [{ text: textToSend }] },
        { role: 'model', parts: message.parts }
      ];

    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "I encountered an error while processing your request. Please check your configuration in Settings.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/30 flex flex-col hidden md:flex">
        <div className="p-4 flex items-center gap-2 border-bottom">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
            <Bot size={20} />
          </div>
          <h1 className="font-bold text-lg tracking-tight">AskKAI</h1>
        </div>
        
        <div className="p-4 space-y-4">
          <Button variant="outline" className="w-full justify-start gap-2 border-dashed" onClick={() => {
            setMessages([messages[0]]);
            setActiveSources([]);
            setActivePersona(null);
          }}>
            <Plus size={16} />
            New Session
          </Button>

          <div className="space-y-1">
            <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Select Persona</h2>
            <div className="grid grid-cols-1 gap-1">
              {personas.map(p => (
                <Button 
                  key={p.id} 
                  variant={activePersona === p.id ? "secondary" : "ghost"} 
                  className="w-full justify-start text-xs h-8 px-2"
                  onClick={() => setActivePersona(p.id as any)}
                >
                  <span className="mr-2 opacity-70">{p.icon}</span>
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

        <div className="p-4 border-t space-y-4">
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2">System Pulse</h4>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", config.jiraToken ? "bg-green-500 animate-pulse" : "bg-muted")} />
                  <span className="text-[10px] font-medium">Jira Cloud</span>
                </div>
                <span className="text-[9px] text-muted-foreground">{config.jiraToken ? "Syncing" : "Mocking"}</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", config.confluenceToken ? "bg-green-500 animate-pulse" : "bg-muted")} />
                  <span className="text-[10px] font-medium">Confluence</span>
                </div>
                <span className="text-[9px] text-muted-foreground">{config.confluenceToken ? "Syncing" : "Mocking"}</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", config.sharepointToken ? "bg-green-500 animate-pulse" : "bg-muted")} />
                  <span className="text-[10px] font-medium">SharePoint</span>
                </div>
                <span className="text-[9px] text-muted-foreground">{config.sharepointToken ? "Syncing" : "Mocking"}</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1 rounded hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full", config.gitlabToken ? "bg-green-500 animate-pulse" : "bg-muted")} />
                  <span className="text-[10px] font-medium">GitLab</span>
                </div>
                <span className="text-[9px] text-muted-foreground">{config.gitlabToken ? "Syncing" : "Mocking"}</span>
              </div>
            </div>
          </div>

          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger render={<Button variant="outline" className="w-full justify-start gap-2 text-sm font-bold" />}>
              <Settings size={16} className="text-primary" />
              Configuration
            </DialogTrigger>
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
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-[10px]"
                        onClick={() => testConnection('gitlab')}
                        disabled={testingConnection === 'gitlab'}
                      >
                        {testingConnection === 'gitlab' ? "Testing..." : "Test Connection"}
                      </Button>
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
        <header className="h-14 border-b flex items-center justify-between px-6 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="md:hidden bg-primary text-primary-foreground p-1 rounded-md">
              <Bot size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Delivery Intelligence</h2>
              <p className="text-[10px] text-muted-foreground">NCSS IT / Transformation Office</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] font-medium">v1.0.0-pilot</Badge>
            <Button variant="ghost" size="sm" className="gap-2 text-xs" onClick={() => setIsSettingsOpen(true)}>
              <Settings size={14} />
              Config
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Info size={18} />
            </Button>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6 min-h-0">
          <div className="max-w-3xl mx-auto space-y-8">
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
                  <Avatar className={cn("h-8 w-8 border", msg.role === 'user' ? "bg-primary" : "bg-muted")}>
                    {msg.role === 'assistant' ? (
                      <AvatarFallback className="bg-primary text-primary-foreground"><Bot size={16} /></AvatarFallback>
                    ) : (
                      <AvatarFallback className="bg-muted text-muted-foreground"><User size={16} /></AvatarFallback>
                    )}
                  </Avatar>
                  <div className={cn(
                    "flex flex-col gap-2 max-w-[85%]",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                      msg.role === 'user' 
                        ? "bg-primary text-primary-foreground rounded-tr-none" 
                        : "bg-card border rounded-tl-none"
                    )}>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
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
                            className="bg-muted/50 hover:bg-muted cursor-pointer transition-colors text-[10px] py-0 h-5 flex items-center gap-1"
                            onClick={() => window.open(source.url, '_blank')}
                          >
                            <FileText size={10} />
                            {source.title.split(':')[0]}
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
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4"
              >
                <Avatar className="h-8 w-8 border bg-muted">
                  <AvatarFallback className="bg-primary text-primary-foreground"><Bot size={16} /></AvatarFallback>
                </Avatar>
                <div className="bg-card border px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                  <div className="flex gap-1">
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-primary rounded-full" />
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-primary rounded-full" />
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-primary rounded-full" />
                  </div>
                  <span className="text-xs text-muted-foreground italic">KAI is synthesising information...</span>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-6 bg-background border-t">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Intelligence Actions */}
            <div className="flex flex-wrap gap-2 justify-center mb-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px] rounded-full bg-primary/5 border-primary/20 hover:bg-primary/10 hover:border-primary/40 text-primary font-bold"
                onClick={() => handleSend("Generate a comprehensive Risk Report for the EPES project by cross-referencing Jira blockers and GitLab pipeline failures.")}
              >
                <ShieldAlert size={12} className="mr-1.5" />
                Risk Report
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px] rounded-full bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10 hover:border-yellow-500/40 text-yellow-700 font-bold"
                onClick={() => handleSend("Summarize the current sprint velocity and identify any team capacity risks.")}
              >
                <Zap size={12} className="mr-1.5" />
                Sprint Health
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px] rounded-full bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10 hover:border-blue-500/40 text-blue-700 font-bold"
                onClick={() => handleSend("Verify if the latest architecture design in Confluence is consistent with the GitLab implementation.")}
              >
                <FileText size={12} className="mr-1.5" />
                Compliance Audit
              </Button>
            </div>

            {/* Suggestions */}
            <div className="flex flex-wrap gap-2 justify-center">
              {(activePersona ? personas.find(p => p.id === activePersona)?.queries : personas.flatMap(p => p.queries).slice(0, 3)).map((q, i) => (
                <Button 
                  key={i} 
                  variant="outline" 
                  className="h-7 text-[10px] rounded-full bg-muted/30 border-muted-foreground/10 hover:bg-primary/5 hover:border-primary/30 transition-all"
                  onClick={() => handleSend(q)}
                >
                  {q}
                </Button>
              ))}
            </div>

            <div className="relative group">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={activePersona ? `Ask as ${personas.find(p => p.id === activePersona)?.name}...` : "Ask KAI about products, delivery, or operations..."}
                className="pr-12 h-12 bg-muted/20 border-muted-foreground/20 focus-visible:ring-primary rounded-xl transition-all"
              />
              <Button 
                size="icon" 
                className="absolute right-1.5 top-1.5 h-9 w-9 rounded-lg transition-all"
                disabled={!input.trim() || isLoading}
                onClick={() => handleSend()}
              >
                <Send size={18} />
              </Button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-3 opacity-60">
              AskKAI inherits your system permissions. Responses cite sources for auditability.
            </p>
          </div>
        </div>
      </main>

      {/* Right Panel - Context/Sources */}
      <aside className="w-80 border-l bg-muted/10 flex flex-col hidden xl:flex">
        <header className="p-4 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Search size={16} className="text-primary" />
            Intelligence Context
          </h3>
        </header>
        
        <Tabs defaultValue="sources" className="flex-1 flex flex-col">
          <div className="px-4 pt-2">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="sources" className="text-xs">Sources</TabsTrigger>
              <TabsTrigger value="details" className="text-xs">Synthesis</TabsTrigger>
              <TabsTrigger value="health" className="text-xs">Health</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="sources" className="flex-1 overflow-hidden min-h-0 m-0">
            <ScrollArea className="h-full p-4">
              {activeSources.length > 0 ? (
                <div className="space-y-4">
                  {activeSources.map((source) => (
                    <Card key={source.id} className="overflow-hidden border-muted-foreground/10 hover:border-primary/30 transition-colors group">
                      <CardHeader className="p-3 pb-0">
                        <div className="flex items-center justify-between mb-1">
                          <Badge variant="outline" className={cn(
                            "text-[9px] px-1.5 py-0 h-4 font-bold uppercase",
                            source.type === 'Jira' && "text-blue-500 border-blue-500/20 bg-blue-500/5",
                            source.type === 'Confluence' && "text-blue-600 border-blue-600/20 bg-blue-600/5",
                            source.type === 'GitLab' && "text-orange-500 border-orange-500/20 bg-orange-500/5",
                            source.type === 'SharePoint' && "text-teal-600 border-teal-600/20 bg-teal-600/5",
                          )}>
                            {source.type} {source.isMock && "(Mock)"}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground">{source.lastUpdated}</span>
                        </div>
                        <CardTitle className="text-xs leading-tight group-hover:text-primary transition-colors">
                          {source.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-3">
                        <p className="text-[11px] text-muted-foreground line-clamp-3 mb-2 leading-relaxed">
                          {source.content}
                        </p>
                        <Button variant="ghost" size="sm" className="w-full h-7 text-[10px] gap-1.5 justify-center border border-transparent hover:border-muted-foreground/20" onClick={() => window.open(source.url, '_blank')}>
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
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidence Score</h4>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: activeSources.length > 0 ? '85%' : '0%' }}
                        className="h-full bg-primary"
                      />
                    </div>
                    <span className="text-xs font-bold">{activeSources.length > 0 ? '85%' : '0%'}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground italic">Based on source relevance and data freshness.</p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Partner Insight</h4>
                  <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg">
                    <p className="text-[11px] leading-relaxed font-medium text-primary">
                      {activeSources.length > 0 
                        ? "KAI has detected potential inconsistencies between Jira blockers and GitLab pipeline status. Recommend immediate sync with Tech Lead."
                        : "Awaiting data retrieval to generate cross-system product insights."}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Synthesis Engine</h4>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span>Cross-System Mapping</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 bg-green-500/10 text-green-600 border-green-600/20">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span>Permission Inheritance</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 bg-green-500/10 text-green-600 border-green-600/20">Verified</Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span>Auditability Log</span>
                      <Badge variant="outline" className="text-[8px] h-3.5 bg-green-500/10 text-green-600 border-green-600/20">Enabled</Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="bg-primary/5 border border-primary/10 p-3 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-primary">
                    <ShieldCheck size={14} />
                    <h4 className="text-[11px] font-bold uppercase tracking-wider">Access Control</h4>
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    AskKAI inherits your permissions from NCSS Identity Provider. You are only seeing information you have authorized access to in Jira, Confluence, and GitLab.
                  </p>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="health" className="flex-1 overflow-hidden min-h-0 m-0">
            <ScrollArea className="h-full p-4">
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery Health Radar</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-green-500/5 border border-green-500/10 p-2 rounded-md text-center">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Velocity</p>
                      <p className="text-lg font-bold text-green-600">High</p>
                    </div>
                    <div className="bg-yellow-500/5 border border-yellow-500/10 p-2 rounded-md text-center">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Risk Level</p>
                      <p className="text-lg font-bold text-yellow-600">Med</p>
                    </div>
                    <div className="bg-blue-500/5 border border-blue-500/10 p-2 rounded-md text-center">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Quality</p>
                      <p className="text-lg font-bold text-blue-600">92%</p>
                    </div>
                    <div className="bg-orange-500/5 border border-orange-500/10 p-2 rounded-md text-center">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold">Blockers</p>
                      <p className="text-lg font-bold text-orange-600">2</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Blockers</h4>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 p-2 bg-muted/30 rounded-md border-l-2 border-orange-500">
                      <AlertCircle size={12} className="text-orange-500 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold">MSF IDP Integration Delay</p>
                        <p className="text-[9px] text-muted-foreground">Blocked by external dependency. Resolution: EOW.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-2 bg-muted/30 rounded-md border-l-2 border-red-500">
                      <AlertCircle size={12} className="text-red-500 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold">Security Vulnerabilities</p>
                        <p className="text-[9px] text-muted-foreground">3 Critical issues in epes-backend pipeline.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Compliance Check</h4>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1"><CheckCircle2 size={10} className="text-green-500" /> ITG Standards</span>
                      <span className="text-green-600 font-bold">Pass</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1"><CheckCircle2 size={10} className="text-green-500" /> Data Privacy</span>
                      <span className="text-green-600 font-bold">Pass</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1"><AlertCircle size={10} className="text-yellow-500" /> Security Scan</span>
                      <span className="text-yellow-600 font-bold">Warning</span>
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
