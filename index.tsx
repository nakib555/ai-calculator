import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import * as math from 'mathjs';
import Plotly from 'plotly.js-dist';
import Chart from 'chart.js/auto';
import * as ss from 'simple-statistics';
import Algebrite from 'algebrite';

import { 
  Calculator as CalculatorIcon, 
  Sparkles, 
  History, 
  Delete, 
  CornerDownLeft, 
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
  Trash2,
  AlertCircle,
  Play,
  Terminal
} from 'lucide-react';

// --- Configuration ---
const GENAI_API_KEY = process.env.API_KEY;

// Configure Global Defaults
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

// --- Types ---
type HistoryItem = {
  id: string;
  expression: string;
  result: string;
  type: 'manual' | 'agent';
  timestamp: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  reasoning?: string;
  isStreaming?: boolean;
};

// --- Helper Components ---

const CodeExecutionBlock: React.FC<{ code: string }> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executed, setExecuted] = useState(false);

  useEffect(() => {
    if (!containerRef.current || executed) return;

    try {
      // Clear previous content
      containerRef.current.innerHTML = '';
      
      // Safety wrapper
      const safeExecute = new Function(
        'math', 
        'Plotly', 
        'Chart', 
        'ss', 
        'Algebrite', 
        'container', 
        `
        try {
          ${code}
        } catch(e) {
          throw e;
        }
        `
      );

      // Execute code with libraries injected
      const result = safeExecute(
        math, 
        Plotly, 
        Chart, 
        ss, 
        Algebrite, 
        containerRef.current
      );
      
      setExecuted(true);

      // Handle non-visual returns
      if (result !== undefined && result !== null) {
        if (typeof result === 'object' && result.toString) {
            setOutput(result.toString());
        } else {
            setOutput(String(result));
        }
      }

    } catch (err: any) {
      console.error("Execution Error:", err);
      setError(err.message || 'Execution failed');
      setExecuted(true);
    }
  }, [code, executed]);

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-xl">
      <div className="bg-white/5 px-4 py-2 flex items-center gap-2 border-b border-white/5">
        <Terminal size={14} className="text-indigo-400" />
        <span className="text-xs font-mono text-indigo-300/70 uppercase tracking-wider">Live Execution</span>
      </div>
      
      <div className="p-4 relative min-h-[100px]">
         {/* Visual Container for Plots */}
         <div ref={containerRef} className="w-full text-white [&_canvas]:max-w-full [&_svg]:max-w-full" />
         
         {/* Text Output */}
         {output && (
             <div className="mt-3 p-3 bg-indigo-900/20 border border-indigo-500/20 rounded-lg text-indigo-200 font-mono text-sm whitespace-pre-wrap break-words">
                 {'> ' + output}
             </div>
         )}
         
         {/* Error Output */}
         {error && (
             <div className="mt-3 p-3 bg-red-900/20 border border-red-500/20 rounded-lg text-red-200 font-mono text-sm">
                 Error: {error}
             </div>
         )}
      </div>
    </div>
  );
};

const ReasoningAccordion = ({ content, isStreaming }: { content: string, isStreaming: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-6 mb-2 w-full border-t border-white/5 pt-4">
        <button 
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 text-xs font-bold text-indigo-400/60 hover:text-indigo-300 transition-colors py-1.5 select-none group"
        >
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 group-hover:border-indigo-500/30 transition-all">
                {isStreaming && <Loader2 size={12} className="animate-spin text-indigo-400" />}
                <span className="uppercase tracking-widest text-[10px]">
                    {isStreaming ? 'Thinking Process' : 'View Reasoning'}
                </span>
                {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </div>
        </button>
        
        {isOpen && (
            <div className="mt-4 text-sm text-indigo-200/80 font-mono leading-relaxed whitespace-pre-wrap border-l-2 border-indigo-500/20 pl-4 py-1 animate-in fade-in slide-in-from-top-2">
                {content}
            </div>
        )}
    </div>
  );
};

const FormattedMessage = ({ content }: { content: string }) => {
    // Parser for splitting text and code blocks
    const parts = useMemo(() => {
        const regex = /```javascript:exec\s*([\s\S]*?)\s*```/g;
        const result: { type: 'text' | 'code'; value: string }[] = [];
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(content)) !== null) {
            // Text before code
            if (match.index > lastIndex) {
                result.push({ type: 'text', value: content.substring(lastIndex, match.index) });
            }
            // Code block
            result.push({ type: 'code', value: match[1] });
            lastIndex = regex.lastIndex;
        }
        
        // Remaining text
        if (lastIndex < content.length) {
            result.push({ type: 'text', value: content.substring(lastIndex) });
        }
        return result;
    }, [content]);

    return (
        <div className="text-white text-base md:text-lg font-light leading-relaxed tracking-wide space-y-2">
            {parts.map((part, i) => {
                if (part.type === 'code') {
                    return <CodeExecutionBlock key={i} code={part.value} />;
                }
                // Handle bolding and basic formatting loosely
                return (
                    <div key={i} className="whitespace-pre-wrap">
                        {part.value.split(/(\*\*.*?\*\*)/g).map((chunk, j) => {
                            if (chunk.startsWith('**') && chunk.endsWith('**')) {
                                return <strong key={j} className="text-indigo-200 font-semibold">{chunk.slice(2, -2)}</strong>;
                            }
                            return chunk;
                        })}
                    </div>
                );
            })}
        </div>
    );
};


// --- Main App Component ---

const App = () => {
  const [mode, setMode] = useState<'manual' | 'agent'>('manual');
  
  // States
  const [manualExpression, setManualExpression] = useState('');
  const [manualResult, setManualResult] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Refs
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const manualDisplayRef = useRef<HTMLDivElement>(null);
  const agentDisplayRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (mode === 'agent' && agentDisplayRef.current && isLoading) {
        agentDisplayRef.current.scrollTop = agentDisplayRef.current.scrollHeight;
    }
  }, [messages, mode, isLoading]);

  useEffect(() => {
    if (mode === 'agent' && chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'manual' && manualDisplayRef.current) {
      manualDisplayRef.current.scrollTop = manualDisplayRef.current.scrollHeight;
    }
  }, [manualExpression, mode]);

  // --- Logic: Advanced Manual Calculator ---
  const handleManualInput = (val: string) => {
    if (manualError) setManualError(null);

    if (val === 'AC') {
      setManualExpression('');
      setManualResult('');
      setManualError(null);
    } else if (val === 'DEL') {
      setManualExpression(prev => prev.slice(0, -1));
    } else if (val === '=') {
      calculateManual();
    } else {
      setManualExpression(prev => prev + val);
    }
  };

  const calculateManual = () => {
    try {
      if (!manualExpression) return;
      
      // Use mathjs for advanced evaluation (matrices, units, etc.)
      const res = math.evaluate(manualExpression);
      
      let formattedResult;
      if (typeof res === 'object') {
          // Handle complex numbers, matrices, units
          formattedResult = res.toString();
      } else if (res === undefined || isNaN(res)) {
         throw new Error("Invalid Result");
      } else {
         formattedResult = math.format(res, { precision: 14 });
      }

      setManualResult(formattedResult);
      setManualError(null);
      addToHistory(manualExpression, formattedResult, 'manual');
    } catch (e) {
      setManualResult('');
      setManualError('Syntax Error');
    }
  };

  // --- Logic: Agentic Calculator (Gemini) ---
  const handleAgentSubmit = async () => {
    if (!chatInput.trim()) return;
    
    const userText = chatInput;
    setChatInput(''); 
    
    const userMsg: ChatMessage = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: userText 
    };
    setMessages(prev => [...prev, userMsg]);
    
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();
    const initialAiMsg: ChatMessage = { 
      id: aiMsgId, 
      role: 'model', 
      content: '', 
      reasoning: '', 
      isStreaming: true 
    };
    setMessages(prev => [...prev, initialAiMsg]);

    let fullText = '';
    let finalAnswer = '';
    let reasoningText = '';

    try {
      const ai = new GoogleGenAI({ apiKey: GENAI_API_KEY });
      const model = ai.models;
      
      // --- System Prompt with Library Awareness ---
      const prompt = `
        You are an advanced mathematical AI agent with built-in code execution.
        
        **Available JavaScript Libraries:**
        - \`math\` (Math.js): Algebra, matrices, units, complex numbers.
        - \`Plotly\` (plotly.js): Scientific graphing (2D/3D).
        - \`Chart\` (Chart.js): Standard bar/line/pie charts.
        - \`ss\` (simple-statistics): Statistical methods.
        - \`Algebrite\`: Symbolic math processing.

        **Instructions:**
        1. Solve the user's request: "${userText}"
        2. **Reasoning**: First, explain your thinking step-by-step.
        3. **Execution**: If you need to plot a graph, calculate complex statistics, or solve algebra programmatically, write a JavaScript block tagged with \`javascript:exec\`.
           - You have access to a DOM element variable named \`container\`.
           - To Plot: Use \`Plotly.newPlot(container, data, layout)\` or \`new Chart(container, config)\`.
           - To Return Value: The last evaluated expression will be displayed.
           - Example:
             \`\`\`javascript:exec
             const x = math.range(-10, 10, 0.1).toArray();
             const y = x.map(v => math.sin(v));
             Plotly.newPlot(container, [{x, y, type: 'scatter'}], {paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)', font:{color:'#fff'}});
             return "Graph of sin(x)";
             \`\`\`
        4. **Final Answer**: End your response with the separator "===EQUALS===" followed by the concise final answer (or "See Graph" if you plotted something).
      `;

      const responseStream = await model.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
            fullText += text;
            
            const separator = "===EQUALS===";
            if (fullText.includes(separator)) {
                const parts = fullText.split(separator);
                reasoningText = parts[0].trim();
                finalAnswer = parts[1].trim();
            } else {
                reasoningText = fullText;
            }

            setMessages(prev => prev.map(msg => {
                if (msg.id === aiMsgId) {
                    return {
                        ...msg,
                        content: finalAnswer,
                        reasoning: reasoningText,
                        isStreaming: true
                    };
                }
                return msg;
            }));
        }
      }
      
      if (!finalAnswer && fullText && !fullText.includes("===EQUALS===")) {
         finalAnswer = "Done"; 
         reasoningText = fullText;
      }

      setMessages(prev => prev.map(msg => {
        if (msg.id === aiMsgId) {
            return {
                ...msg,
                content: finalAnswer,
                reasoning: reasoningText,
                isStreaming: false
            };
        }
        return msg;
      }));

      if (finalAnswer || fullText) {
        addToHistory(userText, finalAnswer.substring(0, 30) || "Visualization", 'agent');
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => prev.map(msg => {
          if (msg.id === aiMsgId) {
              return { ...msg, content: 'Error connecting to AI', isStreaming: false };
          }
          return msg;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const addToHistory = (expr: string, res: string, type: 'manual' | 'agent') => {
    setHistory(prev => [{
      id: Date.now().toString(),
      expression: expr,
      result: res,
      type,
      timestamp: Date.now()
    }, ...prev].slice(0, 50));
  };

  const restoreHistory = (item: HistoryItem) => {
    if (item.type === 'manual') {
        setManualExpression(item.expression);
        setManualResult(item.result);
        setManualError(null);
        setMode('manual');
    } else {
        setChatInput(item.expression);
        setMode('agent');
    }
    setShowHistory(false);
  };

  // --- Render Helpers ---
  const renderKeypad = () => {
    const keys = [
      ['AC', 'DEL', '%', '/'],
      ['7', '8', '9', '*'],
      ['4', '5', '6', '-'],
      ['1', '2', '3', '+'],
      ['0', '.', '=']
    ];

    return (
      <div className="grid grid-cols-4 gap-3 p-5 pb-8 md:pb-6 flex-none">
        {keys.flat().map((key) => {
          let style = "btn-glass text-white text-xl font-medium rounded-2xl h-14 md:h-16 active:scale-95 transition-transform flex items-center justify-center select-none";
          
          if (['AC', 'DEL', '%'].includes(key)) {
            style += " text-cyan-300";
          } else if (['/', '*', '-', '+', '='].includes(key)) {
            if (key === '=') {
              style = "col-span-2 btn-accent text-white text-2xl font-bold rounded-2xl h-14 md:h-16 shadow-lg shadow-indigo-500/20";
            } else {
              style += " text-indigo-300 bg-indigo-500/10";
            }
          } else if (key === '0') {
            style += " col-span-2";
          }

          return (
            <button
              key={key}
              onClick={() => handleManualInput(key)}
              className={style}
              aria-label={key}
            >
              {key === 'DEL' ? <Delete size={20} /> : key}
            </button>
          );
        })}
      </div>
    );
  };

  const renderAgentView = () => {
    if (messages.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-60">
                <div className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center mb-6 border border-indigo-500/20 animate-pulse">
                    <Sparkles size={48} className="text-indigo-400" />
                </div>
                <h3 className="text-2xl font-medium text-white mb-3">Agentic Calculator</h3>
                <p className="text-sm text-gray-400 max-w-xs leading-relaxed mb-6">
                    Capable of plotting graphs, solving matrices, and statistical analysis using real code.
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-w-xs">
                    <span className="px-2 py-1 rounded bg-white/5 text-[10px] text-gray-500 border border-white/5">Math.js</span>
                    <span className="px-2 py-1 rounded bg-white/5 text-[10px] text-gray-500 border border-white/5">Plotly</span>
                    <span className="px-2 py-1 rounded bg-white/5 text-[10px] text-gray-500 border border-white/5">Chart.js</span>
                    <span className="px-2 py-1 rounded bg-white/5 text-[10px] text-gray-500 border border-white/5">Algebrite</span>
                </div>
            </div>
        );
    }

    const lastUserIndex = messages.findLastIndex(m => m.role === 'user');
    const userMsg = messages[lastUserIndex];
    const modelMsg = messages.length > lastUserIndex + 1 ? messages[lastUserIndex + 1] : null;

    return (
        <div ref={agentDisplayRef} className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
            {/* User Input */}
            <div className="flex-none w-full flex justify-end mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="max-w-[85%] text-right">
                    <div className="text-xl md:text-2xl text-indigo-200/60 font-light tracking-wide break-words">
                        {userMsg?.content}
                    </div>
                </div>
            </div>

            {/* AI Response */}
            {modelMsg && (
                <div className="flex-1 w-full animate-in fade-in zoom-in-95 duration-500 delay-100 flex flex-col">
                     <div className="flex-1 pb-10">
                         {/* Reasoning (Always First if exists) */}
                        {modelMsg.reasoning && (
                            <ReasoningAccordion 
                                content={modelMsg.reasoning} 
                                isStreaming={!!modelMsg.isStreaming} 
                            />
                        )}
                        
                        {/* Main Answer / Visualization */}
                        <div className="mt-4">
                            <FormattedMessage content={modelMsg.content} />
                            
                            {!modelMsg.content && modelMsg.isStreaming && (
                                <span className="animate-pulse text-indigo-300 opacity-70 flex items-center gap-2">
                                    <Loader2 size={16} className="animate-spin"/> Computing...
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {!modelMsg && isLoading && (
                 <div className="flex-1 flex items-start mt-4">
                    <div className="flex items-center gap-3 text-indigo-300/70">
                        <Loader2 size={24} className="animate-spin" />
                        <span className="text-xl font-light">Thinking...</span>
                    </div>
                 </div>
            )}
        </div>
    );
  };

  return (
    <div className="relative w-full h-[100dvh] md:h-[840px] md:max-h-[90vh] md:w-[420px] flex flex-col md:my-auto transition-all duration-300">
        
      <div className="glass-panel w-full h-full md:rounded-[3rem] flex flex-col overflow-hidden relative border-0 md:border md:border-white/10 ring-0 md:ring-1 md:ring-white/5 md:shadow-2xl">
        
        {/* --- Header --- */}
        <div className="flex items-center justify-between p-6 pt-8 md:pt-6 z-20 shrink-0 bg-gradient-to-b from-black/60 to-transparent">
            <div className="flex bg-black/40 rounded-full p-1 border border-white/5 backdrop-blur-md">
                <button 
                    onClick={() => setMode('manual')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${mode === 'manual' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                >
                    <CalculatorIcon size={14} />
                    Calc
                </button>
                <button 
                    onClick={() => setMode('agent')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${mode === 'agent' ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-200 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'text-gray-400 hover:text-white'}`}
                >
                    <Sparkles size={14} />
                    Agent
                </button>
            </div>
            
            <div className="flex gap-2">
                {mode === 'agent' && messages.length > 0 && (
                     <button 
                        onClick={() => setMessages([])}
                        className="p-3 rounded-full hover:bg-white/5 text-gray-400 hover:text-red-400 transition-colors"
                        title="Clear Chat"
                    >
                        <Trash2 size={18} />
                    </button>
                )}
                <button 
                    onClick={() => setShowHistory(true)}
                    className="p-3 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                >
                    <History size={20} />
                </button>
            </div>
        </div>

        {/* --- Content Area --- */}
        <div className="flex-1 flex flex-col relative z-10 overflow-hidden">
            
            {mode === 'manual' ? (
                /* Manual Display */
                <div className="flex-1 flex flex-col justify-end p-8 text-right space-y-2">
                     <div 
                        ref={manualDisplayRef}
                        className="w-full max-h-40 overflow-y-auto custom-scrollbar break-all text-gray-400 font-light text-4xl font-mono tracking-wider transition-all"
                     >
                        {manualExpression || '0'}
                     </div>

                     <div className="min-h-[4rem] flex flex-col justify-end items-end">
                        {manualError ? (
                            <div className="flex items-center gap-2 text-red-400 font-medium text-xl animate-in fade-in slide-in-from-bottom-2">
                                <AlertCircle size={20} />
                                {manualError}
                            </div>
                        ) : (
                            <div className={`font-bold tracking-tight text-white transition-all duration-300 break-words w-full text-right ${
                                manualResult.length > 12 ? 'text-3xl' : 'text-6xl'
                            }`}>
                                <span className="font-mono bg-clip-text text-transparent bg-gradient-to-br from-white to-gray-400">
                                    {manualResult || ''}
                                </span>
                            </div>
                        )}
                     </div>
                </div>
            ) : (
                renderAgentView()
            )}
        </div>

        {/* --- Input Area --- */}
        <div className="bg-black/20 backdrop-blur-xl border-t border-white/5 relative z-20">
            {mode === 'manual' ? (
                renderKeypad()
            ) : (
                <div className="p-4 flex items-end gap-3">
                     <div className="flex-1 bg-white/5 rounded-2xl border border-white/10 focus-within:border-indigo-500/50 focus-within:bg-white/10 transition-all flex items-end overflow-hidden min-h-[56px]">
                        <textarea
                            ref={chatInputRef}
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAgentSubmit();
                                }
                            }}
                            placeholder="Plot sin(x), solve matrix..."
                            className="w-full bg-transparent p-4 max-h-32 min-h-[56px] resize-none focus:outline-none text-white placeholder-gray-500 custom-scrollbar leading-relaxed"
                            style={{ height: 'auto', minHeight: '56px' }}
                            rows={1}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                            }}
                        />
                        {chatInput && (
                            <button 
                                onClick={() => setChatInput('')}
                                className="mb-4 mr-2 text-gray-500 hover:text-white transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                     </div>
                     
                     <div className="flex flex-col gap-2">
                        <button 
                            onClick={handleAgentSubmit}
                            disabled={isLoading || !chatInput.trim()}
                            className={`h-[56px] w-[56px] rounded-2xl flex items-center justify-center transition-all shadow-lg ${
                                chatInput.trim() 
                                ? 'btn-accent text-white hover:scale-105 active:scale-95' 
                                : 'bg-white/5 text-gray-500 border border-white/5'
                            }`}
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
                        </button>
                     </div>
                </div>
            )}
        </div>
      </div>

      {/* --- History Sidebar --- */}
      {showHistory && (
          <div className="absolute inset-0 z-50 flex justify-end overflow-hidden md:rounded-[3rem]">
              <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={() => setShowHistory(false)}
              />
              <div className="w-5/6 md:w-3/4 max-w-sm h-full bg-[#0f172a] border-l border-white/10 shadow-2xl relative flex flex-col animate-[slide-in-right_0.3s_ease-out]">
                  <div className="p-6 pt-8 md:pt-6 border-b border-white/5 flex items-center justify-between">
                      <h2 className="text-xl font-semibold flex items-center gap-2">
                          <History size={18} className="text-indigo-400"/>
                          History
                      </h2>
                      <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-full text-gray-400 hover:text-white">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {history.length === 0 ? (
                          <div className="text-center text-gray-500 mt-10">No recent calculations</div>
                      ) : (
                          history.map(item => (
                              <button
                                key={item.id}
                                onClick={() => restoreHistory(item)}
                                className="w-full text-left p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors group"
                              >
                                  <div className="flex justify-between items-start mb-1">
                                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                          item.type === 'agent' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-700/50 text-gray-400'
                                      }`}>
                                          {item.type === 'agent' ? 'AI Agent' : 'Calc'}
                                      </span>
                                      <CornerDownLeft size={14} className="text-gray-600 group-hover:text-indigo-400 transition-colors" />
                                  </div>
                                  <div className="text-gray-300 text-sm line-clamp-2 mb-2 opacity-80 pt-2 font-mono">{item.expression}</div>
                                  <div className="text-lg text-white font-medium break-all">{item.result}</div>
                              </button>
                          ))
                      )}
                  </div>
                  
                  {history.length > 0 && (
                      <div className="p-4 border-t border-white/5 bg-black/20">
                          <button 
                            onClick={() => setHistory([])}
                            className="w-full py-3 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors font-medium flex items-center justify-center gap-2"
                          >
                              <Trash2 size={16} />
                              Clear History
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}