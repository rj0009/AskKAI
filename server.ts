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
    if (!baseUrl || !token || token.includes("MY_") || token.includes("TODO_")) {
      return res.status(400).json({ error: "Jira not configured. Please check your settings." });
    }

    try {
      const auth = Buffer.from(`${email}:${token}`).toString("base64");
      const response = await axios.get(`${baseUrl}/rest/api/3/search`, {
        params: { jql: query ? `text ~ "${query}"` : "order by created DESC" },
        headers: { 
          Authorization: `Basic ${auth}`,
          Accept: "application/json"
        }
      });
      res.json(response.data.issues || []);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const data = error.response?.data || { message: error.message };
      if (status !== 401 && status !== 403) {
        console.error(`Jira Proxy Error (${status}):`, data);
      }
      res.status(status).json(data);
    }
  });

  app.post("/api/proxy/gitlab", async (req, res) => {
    const { query, config } = req.body;
    const baseUrl = normalizeUrl(config?.gitlabBaseUrl || process.env.GITLAB_BASE_URL || "https://gitlab.com");
    const token = (config?.gitlabToken || process.env.GITLAB_ACCESS_TOKEN || "").trim();

    if (!token || token.includes("MY_") || token.includes("TODO_")) {
      return res.status(400).json({ error: "GitLab not configured. Please check your settings." });
    }

    try {
      // Use projects search as a connectivity test if query is empty
      const searchParams = query ? { scope: "projects", search: query } : { membership: true };
      const endpoint = query ? "/api/v4/search" : "/api/v4/projects";

      const response = await axios.get(`${baseUrl}${endpoint}`, {
        params: searchParams,
        headers: { "PRIVATE-TOKEN": token }
      });
      res.json(response.data || []);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const data = error.response?.data || { message: error.message };
      if (status !== 401 && status !== 403) {
        console.error(`GitLab Proxy Error (${status}):`, data);
      }
      res.status(status).json(data);
    }
  });

  app.post("/api/proxy/confluence", async (req, res) => {
    const { query, config } = req.body;
    const baseUrl = normalizeUrl(config?.confluenceBaseUrl || process.env.CONFLUENCE_BASE_URL || "");
    const email = (config?.confluenceEmail || process.env.CONFLUENCE_EMAIL || "").trim();
    const token = (config?.confluenceToken || process.env.CONFLUENCE_API_TOKEN || "").trim();

    if (!baseUrl || !token || token.includes("MY_") || token.includes("TODO_")) {
      return res.status(400).json({ error: "Confluence not configured. Please check your settings." });
    }

    try {
      const auth = Buffer.from(`${email}:${token}`).toString("base64");
      const response = await axios.get(`${baseUrl}/rest/api/content/search`, {
        params: { cql: query ? `text ~ "${query}"` : "order by created DESC" },
        headers: { 
          Authorization: `Basic ${auth}`,
          Accept: "application/json"
        }
      });
      res.json(response.data.results || []);
    } catch (error: any) {
      const status = error.response?.status || 500;
      const data = error.response?.data || { message: error.message };
      if (status !== 401 && status !== 403) {
        console.error(`Confluence Proxy Error (${status}):`, data);
      }
      res.status(status).json(data);
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
