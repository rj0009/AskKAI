import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { Source } from "../types";

const getApiKey = () => {
  let key = "";
  
  try {
    // 1. Try process.env.GEMINI_API_KEY (Vite define or actual process.env)
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey && envKey !== "undefined" && envKey !== "null") {
      key = envKey;
    }
  } catch (e) {}

  // 2. Fallback to import.meta.env.VITE_GEMINI_API_KEY
  if (!key) {
    try {
      const viteKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
      if (viteKey && viteKey !== "undefined" && viteKey !== "null") {
        key = viteKey;
      }
    } catch (e) {}
  }
  
  return key;
};

export const searchJiraTool: FunctionDeclaration = {
  name: "searchJira",
  description: "Search for issues, tasks, and sprint status in Jira.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The search query or JQL-like text." }
    },
    required: ["query"]
  }
};

export const searchConfluenceTool: FunctionDeclaration = {
  name: "searchConfluence",
  description: "Search for documentation, SOPs, and architecture designs in Confluence.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The search query." }
    },
    required: ["query"]
  }
};

export const searchGitLabTool: FunctionDeclaration = {
  name: "searchGitLab",
  description: "Search for projects, code, and pipeline status in GitLab.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The search query." }
    },
    required: ["query"]
  }
};

export const searchSharePointTool: FunctionDeclaration = {
  name: "searchSharePoint",
  description: "Search for files and legacy artifacts in SharePoint.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "The search query." }
    },
    required: ["query"]
  }
};

export const generateResponse = async (contents: any[]) => {
  const apiKey = getApiKey();
  console.log('Generating response with Gemini...', { 
    contentsCount: contents.length, 
    hasApiKey: !!apiKey,
    apiKeyLength: apiKey.length 
  });
  
  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = `
    You are AskKAI, the specialized AI Product Partner for NCSS/MSF (National Council of Social Service / Ministry of Social and Family Development).
    Your core value is "Cross-System Synthesis" - you don't just search, you connect dots between Jira, Confluence, GitLab, and SharePoint.
    
    You are NOT a generic assistant. You are a delivery-focused intelligence agent supporting Senior Leaders, CIOs, CAB members, and Engineering teams.
    
    CORE CAPABILITIES:
    1. DOCUMENTATION SYNTHESIS (Use Case 1): Summarize lengthy Confluence docs, cite sources, and explicitly FLAG if documentation appears outdated, incomplete, or inconsistent with current Jira/GitLab status.
    2. RELEASE GOVERNANCE (Use Case 3): Validate releases by cross-referencing Jira tickets (completed?), GitLab merge requests (merged?), and Confluence (approved architecture?). Surface risk signals for CAB reviewers.
    3. SECURITY & DEV INSIGHTS (Use Case 4): Summarize GitLab security scan findings in plain language. Prioritize by severity and suggest remediation based on NCSS ITG standards.
    
    INSTRUCTIONS:
    1. PROACTIVE INCONSISTENCY DETECTION: If Jira says a feature is "Done" but GitLab shows no recent commits or failing pipelines, HIGHLIGHT this as a risk.
    2. NCSS CONTEXT: You understand NCSS ITG standards, MSF IDP integration patterns, and the "EPES" project context.
    3. STRUCTURE YOUR RESPONSE into these specific sections:
       - **Facts**: Direct information found in the sources.
       - **Intelligence Synthesis**: Connect the dots. (e.g., "The Confluence design for X is being implemented in GitLab repo Y, but Jira shows no corresponding tasks.")
       - **Risk Radar**: Identify blockers, security issues, or timeline risks.
       - **Unknowns**: Information requested but not found.
    4. CITE YOUR SOURCES using the source ID or title in brackets [Source Title].
    5. Be professional, concise, and highly delivery-aware.
    6. At the end, provide a "Confidence Level" (High/Medium/Low) and a "Product Partner Advice" sentence.
  `;

  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Gemini API request timed out")), 45000)
    );

    console.log('Sending request to Gemini API...');
    const apiPromise = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction,
        tools: [{ 
          functionDeclarations: [
            searchJiraTool, 
            searchConfluenceTool, 
            searchGitLabTool, 
            searchSharePointTool
          ] 
        }]
      },
      contents
    });

    const response = await Promise.race([apiPromise, timeoutPromise]) as any;
    
    if (!response || !response.candidates || response.candidates.length === 0) {
      console.error('Gemini API returned no candidates:', response);
    } else {
      console.log('Gemini API response received successfully', {
        text: response.text?.substring(0, 50),
        functionCalls: response.functionCalls?.length
      });
    }

    return response;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
