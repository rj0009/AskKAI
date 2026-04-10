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
    const email = config?.jiraEmail || process.env.JIRA_EMAIL;
    const token = config?.jiraToken || process.env.JIRA_API_TOKEN;
    
    if (!baseUrl || !token) {
      return res.status(400).json({ error: "Jira not configured" });
    }

    try {
      const auth = Buffer.from(`${email}:${token}`).toString("base64");
      const response = await axios.get(`${baseUrl}/rest/api/3/search`, {
        params: { jql: `text ~ "${query}"` },
        headers: { Authorization: `Basic ${auth}` }
      });
      res.json(response.data.issues || []);
    } catch (error: any) {
      console.error("Jira Proxy Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/proxy/gitlab", async (req, res) => {
    const { query, config } = req.body;
    const baseUrl = normalizeUrl(config?.gitlabBaseUrl || process.env.GITLAB_BASE_URL || "https://gitlab.com");
    const token = config?.gitlabToken || process.env.GITLAB_ACCESS_TOKEN;

    if (!token) {
      return res.status(400).json({ error: "GitLab not configured" });
    }

    try {
      const response = await axios.get(`${baseUrl}/api/v4/search`, {
        params: { scope: "projects", search: query },
        headers: { "PRIVATE-TOKEN": token }
      });
      res.json(response.data || []);
    } catch (error: any) {
      console.error("GitLab Proxy Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/proxy/confluence", async (req, res) => {
    const { query, config } = req.body;
    const baseUrl = normalizeUrl(config?.confluenceBaseUrl || process.env.CONFLUENCE_BASE_URL || "");
    const email = config?.confluenceEmail || process.env.CONFLUENCE_EMAIL;
    const token = config?.confluenceToken || process.env.CONFLUENCE_API_TOKEN;

    if (!baseUrl || !token) {
      return res.status(400).json({ error: "Confluence not configured" });
    }

    try {
      const auth = Buffer.from(`${email}:${token}`).toString("base64");
      const response = await axios.get(`${baseUrl}/rest/api/content/search`, {
        params: { cql: `text ~ "${query}"` },
        headers: { Authorization: `Basic ${auth}` }
      });
      res.json(response.data.results || []);
    } catch (error: any) {
      console.error("Confluence Proxy Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.message });
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
