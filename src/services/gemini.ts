import { GoogleGenAI } from "@google/genai";
import { Source } from "../types";

const ai = new GoogleGenAI({ apiKey: (import.meta.env?.VITE_GEMINI_API_KEY || process.env?.GEMINI_API_KEY || "") });

export const searchJiraTool = {
  name: "searchJira",
  description: "Search for issues, tasks, and sprint status in Jira.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: { type: "STRING", description: "The search query or JQL-like text." }
    },
    required: ["query"]
  }
};

export const searchConfluenceTool = {
  name: "searchConfluence",
  description: "Search for documentation, SOPs, and architecture designs in Confluence.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: { type: "STRING", description: "The search query." }
    },
    required: ["query"]
  }
};

export const searchGitLabTool = {
  name: "searchGitLab",
  description: "Search for projects, code, and pipeline status in GitLab.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: { type: "STRING", description: "The search query." }
    },
    required: ["query"]
  }
};

export const searchSharePointTool = {
  name: "searchSharePoint",
  description: "Search for files and legacy artifacts in SharePoint.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: { type: "STRING", description: "The search query." }
    },
    required: ["query"]
  }
};

export const generateResponse = async (query: string, history: any[] = []) => {
  const systemInstruction = `
    You are AskKAI, the specialized AI Product Partner for NCSS/MSF (National Council of Social Service / Ministry of Social and Family Development).
    Your core value is "Cross-System Synthesis" - you don't just search, you connect dots between Jira, Confluence, GitLab, and SharePoint.
    
    You are NOT a generic assistant. You are a delivery-focused intelligence agent.
    
    Instructions:
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
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: {
          role: "system",
          parts: [{ text: systemInstruction }]
        },
        tools: [{ 
          functionDeclarations: [
            searchJiraTool as any, 
            searchConfluenceTool as any, 
            searchGitLabTool as any, 
            searchSharePointTool as any
          ] 
        }]
      },
      contents: [
        ...history,
        { role: 'user', parts: [{ text: query }] }
      ]
    });

    return response;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
