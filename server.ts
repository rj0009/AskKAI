import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to normalize URLs
  const normalizeUrl = (url: string) => {
    if (!url) return "";
    let normalized = url.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = `https://${normalized}`;
    }
    return normalized.replace(/\/+$/, "");
  };

  // API Routes
  app.post("/api/proxy/jira", async (req, res) => {
    const { query, config } = req.body;
    const baseUrl = normalizeUrl(config?.jiraBaseUrl || process.env.JIRA_BASE_URL || "");
    const email = (config?.jiraEmail || process.env.JIRA_EMAIL || "").trim();
    const token = (config?.jiraToken || process.env.JIRA_API_TOKEN || "").trim();
    
    // Check for placeholder tokens
    if (!baseUrl || !token || token.includes("MY_") || token.includes("TODO_") || baseUrl.includes("0.0.0.1")) {
      return res.status(400).json({ error: "Jira not configured correctly. Please check your settings and ensure the Base URL is valid." });
    }

    try {
      const auth = Buffer.from(`${email}:${token}`).toString("base64");
      
      // If query is empty, we just want to test connection or get recent items
      // Using a simpler JQL for empty queries
      const jql = query 
        ? `text ~ "${query.replace(/"/g, '\\"')}"` 
        : "order by created DESC";

      console.log(`Jira Proxy: Requesting ${baseUrl}/rest/api/3/search with JQL: ${jql}`);

      const response = await axios.get(`${baseUrl}/rest/api/3/search`, {
        params: { 
          jql,
          maxResults: 10
        },
        headers: { 
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "X-Atlassian-Token": "no-check",
          "User-Agent": "AskKAI-Proxy"
        },
        timeout: 15000 // 15s timeout
      });
      res.json(response.data.issues || []);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const errorData = error.response?.data;
      let message = error.message;
      
      if (error.code === 'ECONNABORTED') message = "Connection timed out. Please check if the Jira URL is accessible.";
      if (error.code === 'ENOTFOUND') message = "Jira host not found. Please check the Base URL.";
      
      console.error(`Jira Proxy Error (${status}):`, {
        message,
        url: error.config?.url,
        data: JSON.stringify(errorData)
      });

      res.status(status).json({ 
        error: message, 
        details: errorData,
        status 
      });
    }
  });

  app.post("/api/proxy/gitlab", async (req, res) => {
    const { query, config } = req.body;
    const baseUrl = normalizeUrl(config?.gitlabBaseUrl || process.env.GITLAB_BASE_URL || "https://gitlab.com");
    const token = (config?.gitlabToken || process.env.GITLAB_ACCESS_TOKEN || "").trim();

    if (!token || token.includes("MY_") || token.includes("TODO_") || baseUrl.includes("0.0.0.1")) {
      return res.status(400).json({ error: "GitLab not configured correctly. Please check your settings." });
    }

    try {
      // Use projects search as a connectivity test if query is empty
      const searchParams = query ? { scope: "projects", search: query } : { membership: true };
      const endpoint = query ? "/api/v4/search" : "/api/v4/projects";

      const response = await axios.get(`${baseUrl}${endpoint}`, {
        params: searchParams,
        headers: { "PRIVATE-TOKEN": token },
        timeout: 10000
      });
      res.json(response.data || []);
    } catch (error: any) {
      const status = error.response?.status || 500;
      let message = error.message;
      if (error.code === 'ECONNABORTED') message = "Connection timed out. Please check if the GitLab URL is accessible.";
      if (error.code === 'ENOTFOUND') message = "GitLab host not found. Please check the Base URL.";

      const data = error.response?.data || { message };
      if (status !== 401 && status !== 403) {
        console.error(`GitLab Proxy Error (${status}):`, data);
      }
      res.status(status).json(data);
    }
  });

  app.post("/api/proxy/confluence", async (req, res) => {
    const { query, config } = req.body;
    let baseUrl = normalizeUrl(config?.confluenceBaseUrl || process.env.CONFLUENCE_BASE_URL || "");
    const email = (config?.confluenceEmail || process.env.CONFLUENCE_EMAIL || "").trim();
    const token = (config?.confluenceToken || process.env.CONFLUENCE_API_TOKEN || "").trim();

    if (!baseUrl || !token || token.includes("MY_") || token.includes("TODO_") || baseUrl.includes("0.0.0.1")) {
      return res.status(400).json({ error: "Confluence not configured correctly. Please check your settings and ensure the Base URL is valid." });
    }

    // Auto-append /wiki for Atlassian Cloud if missing
    if (baseUrl.includes("atlassian.net") && !baseUrl.includes("/wiki")) {
      baseUrl = `${baseUrl}/wiki`;
    }

    try {
      const auth = Buffer.from(`${email}:${token}`).toString("base64");
      
      // Use the v2 search endpoint for better compatibility
      const endpoint = `${baseUrl}/api/v2/search-content`;
      const params = query 
        ? { cql: `text ~ "${query.replace(/"/g, '\\"')}"`, limit: 10 }
        : { cql: "type = page order by created DESC", limit: 10 };

      console.log(`Confluence Proxy: Requesting ${endpoint} with params: ${JSON.stringify(params)}`);

      const response = await axios.get(endpoint, {
        params,
        headers: { 
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "X-Atlassian-Token": "no-check",
          "User-Agent": "AskKAI-Proxy"
        },
        timeout: 15000
      });
      
      // V2 search returns results in 'results' array
      res.json(response.data.results || []);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const errorData = error.response?.data;
      let message = error.message;
      
      if (error.code === 'ECONNABORTED') message = "Connection timed out. Please check if the Confluence URL is accessible.";
      if (error.code === 'ENOTFOUND') message = "Confluence host not found. Please check the Base URL.";

      console.error(`Confluence Proxy Error (${status}):`, {
        message,
        url: error.config?.url,
        data: JSON.stringify(errorData)
      });

      res.status(status).json({ 
        error: message, 
        details: errorData,
        status 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
